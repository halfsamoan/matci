# 검증 기록

## 디자인 V2 — 2026-10-18 추가 검증

- Windows Python44개:42통과/2POSIX·symlink skip. WSL Ubuntu22.04 Python3.10:44/44. Launcher 업그레이드→pre-GTK rollback과 사용자 바로가기 보존2개 검증을 추가했다. 기존 core 안전 정책은 유지했다.
- Node20/20: 기존15+sender/nonce/expiry/disconnect/선택 검증/공개 projection/입자 상한·모션 감소·signed delta5개. JS→실제 Python Worker 통합도 포함한다.
- GJS1.72 세션 D-Bus 실제 transport: GetState/Review/다른 sender Confirm 거부/원 sender Confirm 통과. 창 행위는 fake이며 실제 앱을 닫지 않았다.
- GTK4.6 실제 WSL/Xvfb 렌더+popover 토글·92% slider→GSettings memory 검증 통과. `tools/smoke_gtk.py --capture`, G_DEBUG=fatal-criticals, GDK_BACKEND=x11/GSK_RENDERER=cairo. 초기 Korean 폰트 부재는 WSL에 Noto CJK 설치로 해결했다. 고정 footer 변경에서 발생한 GtkBox 높이 협상 경고는 footer 줄바꿈을 명시해 제거했고 fatal-criticals 검사로 재확인했다.
- Chromium1440/390: popover·92%·앱 선택/확인·검토 중 골 대기·+612MiB 합성 결과·기록·모션 감소·offline/empty/partial·모든 앱 아이콘 로드·mobile 가로overflow0·팝오버 화면 안 배치 통과. 콘솔 오류/경고0. mobile rail의 이전 display:block 상속 오류를 수정했다.
- 디자인 대비17/17 AA, 최소6.17:1. allowlist ZIP은25개 runtime 파일(app 포함). 공식 Chrome/VS Code 및 Tango 테마 자산은 provenance와 권리 안내를 동봉하고 원본 Mint 자산은 사용하지 않았다.

큰 GTK 창은 확장 소유 CloseController에 연결한다. 새 worker·daemon·PID 종료 API가 없다. demo/smoke의 설정도 메모리에 격리한다. 수동 diff scan에서 bridge 수명, sender 바인딩, stale 메모리 null, 요청 재검증, 패키지 제외와 launcher 경로를 확인했다. 별도 다중 에이전트 검토는 재호출하지 않았다.

실제 ASUS GNOME의 D-Bus→현재 Meta.Window 정상 닫기/저장 취소, 설치 앱 아이콘, 앱 launcher 업그레이드, 잠금·배율·절전·노치 동시 검수는 여전히 미실행이다. WSL GTK 렌더를 GNOME Shell 통과로 세지 않는다. Disk/Organize/제거 및 기간별 영속 추세는 미구현이다. REA 원본 binary 분석도 추가 수행하지 않았다.


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
