# matci Linux 인수인계

2026-10-18 Asia/Seoul. 다른 채팅이나 Windows 서버 없이 이 저장소만으로 이어간다.

## 사용자 결정과 구현 상태

- 두 번째 포트폴리오 **matci**. 개발은 Windows, 사용할 장치는 **ASUS Vivobook 15 Pro / Ubuntu GNOME**.
- Mint for Mac의 메모리 확인·유휴 후보 검토·정상 종료 흐름을 새로 구현한다. 사진의 음악 창·Instagram·터미널 명령은 대상/지시가 아니다.
- 사용자 후속 요청으로 M1–M3 메모리 MVP와 Archsport 공존 소스를 구현했다. 원래 계획은 `IMPLEMENTATION_PLAN.md`에 보존하고 현재 상태는 이 문서를 따른다.
- Python stdlib core, GNOME Extension→subprocess1개. 자동 종료/강제 종료/캐시 강제 비우기 없음. Auto Care는 기본 꺼진 제안 모드다.
- 두 노치는 패널 아래 중앙 그룹. 하나만 펼침, 수동100/경기80/메모리 제안30. 좁으면 활성 노치를 유지하고 보조는 패널 버튼으로 접근한다. 왼쪽 고정 슬롯 초안은 이 구현으로 대체했다.
- 디스크·폴더 이동/undo·패키지 제거·브라우저 탭 제어는 후속이다. 작동하는 것처럼 표시하지 않는다.

## 실제 파일

| 경로 | 역할 |
|---|---|
| `matci/procfs.py` | 동일 UID `/proc`, PSS/RSS·나이, CPU delta, PSI, PID/UID 재검증 |
| `matci/policy.py` | 기본 보호, 자손 작업, 불완전 관측 unknown |
| `matci/worker.py`, `__main__.py` | bounded JSONL, session/sample/request 검증, OS 제어 없음 |
| `matci/store.py`, `migrations/001_initial.sql` | SQLite, 단일 worker lock, UID 권한, retention, 중단 기록 |
| `extension/extension.js` | Shell 앱/창 매핑, 노치/worker 수명/설정/절전 |
| `extension/actions.js`, `policy.js` | 수동 검토, 저장 ack 후 재검증, 정상 닫기, 결과 관측 |
| `extension/dockModel.js`, `notchDock.js` | Archsport와 같은 버전의 공유 배치/우선순위 |
| `extension/prefs.js`, `schemas/` | GTK/Adwaita 설정·보호 목록·로컬 요약 기록 |
| `data/demo-snapshots.json`, `web/` | 합성 시연. 실제 창 token을 만들지 않음 |
| `tools/install_extension.py`, `package_extension.py` | staging/strict compile/backup/rollback, allowlist 패키지 |

상태 기본 경로는 `~/.local/state/matci/state.db`와 `history-summary.json`, XDG_STATE_HOME 설정 시 그 아래다. 디렉터리0700/파일0600, 원시 argv·문서 제목·환경은 저장하지 않는다. 설정은 `org.gnome.shell.extensions.matci`, 설치 UUID는 `matci@local`. 요약은120KiB 이하, GTK는 DB를 직접 열지 않는다.

## 검증된 것과 아닌 것

Windows/WSL 단위 테스트, Node geometry·보호·닫기 컨트롤러, 실제 JS→Python Worker→임시 SQLite 통합, WSL strict schema compile, WSL 실제 `/proc` read-only smoke, Windows 브라우저390/1440 검수를 실행했다. 최신 수와 결과는 `replica/verification.md`를 따른다.

**실제 GNOME46/50 enable/disable·Meta.Window 정상 닫기·미저장 취소·절전·배율·Archsport 동시 표시·성능은 미검증이다.** WSL 수집 성공은 ASUS Ubuntu GUI 검수 통과가 아니다. metadata46/50도 검수 대상 선언이다.

## Linux 첫 실행

```bash
gnome-shell --version
printf '%s\n' "$XDG_SESSION_TYPE"
python3 tools/doctor.py --output local-diagnostics/doctor.json
python3 -m unittest discover -s tests -v
glib-compile-schemas --strict --dry-run extension/schemas
python3 tools/smoke_worker.py
```

확장 활성 중 같은 기본 state로 CLI worker를 동시에 켜지 않는다. 독립 진단은 별도 `--state-dir`을 사용한다.

```bash
sudo apt install python3 libglib2.0-bin gnome-shell-extension-prefs
python3 tools/install_extension.py
```

로그아웃·로그인 후 `gnome-extensions enable matci@local`, 설정은 `gnome-extensions prefs matci@local`. 업데이트는 `--upgrade`, 복구는 `--rollback`. matci UUID만 교체하며 backup과 실패 staging을 보존한다. systemd 서비스는 만들지 않는다.

Archsport도 최신 공존 버전을 설치한다. `DUAL_NOTCH.md` 참조. 켜는 순서를 바꾸고 하나씩 disable/enable하여 등록/해제·중앙 복귀를 검사한다.

## 실제 장치 P0

`replica/test-plan.md` P0-01–15를 장치/GNOME/Wayland/배율/실행일/증거와 함께 기록한다. 먼저 read-only 수치와 패널 위치, 두 노치 토글을 확인한다. 정상 닫기는 버릴 수 있는 테스트 GUI 앱에서 시작하고 문서 저장 취소도 확인한다.

관련 오류만 비밀을 제거해 `local-diagnostics/`에 기록한다. 전체 journal·환경 덤프·세션·DB를 GitHub에 넣지 않는다. 실패를0%나 성공으로 바꾸지 않는다.

REA는 초기 CLI 연결 진단까지이며 원본 binary/runtime Evidence는 없다. 공개 문서와 사진으로 행위를 분석했고 원본 코드는 복제하지 않았다. REA setup/엔진 설치는 현재 앱 실행의 의존성이 아니다.
