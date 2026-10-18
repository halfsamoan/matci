# matci 최종 작업 계획

2026-10-18 · 포트폴리오 02 · **공개 자료·이미지 기반 조사와 1차 설계 완료, 구현 전**

## 1. 만들 제품

ASUS Vivobook 15 Pro / Ubuntu GNOME에서 RAM 상태와 정리 후보를 설명하고, 사용자가 선택한 창에 정상 종료를 요청한 뒤 상태 변화를 보여주는 로컬 도구다. Mac Mint의 메모리 관리 흐름을 참고하고, 사용자의 Archsport 노치 모션을 재사용한다. 사용자 지정 이름은 `matci`다.

원본이 하는 일을 먼저 바로잡는다. Release는 유휴 앱 종료이며 RAM 캐시를 마법처럼 비우는 기능이 아니다. 여러 Chrome 행은 탭별 제어의 증거가 아니다. Linux에서 입력이 뜸하고 CPU가 낮다는 이유만으로 미저장 문서·영상·다운로드·에이전트를 안전하다고 판정할 수 없다. 따라서 첫 버전은 **관측·후보 설명·수동 정상 닫기·재측정**, 자동 관리는 **알림만** 제공한다.

## 2. 확정 범위

| 우선순위 | 내용 | 완료 조건 |
|---|---|---|
| P0 / M1–M3 | 전체 RAM, PSS/RSS 구별, PSI, 앱 그룹, 보호 이유, 수동 창 닫기, 결과 기록 | 핵심 F01–F05/F08와 Linux P0 통과 |
| P0 / M1–M3 | 패널 아래 compact/expanded/event 노치, 설정, 모션 감소, 절전 복귀 | Archsport 모션·위치 계약 및 두 확장 동시 검수 |
| P1 / M4 | 읽기 디스크 분석, 기간별 추세, 폴더 정리 미리보기 | 파일 변경 없는 분석부터 완료 |
| P1 / M4 | 사용자 선택 범위의 이동/undo | 충돌·중간 실패·변경 원본 보호를 fixture로 증명한 뒤 실제 폴더 검수 |
| P2 / M5 | 설치 출처별 앱 제거 안내, 브라우저 확장 연동 검토 | GNOME·Snap/Flatpak·브라우저 권한 별도 설계 |
| 제외 | drop_caches, killall/SIGKILL, 자동 프로세스 종료, 세션/대화 압축·삭제 | 실행 경로를 제공하지 않음 |
| 제외 | 원본 브랜드/소스/비공개 API, macOS 전용 기능의 가짜 구현, 계정·결제·웹 호스팅 | 로컬 Linux 도구로 유지 |

## 3. 구조

```text
GNOME Extension (St/Clutter)
  ├─ Shell.AppSystem / WindowTracker / 현재 Meta.Window
  ├─ 노치·목록·선택 검토·정상 창 닫기 요청
  ├─ GSettings 변경 및 설정창(GTK/Adwaita) 진입
  └─ 소유 Python subprocess 1개
       stdout: versioned JSONL snapshots
       stdin: sample_now / record_app_view / record_receipt (행위 실행 명령 없음)
       ├─ stdlib /proc collector + 순수 policy
       └─ XDG state SQLite (시계열·작업 결과, 원시 argv 제외)
```

웹 프리뷰는 Windows에서 동작/모션을 보는 합성 데이터 시연이다. 실제 Windows 메모리나 앱을 제어하지 않는다. GNOME UI와 Python worker는 따로 구현하고 동일 fixture 계약을 공유한다. 시스템 앱 제어는 Extension의 현재 창 객체에서만 한다. 명령 문자열을 Shell에 넘기거나 PID 신호를 보내지 않는다.

MVP 메모리 목록은 확장 노치의 500×250 expanded 영역에 scroll view로 둔다. S03 설정은 GTK prefs의 GSettings, S05 기록은 worker가 원자적으로 만든 제한된 history-summary.json 읽기를 사용한다. GJS SQLite 바인딩이나 GTK의 DB 직접 조회를 MVP에 추가하지 않는다. GTK 창에서 앱 닫기를 실행하지 않는다. 별도 상주 서비스·웹 서버·독립 GUI IPC를 만들지 않는다.

Shell의 앱 매핑/분류는 `record_app_view`로 해당 sample_id에 연결해 worker에 저장한다. 전송 내용은 app ID·process key·분류/이유·보호 규칙뿐이며 window title·argv·명령은 없다. 보호 설정의 원본은 GSettings, SQLite protection_rules는 검증된 mirror다. 기본 보호 규칙은 worker와 Shell의 공통 사양으로 고정하고 사용자 mirror가 해제할 수 없다.

## 4. 정확성과 보호 계약

