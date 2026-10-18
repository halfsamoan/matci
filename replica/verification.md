# 검증 기록

## 2026-10-18 Ubuntu 26.04.1 사용자 세션 적용

- ASUS Vivobook M6500QC, GNOME Shell 50.1, Wayland, eDP-1 논리 1728×972를 확인했다.
- 이 Ubuntu에서 Python 42/42, Node 15/15, GSettings schema strict dry-run을 통과했다. worker smoke는 실제 `/proc`에서 live/partial, 유효한 메모리 수치, PSI available을 보고했다. GNOME 화면 검증과 다르다.
- 재활성화 시 배치 상태를 초기화한 버전 2를 먼저 설치하고 자동 시작 목록에 UUID를 추가했다. 재로그인 후 GNOME50.1에서 `ACTIVE`와 기본 노치 표시를 확인했다. P0-01의 버전/활성 상태만 확인됐으며 P0-02–15는 각 조건별 검수가 남았다.

### 재로그인 후 초기 화면 진단

- 두 확장은 GNOME Shell 50.1에서 `ACTIVE`로 로드됐고 사용자 스크린샷에서 패널 아래 두 노치가 보였다. Archsport worker 1개는 키 없음 상태를 표시했다.
- matci는 첫 snapshot을 SQLite에 저장했지만 곧 종료를 반복해 노치에 `—`가 남았다. 동일한 GJS 1.88.0 환경에서 `TextDecoder.decode(chunk, {stream: true})`가 `stream option` 미지원 오류를 내는 것을 재현했다. worker 출력은 `ensure_ascii=True` JSON이므로 chunk별 기본 decode로 수정했다.
- upgrade 중 이전 설치를 확장 스캔 경로에 임시 폴더로 남겨 Shell 로그에 UUID 불일치 오류가 발생했다. 설치 스크립트가 성공 후 해당 폴더를 상태 백업 경로로 옮기도록 수정했다.
- 수정본 버전 3을 설치했다. GJS가 43,023바이트의 실제 live snapshot(127개 프로세스, 유효한 메모리 비율)을 여러 chunk에서 읽고 JSON으로 파싱하는 별도 probe는 통과했다. 현재 Shell은 메타데이터 버전 2를 캐시하고 재로드 DBus 메서드가 구현되지 않아, 버전 3의 실제 노치/worker 수명은 다음 로그인 후 확인해야 한다.

## 구현 후 최신 결과 — 2026-10-18

| 실행 | 실제 결과 | 검증 범위 |
|---|---|---|
| Windows `python -m unittest discover -s tests -v` |42개 중40통과/2POSIX·symlink skip | stdlib core·protocol·SQLite·패키징 |
| WSL Ubuntu22.04 / Python3.10 같은 명령 |42/42통과 | POSIX 권한·심볼릭 링크 거부 포함 |
| `node --test tests/dock.test.mjs tests/native-actions.test.mjs tests/native-worker.integration.test.mjs` |15/15통과 | geometry/보호/입력시각/닫기 gate + 실제 JS→Python Worker→임시SQLite |
| WSL strict schema dry-run |exit0 | GSettings XML만. GNOME UI 호환성 아님 |
| Windows `tools/smoke_worker.py` |demo/health ok/합성6프로세스 | 실제 OS 제어 없음 |
| WSL `tools/smoke_worker.py` |live/health ok/5프로세스/PSI available | WSL 실제 `/proc` 읽기, ASUS 목표 장치 아님 |
| `tools/package_extension.py` |19개 allowlist runtime 파일 ZIP | 사진·DB·진단·웹 참고자료 제외, schema는 설치 때 compile |
| 계획 무결성·대비 |JSON/CSV/링크/이미지해시/SQLite 초안 통과,13/13 AA | 디자인 제안 수치, UI 전체 접근성 인증 아님 |

Playwright CLI로 Chromium에서1440×1000/1100 및390×844를 실제 조작했다. 앱 선택→검토 확인→합성 닫기 결과/기록, 검토 중 Alt+G 골 대기, 좁은 화면 companion 전환(활성 폭366/x12), 모션 감소 transition0s, body scrollWidth=390을 확인했다. partial은 RSS 대체 안내, offline은 수치없음/닫기 비활성, empty는 후보없음/닫기 비활성을 확인했다. 콘솔 오류0·경고0. 화면은 `docs/screenshots/`에 합성 시연으로 보관한다.

proof-first: core 초기 missing module, package 초기 missing module, dock 초기 missing module 실패를 먼저 관측했다. 부모 통합 검수에서 연속 sample_now 요청이250ms 제한과 충돌함을 발견해 requested ack 후300ms 재검증 대기를 추가했고, 실제 worker 연결 테스트로 검증했다. 간소화에서는 상한 상수 재사용·미사용 import/중복 가드 제거·기록 요약 N+1 조회를 일괄조회로 개선했다. 보호 조건과 proof 테스트는 보존했다.

**실제 ASUS Ubuntu GNOME P0-01–15는 전부 미실행.** 실제 창 닫기/저장 취소/노치 동시 animation/배율/절전/lock/성능/로그인 자동 시작을 통과로 기록하지 않는다. 앱 점유는 현재 창 PID에 귀속된 관측값이며 Chrome 전체 자손/탭 메모리로 보장하지 않는다.

