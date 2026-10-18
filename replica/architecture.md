# matci 아키텍처

선행 근거: `recon.md`의 S01–S08/F01–F08과 `features.csv`. 이 문서는 원본 구조의 복구가 아니라 Linux용 새 설계다.

## 기술 선택

| 계층 | 선택 | 이유 |
|---|---|---|
| 데스크톱 표면 | GNOME Shell Extension / GJS St·Clutter | Archsport와 같은 노치, Shell 창 API 접근 |
| 설정·기록 조회 | GJS GTK4/Adwaita prefs | GSettings와 worker가 만든 비밀 없는 요약 JSON 읽기. GJS SQLite 바인딩은 불필요 |
| 수집·정책 | Python 3 표준 라이브러리 | `/proc`, json, sqlite3, pathlib, time, unittest로 충분 |
| 상태 | SQLite 1개 + GSettings | 계정 없는 단일 UID 도구. schema.sql은 초안 |
| 연결 | 소유 subprocess stdin/stdout JSONL | 별도 서비스·인증·소켓 불필요. Extension이 lifecycle 소유 |
| Windows 시연 | HTML/CSS/JS + 합성 fixture | 실제 OS 제어와 분리, 사용자 노치 프리뷰 재사용 |
| 로그인/결제/메일/웹 호스팅 | 없음 | 개인 로컬 앱의 범위에 불필요 |

GTK prefs의 기록은 worker가 원자적으로 갱신한 제한된 history-summary.json을 읽는 방식으로 확정한다. 이 파일은 사용자 상태 디렉터리에만 있고 공유 저장소에 넣지 않는다. 프로세스 argv·문서 제목은 포함하지 않는다.

## 책임 경계

`procfs.py`: 동일 UID 프로세스·전체 RAM·PSI 관측, 파일 읽기 경합 허용.
`policy.py`: 순수 분류/후보 설명, “안전” 보장하지 않음.
`store.py`: 샘플·receipt 저장, migration version/retention.
`__main__.py`: watch loop, JSONL, 입력 command validation, 제한된 기록 저장.
`extension.js`: 연결/세대 관리/노치/이벤트, Shell.AppSystem 기반 앱 매핑.
`actions.js`: 현재 창 재확인→검토→정상 닫기→관측. Python에는 앱 종료 명령을 두지 않음.
`prefs.js`: GSettings·보호 앱·진단 요약/기록 읽기. 직접 프로세스 제어 금지.

같은 UID의 앱 ID 매핑도 완벽하지 않다. window ID/token, Shell app ID, desktop ID, PID/starttime/boot_id를 분리 보관하고 confidence를 명시한다. PID 단독으로 프로그램 신원을 확정하지 않는다. Snap/Flatpak·Chrome process group을 단순 PPID 합계로 확정하지 않는다. 중복 프로세스 키는 한 번만 계산한다.

## 로컬 메시지/API 계약

HTTP route는 **0개**. 별도 IPC daemon은 없다. 현재 OS 사용자가 실행하는 부모/자식 파이프와 UI 핸들러만 존재한다.

| API | 허용 호출자 | 입력 | 출력 | 흐름 |
|---|---|---|---|---|
| CLI `python3 -m matci --watch` | Extension | sampling/settings 값, 비밀 없음 | stdout snapshot JSONL | F01/F02 |
| CLI `--once` | 로컬 진단 사용자 | read-only 수집 | snapshot 하나 | F02 |
| CLI `--replay PATH` | 시연 | 명시적 fixture | mode=demo snapshots, 실제 제어 없음 | F01 |
| stdin `sample_now` | 소유 Extension | protocol/request_id | 새 snapshot | F02/F03 |
| stdin `record_app_view` | 소유 Extension | 현재 sample_id, app ID/process keys/분류/이유, GSettings 보호 목록 | 검증 후 앱 관측과 보호 mirror 저장 ack | F02/F05/F08 |
| stdin `record_receipt` | 소유 Extension | action_id/status/metric observations | ack와 저장된 receipt 요약 | F03/F08 |
| UI `review_close` | 명시적 사용자 입력 | 현재 app/window token + sample_id | 재검증 또는 review | F03 |
| UI `confirm_close` | 검토 화면 사용자 | one-shot review generation | 요청 결과·재측정 | F03 |
| GSettings change | prefs | validated policy | debounce 재수집/재시작 | F04/F05 |

