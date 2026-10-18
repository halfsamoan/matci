# matci Linux 인수인계

작성: 2026-10-18 Asia/Seoul. 이 폴더만으로 다음 작업을 이어간다.

## 사용자 범위

두 번째 포트폴리오 `matci`. 사용자는 Archsport 옆 `C:\Users\k\Documents\ChatGPT\matci`에 준비하는 제안에 `ㄱㄱ`로 답했다. 이 경로는 개발 위치일 뿐 Linux 실행 의존성이 아니다. Codex 앱의 별도 프로젝트 등록이나 새 채팅 생성은 수행하지 않았다.

현재 요청의 도착점은 앱 정체 확인부터 최종 구현 계획까지다. 모든 replica 스킬과 REA를 검토·적용했고 구현·배포 단계는 실행 가능한 후속 계획으로 정리했다. 앱 구현, GNOME 확장 설치, 프로세스 종료, 파일 정리, 배포는 아직 하지 않았다.

계획 파일 자체는 `python3 tools/verify_planning.py`로 검사할 수 있다. Windows에서 JSON/CSV/링크·이미지 해시·SQLite 초안 제약 검사를 통과했다. 디자인 제안 조합13개 AA 통과, 앱 기능표는 구현 전0/100이다. 실제 앱 검수 통과와 구별한다.

## 확인된 대상과 결정

- 사진의 주 대상: **DZG Studio LLC의 Mint for Mac**, 특히 Memory 화면. macOS 기본 앱이나 Chrome 자체 메모리 설정 화면이 아니다.
- 이미지의 `dusklane` 음악 창은 시연 중 별도 브라우저 앱이다. Instagram 오버레이와 터미널 명령은 구현 대상·실행 지시가 아니다.
- 공식 가이드는 Release를 앱 정상 종료로 설명한다. Chrome 행이 여러 개라고 탭별 정리로 단정하지 않는다.
- 플랫폼은 Ubuntu GNOME, 장치는 ASUS Vivobook 15 Pro. 실제 버전·세션·해상도·배율·CPU/RAM 용량은 실기에서 확인한다.
- 핵심 UX는 Archsport 노치. GNOME 320ms EASE_OUT_CUBIC, 웹 참고 420ms cubic-bezier(.22,1,.36,1). 위치는 패널 아래다.
- Auto Care는 첫 버전에서 **제안/알림만**, 기본 꺼짐. 자동 앱 종료는 별도 후속 판단 사항이다.
- Archsport 동시 사용 시 기본 노치 슬롯은 왼쪽 보조 위치, 중앙 슬롯은 Archsport 우선. 실제 충돌 시 패널 아이콘으로 축소한다. 자세한 계약은 계획 문서 참조.
- 계정·결제·클라우드 없음. Extension이 read-only Python worker를 하나 소유한다. 창 닫기는 Extension에서 명시적인 사용자 선택 후 처리한다.

## 지금 존재하는 것

조사 자료, 6개 원본 참고 이미지와 해시 manifest, 기능표, 화면/흐름 목록, 아키텍처, SQLite 초안, JSON 계약, 디자인 토큰, Archsport 모션 근거, 빌드·테스트·배포 계획. 원본 앱 소스나 바이너리는 없다.

REA CLI 6.5.0의 doctor를 실행했다. 현재 Codex 등록은 missing/config_drift이고 이 세션에 REA MCP 도구는 없다. setup·엔진 설치·설정 변경은 하지 않았다. 원본 바이너리가 없으므로 디컴파일 결과나 REA Evidence ID는 없다. 원본 기능 파악에는 사진과 공개 공식 문서를 사용했다. 조사 한계는 `replica/rea.md` 참조.

## 다음 시작점

`docs/IMPLEMENTATION_PLAN.md`의 M1부터 구현한다. 우선 fixture 기반 parser/policy와 브라우저 시연을 만들고, 실제 Linux에서 read-only 관측을 연결한다. Windows에서 임의 프로세스를 종료해 기능을 흉내 내지 않는다.

Linux 최초 확인 명령(아직 앱 구현이 없으므로 현재 모두 검수 계획):

```bash
gnome-shell --version
printf '%s\n' "$XDG_SESSION_TYPE"
python3 --version
cat /proc/meminfo
cat /proc/pressure/memory
```

수집 결과에서 사용자명·앱 이름 등 개인 정보를 제거하고 필요한 항목만 `local-diagnostics/`에 남긴다. 전체 환경 덤프는 금지한다.

구현 후의 단위 테스트와 GNOME schema 명령은 AGENTS.md 참조. 설치 스크립트는 `matci@local`만 변경하고 사용자 설정·DB를 보존해야 한다. 패키지에는 `replica/screens/`, 연구 문서, 진단을 포함하지 않는다.

## 완료 판정

계획 작성 완료와 앱 완성을 구별한다. `replica/verification.md`에 실행한 검사만 기록한다. Ubuntu 실기 P0와 Archsport 동시 사용 검수를 통과하기 전에는 일상 사용 준비 완료라고 쓰지 않는다.