1. 전체 RAM 사용량은 `(MemTotal - MemAvailable) / MemTotal`; 계산 정의를 UI에 표시한다. `MemTotal > 0`, `0 <= MemAvailable <= MemTotal`을 검증한다. MemAvailable=0은 유효한 100% 사용 관측이다. 누락·음수·범위 초과는 error 또는 null이다.
2. 앱별 메모리는 PSS 우선, RSS fallback은 종류를 표시한다. 서로 다른 지표를 섞어 시스템 잔여 메모리를 산출하지 않는다. 그룹의 모든 프로세스를 읽지 못하면 partial과 coverage를 표시한다.
3. 마지막 상호작용 시각은 관측 신호다. 자동 선택 근거로 단독 사용하지 않는다. Shell 시각의 32비트 wrap과 절전 복귀는 baseline을 다시 잡는다.
4. 터미널·개발 도구·Shell·시스템·다른 UID·불명확 매핑은 보호한다. 앱 이름의 단순 문자열 매칭만으로 매핑/보호를 끝내지 않는다. 브라우저는 기본 미선택, 작업 손실 가능성과 전체 창 영향을 검토 단계에서 알린다.
5. 닫기 전 identity snapshot 유효기간(정책 초안 5초), generation, UID/PID/starttime, 현재 Shell app/window 집합을 재확인한다. 각 지표에는 별도 observed_monotonic_ms/age_ms가 있다. 10초 주기의 PSS가 오래됐으면 추정 표시를 붙이며 닫기 가능성을 그 수치로 판정하지 않는다. 매핑 불확실·PID≤0·보호 상태·창 변경은 요청을 거부하고 다시 읽는다. 샘플의 PID를 직접 signal 대상으로 쓰지 않는다.
6. `Meta.Window.delete(current_event_time)`는 정상 닫기 요청이다. 요청 반환값을 앱 종료 완료로 기록하지 않는다. 앱 단위 검토에서 현재 해당 앱의 모든 대상 창을 제시하고, 새 창이 생기면 재검토한다. 선택한 창만 닫았을 때 백그라운드 프로세스가 남을 수 있다.
7. 미저장 대화상자의 취소·잔존 창·프로세스 잔존·응답 지연을 구별한다. 10초 관측 창 후 미완료면 timeout/partial, 강제 종료로 승격하지 않는다. 이 시간은 제품 정책이며 OS 보장값이 아니다.
8. 결과는 전후 MemAvailable 차이의 관측값이다. 다른 작업 영향이 있으므로 특정 앱에서 회수한 양이라고 단정하지 않는다. 음수 차이는 그대로 표시하며 0으로 잘라 성과를 부풀리지 않는다. PSS 합계를 “확보 가능”으로 표시하지 않는다.
9. 현재 대상 재확인→requested receipt와 items 영속 저장/ack→마지막 창 집합 재확인→정상 닫기 요청→observing→최종 결과 순서를 지킨다. ack 전에 실제 닫기를 요청하지 않는다. ack 뒤 대상이 바뀌면 rejected로 끝낸다. worker/Shell 중단 뒤 미완료 receipt는 partial 및 INTERRUPTED 이유로 마감하고 종료 요청을 자동 재실행하지 않는다.

## 5. 노치와 동시 사용

GNOME은 Archsport 실제 구현의 compact 360×46, expanded 500×250, 320ms EASE_OUT_CUBIC, 아래쪽 radius 26, 패널 높이만큼 내려 배치하는 동작을 기준으로 삼는다. 웹은 원본 프리뷰의 compact 336×46, expanded 460×224, event 460×144와 420ms 곡선을 유지한다. 두 환경의 차이를 숨기지 않는다. 상세 발췌와 출처 해시는 `replica/design/archsport-motion.json`에 있다.

Archsport를 함께 사용하는 사용자를 위한 기본 슬롯 정책:

- 중앙은 Archsport 우선. matci 단독이면 중앙을 사용한다.
- Archsport 활성 시 matci는 중앙 왼쪽, 패널 아래 같은 Y에 배치한다. **두 actor의 실제 allocation과 좌우 12 logical px 간격이 확보될 때만** 보조 노치를 보인다.
- expanded 상태가 겹치거나 모니터 폭이 부족하면 matci를 패널 아이콘으로 축소하고, 클릭 시 검토 목록을 연다. 열린 상대 노치 위에 그리지 않는다. 상대 actor 발견 실패/버전 불일치에도 패널 아이콘 fallback을 사용한다.
- 자동 이벤트는 포커스를 빼앗지 않는다. 상세창을 사용자가 연 경우만 focus와 Escape 복귀를 관리한다.
- 초기 구현은 알려진 Archsport 확장 UUID/actor 상태를 읽는 호환 어댑터다. 메모리 worker와 연관시키지 않는다. 감지와 배치가 실기에서 안정적이지 않으면 중앙 동시 표시를 금지한 상태로 출시한다.