### 최종 소스 검토와 공개 범위

`Code review: skipped (ce-code-review unavailable)` — 실제 검토 호출(run `20261018-809e4bfd`)이 사용량 한도로 종료되어 완료 receipt를 받지 못했다. cross-model 작업은 jq 부재로 검토를 실행하지 않았고 결과가 없었다. 추가 유료/반복 호출 없이 종료된 작업 디렉터리를 정리했다. 이를 검토 통과로 세지 않는다.

수동 diff scan은 창 닫기 전 저장 ack·재검증, JSONL 입력 상한, UID·저장 권한·단일 worker, 상태/패키지 제외 목록, 노치 우선순위와 해제 수명, 기존 Archsport 변경을 확인했다. 공개 업로드를 막는 확인된 결함은 발견하지 않았다. 네이티브 accent를 승인된 amber로 맞추고 긴 상태 문구를 scroll 영역에 넣어 하단 조작부의 공간을 보존했다. 실제 GNOME 배치 검수는 여전히 필요하다.

사용자의 후속 지시로 두 앱은 독립된 **공개 GitHub 저장소**로 유지한다. matci의 공개 소스 MVP와 Archsport 공존 변경을 게시하며, 참고 사진은 연구 자료로만 남고 설치 ZIP에는 없다. 로컬 DB·세션·진단·환경은 게시하지 않는다. M4/M5와 목표 장치 검수는 완료 범위에 포함하지 않는다.

## 초기 M0 기록 — 아래는 구현 전 시점

2026-10-18 / Windows. 계획 산출물의 검사 결과는 아래에 추가한다. 실제 앱·GNOME 검수와 구별한다.

- 원본 공개 자료: sources.md의 페이지와 사용자 이미지 참조. 원본 앱 실행은 하지 않음.
- REA doctor: CLI 6.5.0 / skill42, Codex 등록 missing/config_drift, exit1. 설정 변경 없음. 원본 REA Evidence 없음.
- 설계 무결성: `rtk proxy python tools/verify_planning.py` exit0. JSON/CSV 파싱, 로컬 Markdown 링크, 참고 이미지6개 SHA256, 기능표24행 고유성/상태 검사 통과.
- SQLite: in-memory 초안5테이블 생성, foreign keys 활성 확인. 잘못된 total/available/orphan/metric/builtin 보호/observed delta 입력6건 거부, cascade·SET NULL·음수 변화량·FK consistency 검사 통과. 실제 사용자 DB 생성 없음. store 권한 검사나 OS 제어 검증이 아님.
- 디자인 대비: replica-design의 `contrast.py` exit0, 제안 조합 **13/13 AA 통과**, 최소 비율5.52:1. 결과는 `design/contrast-report.json`, CSS 초안은 `design/tokens.css`. 실제 UI·focus·배율 검증이 아님.
- parity: replica-diff의 `parity.py` exit0, **0.0/100, 원본 must 0/6**, 원본 비교13행. `parity.md`에 도구 결과 저장. 추가 matci 요구는 별도 행이며 점수에서 빠지므로 최종 P0 검수를 따로 적용한다. 도구 exit0은 제품 출시 가능 판정이 아니다.
- 앱 단위 테스트/E2E/GNOME/schema compile/정상 앱 닫기/절전/배율/성능: **모두 미실행**.

노치 source manifest는 사용자 Archsport 파일 hash와 발췌이며 GNOME 작동 통과 증거가 아니다. 사진은 참고 전용으로 저장하고 제품 패키지에서는 제외한다.

Linux 기술 조사와 아키텍처의 독립 검토에서 지표별 freshness, 앱 view 저장 경로, 보호 규칙 원본, 요청 전 receipt ack, 중단 기록 처리를 보완했다. 이 검토도 앱 실행 검수로 세지 않는다. 설계 검증 명령은 표준 라이브러리만 사용하므로 Linux에서 `python3 tools/verify_planning.py`로 반복할 수 있다.

## 2026-10-18 overlay·레이아웃 업데이트

- Archsport와 공유 배치에서 작업영역 예약 actor를 제거했다. 노치는 기존 앱 창을 밀지 않는 chrome 오버레이이며 빈 배경은 click-through다. 앱 목록 길이와 경기 데이터에 따라 높이를 측정하고 아이콘·짧은 상태 표시를 사용한다.
- 버전 6 파일을 사용자 확장 경로에 설치했다. GNOME 50.1은 프로세스 안에서 이전 버전 5를 유지했고 D-Bus `ReloadExtension`은 `UnknownMethod: not implemented`였다. 재활성화 시 이전 status-area role 충돌로 현재 `matci@local`이 `ERROR`가 됐다. 소스에는 status-area 항목 정리 방어 코드를 추가했지만, 현재 Shell 캐시 때문에 아직 실행되지 않았다.
- matci Python 42/42, Node test 15/15, JS syntax, strict schema dry-run 통과. GNOME 50.1의 새 코드 렌더링·click-through·창 좌표 검수는 다음 세션에서 남아 있다. 현재 세션을 로그아웃하거나 Shell 재시작하지 않았다.
