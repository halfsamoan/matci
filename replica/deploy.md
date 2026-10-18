# Linux 설치·릴리스 사전 조건

**현재 not ready. 앱 미구현, 실제 설치·공개 배포 미실행.** 이 문서는 replica-deploy를 Linux 로컬 앱에 맞게 적용한 계획이다.

- [ ] M3 핵심 must 및 matci 추가 P0 요구 구현 완료.
- [ ] Python 테스트 통과, 실제 GSettings schema strict 검증.
- [ ] GJS 실제 런타임과 `test-plan.md` P0-01–15 통과.
- [ ] 열린 S1/S2 없음, 기능 parity 결과와 플랫폼 제외 항목 설명.
- [ ] 제품 코드/패키지 원본 브랜드 sweep 및 시각 검토, 연구 참고 자료 제외.
- [ ] Python package·extension·schema·자체 assets만 allowlist 패키징.
- [ ] `.env`, DB, diagnostics, sessions, raw process data, `replica/screens/` 미포함 확인.
- [ ] `matci@local` 설치 staging→strict compile→기존 설치 backup→교체→복구 경로 구현.
- [ ] 설치 실패 시 기존 확장/DB/설정 보존, upgrade에서 사용자 데이터 덮어쓰기 금지.
- [ ] disable/제거가 소유 worker·actor만 정리하고 다른 앱/Archsport를 건드리지 않음.
- [ ] 실제 Ubuntu에서 로그아웃/로그인과 rollback 검수.

기본 설치 위치는 `~/.local/share/gnome-shell/extensions/matci@local/`, state는 별도 XDG 디렉터리다. root 권한·systemd 서비스는 필요하지 않다. Wayland에서는 Shell 재시작 명령으로 검증한 것처럼 쓰지 않고 로그인 세션에서 확인한다.

웹 호스팅/DNS/실결제/모바일 스토어는 적용하지 않는다. 공개 배포가 별도로 요청되면 완성 패키지와 위 결과를 먼저 제시한 후 해당 범위로 진행한다. 현재 사용자에게 배포 승인 질문을 할 단계가 아니다.