Archsport 원본 수정이나 공유 노치 관리 서비스는 이 계획의 필수 작업이 아니다. 두 프로젝트를 따로 설치·해제할 수 있어야 한다.

## 6. 단계별 작업 순서

| 단계 | 파일/화면/흐름 | 산출물 | 검수 및 다음 단계 진입 기준 |
|---|---|---|---|
| M0 현재 | `replica/*`, S01–S08/F01–F08 분석 | 출처, 기능표, 계약, 최종 계획 | 조사 한계·미구현 상태 명시, schema/token 검사 |
| M1 Windows 시연 | `matci/model.py`, `procfs.py`, `policy.py`, `data/`, `tests/`, `web/`; S01–S04 | procfs fixture parser, 보호 정책, synthetic preview, compact/expanded/event | 누락/권한/경합/단위·PID 0·미지 매핑 테스트. 웹 390/1440, 키보드, 모션 감소. 실제 앱 제어 없음 |
| M2 Linux 읽기 흐름 | `extension/extension.js`, `prefs.js`, schema, `matci/__main__.py`; F01/F02/F05 | read-only worker 1개, 창 매핑·노치·설정 | 실제 GNOME 버전 확인 후 API 구현. 메모리 지표·125/150%·절전·재시작·동시 노치 P0 통과 |
| M3 정상 닫기와 기록 | `actions.js`, `store.py`, `receipts.py`; S02/S03/S05, F03/F04/F08 | 대상 검토, 창 닫기, observed delta, SQLite receipts, 제안 알림 | 테스트용 disposable GUI 앱에서 닫기/취소/잔존 검수. 일상 앱 자동 종료 없음. 개인 일상 사용은 이 단계 이후 |
| M4 저장공간·추세 | `disk.py`, `organize.py`; S05–S07, F06/F07 | 읽기 스캔→이동 미리보기→검증된 이동/undo 순으로 | 사용자 선택 root만, symlink 탈출/덮어쓰기/권한·디스크 full·중단 복구 테스트. 실제 개인 파일을 fixture로 사용하지 않음 |
| M5 후속 | S08, 브라우저 선택 연동, 배포 정리 | apt/snap/flatpak 안내, 필요 시 별도 Chrome extension 설계 | 사용자가 범위를 정한 뒤 구현. 탭 discard는 공개 Extension API+Native Messaging 경로. 계정/클라우드 불필요 |

M1부터 M3까지 먼저 완성한다. 모든 화면을 빈 껍데기로 만드는 것보다 F02/F03 한 흐름을 실제로 검증하는 순서다. 파일 트리는 예정이며 현재 존재한다고 오해하지 않는다.

## 7. 테스트와 성능 목표

핵심 fixture는 missing MemAvailable, RSS only, PSS 일부 누락, PSI 부재, 프로세스 소멸, PID 재사용/0, 재부팅 boot_id 변경, Shell focus wrap, 복귀 baseline, Chrome 다중 프로세스, Snap/Flatpak 불명확 매핑, 보호 앱, 중복 클릭, 미저장 취소다. 기대 결과는 `replica/test-plan.md`에 있다.

활성 sample 2초, 축소 5초, smaps_rollup 10초/동시 20개 상한을 초기 정책으로 둔다. 비용이 크면 detail 열린 앱만 세부 수집한다. 30분 실기에서 확장+worker 추가 CPU 평균 1% 미만, RSS 80MiB 미만을 **측정 목표**로 잡고 부하 근거로 조정한다. 통과한 성능 수치가 아니다. 숨김·잠금 시 샘플을 줄이고 resume 후 과거 알림을 재생하지 않는다.

Auto Care 제안 기본 정책 초안: RAM 85% 이상 30초 지속 시 제안, 75% 아래에서 재무장, 10분 cooldown. PSI는 별도로 표시·기록하되 대상 장치에서 검증 전 자동 트리거 조합으로 확정하지 않는다. “메모리 높음=문제”라고 단정하지 않는다. 사용자 threshold와 duration 설정을 검증하고 재시작·시계 변경 시 monotonic 정책을 재설정한다.

## 8. 릴리스 조건

M3 핵심 must 기능 완료, 단위 테스트·strict schema·Ubuntu 실기 P0·모션/두 노치 동시 검수 통과, 열린 S1/S2 없음. 사용자 상태와 진단을 제외한 버전 고정 패키지를 만든다. 공개 배포는 이 요청의 범위가 아니다. 실제 릴리스 점검표는 `replica/deploy.md`.

남은 미확정은 실제 GNOME 버전, Snap/Flatpak 구성, 메모리 읽기 권한, 패널 확장 조합, 장치 성능이다. 이들은 M2에서 측정해 결정한다. 원본 바이너리 내부 구현이나 유료 계정이 없어도 M1은 시작할 수 있다.