stdin 명령은 주어진 좁은 스키마만 처리한다. 파일 경로·Shell 명령·PID signal·종료 동작을 실행할 수 없다. JSONL max 256KiB/line, stderr에는 비밀 없는 진단만, 잘못된 입력은 error 응답으로 한정한다. process max 256, UI app rows max 100, 초과는 truncated flag. 명령별 request_id·action_id 중복을 거부/재사용해 이중 기록을 방지한다.

`record_app_view`는 현재 세션의 실제 sample에 포함된 process keys만 참조할 수 있다. metric은 worker가 가진 관측값으로 계산하고 UI가 임의로 보낸 bytes를 저장하지 않는다. 불완전·혼합 지표는 partial/unknown으로 남긴다. GSettings가 사용자 보호 설정의 유일한 원본이며 protection_rules는 기록용 mirror다. builtin은 worker의 고정 목록에서 seed하고 사용자 입력으로 수정할 수 없다. 설정 변경 때 전체 사용자 보호 목록을 bounded 메시지로 동기화하되 DB mirror가 Shell 실행 정책을 덮어쓰지 않는다.

snapshot 최소 예시는 `contracts/snapshot.example.json`이다. 실제 metric 부족을 0으로 채우지 않는다. 전체 health ok와 앱 coverage partial은 공존할 수 있다. 지표별 observed_monotonic_ms/age_ms를 보존해 PSS 수집 주기와 창 신원 재확인 시각을 혼동하지 않는다. boot_id와 start_ticks를 포함해 재부팅·PID 재사용을 구별한다. session token은 실행마다 새 값이며 다른 실행의 UI 토큰을 재사용하지 않는다.

## 저장 구조

초안 테이블 **5개**: memory_samples, app_observations, protection_rules, action_receipts, action_items. 각 테이블에는 owner_uid, UTC timestamp 또는 표본의 boot_id/monotonic 정보가 있다. 읽기는 현재 UID, 디렉터리 0700·파일 0600. 권한과 owner_uid 검사는 모두 적용한다. SQLite는 로컬 파일이므로 Postgres UUID/RLS/클라우드 auth를 억지로 도입하지 않는다. 식별자는 uuid4 문자열, UTC ISO8601 시간으로 생성한다.

상태: `$XDG_STATE_HOME/matci/state.db` (기본 `~/.local/state/matci/`), 설정: `org.gnome.shell.extensions.matci`, 확장 UUID: `matci@local`. 기본 보존은 상세 샘플 24시간/분 단위 집계 후속, receipts 30일/최대 1000개, 사용자 지우기. DB·history summary는 로컬 전용이다. 아직 migration 적용이나 사용자 DB 생성은 하지 않았다.

## 수명·오류

enable 시 worker 1개, disable 시 cancel/child 정리/actor·signals·timer 모두 제거. generation으로 늦은 read callback 무시. EOF/crash는 5→10→20→40→60초 capped backoff, 정상 연속 관측 뒤 reset. sleep 전 worker 정리, resume 새 baseline. 잠금/overview/fullscreen은 숨김 정책을 따르고 복귀 때 중복 actor가 없어야 한다. 강제 종료는 **소유 worker** 정리에만 쓰며 관측 대상 앱에 쓰지 않는다.

행위는 requested receipt+items commit/ack 뒤에만 시작한다. 기록 실패 시 닫지 않는다. 재시작에서 requested/observing 잔여 기록은 partial 및 item reason_code=INTERRUPTED로 마감한다. 해당 앱을 자동으로 다시 닫거나 완료로 추정하지 않는다. 저장을 기다리는 동안 바뀐 현재 창 집합을 마지막으로 다시 검증한다.

큰 범위의 /proc 접근 실패는 partial/error, 마지막 값에는 stale 표시. PSI 부재는 unsupported이며 health error와 구별한다. 앱 종료/읽기 권한 경합을 빈 정상 프로세스로 변환하지 않는다. 네트워크는 필요 없다.

## 주요 위험과 작업 순서

위험 1은 실제 앱/창/프로세스의 불명확 매핑, 위험 2는 닫기 취소·작업 손실, 위험 3은 메모리 관측값을 확보 보장량으로 표현하는 오류다. M1 parser와 순수 정책→M2 읽기 통합→M3 disposable 앱 정상 종료로 좁혀 검증한다. S06/S07의 파일 이동은 M4 별도 설계/트랜잭션이므로 현 schema에 빈 테이블을 미리 추가하지 않는다.
