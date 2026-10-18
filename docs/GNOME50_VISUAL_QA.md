# GNOME 50 실기 시각 검수 — 대기

PR #1의 네 번째 요청은 **실제 ASUS Ubuntu GNOME 50 세션에서 눈으로 검수**하는 것이다. 현재 접근 가능한 호스트는 Windows다. WSL의 Ubuntu24.04/22.04에는 gnome-shell이 없고, Ubuntu20.04에는3.36.9 바이너리만 확인됐다. GNOME50 실기 세션은 확인/접근하지 못했다. 아래 항목은 통과로 기록하지 않는다.

## 이번에 확인한 대체 범위

GTK4.6/Xvfb에서900×720·480×720·390×720 및 넓게↔좁게 실제 mapped 창 resize를 실행했다. 세로 stack·상단 rail·고정 action·popover를 검사했고 `G_DEBUG=fatal-criticals`에서도 통과했다. 선택/hover/focus는 합성 GTK 상태로 렌더링해 캡처를 확인했다. 이는 실제 pointer·GNOME50 테마·150% 배율 검수가 아니다.

- [선택·hover·focus 합성 상태](screenshots/native-gtk-interaction.png)
- [좁은 GTK 창](screenshots/native-gtk-narrow.png)

## 실제 세션에서 기록할 것

장치 모델 / Ubuntu 버전 / `gnome-shell --version` / Wayland 또는 X11 / 화면 해상도 / 디스플레이 배율 / 테마 / 실행일을 `local-diagnostics/`에 기록한다. 전체 환경·세션·사용자 DB를 업로드하지 않는다.

- [ ] 실제 GNOME50 +150%에서 launcher로 열고 창을 좁혔다 넓혀도 목록과 고정 action이 잘리지 않는다.
- [ ] checkbox 미선택·hover·선택·키보드 focus가 명확하며 기본 파란 accent가 라임 체크 상태에 섞이지 않는다. 보호 행은 선택 불가다.
- [ ] rail 선택·hover·focus, popover 토글·slider·키보드·닫기·화면 끝 배치를 확인한다.
- [ ] 실제 설치된 Chrome/Terminal 등의 desktop GIcon을 확인한다. 테마 fallback을 실제 앱 로고 검수 통과로 세지 않는다.
- [ ] 모션 감소에서 입자와 counter가 정지/즉시 반영되며 일반 모션에서 outgoing 입자가 되돌아오지 않는다.

실제 창 닫기/저장 취소·suspend/resume·lock·Archsport 동시 노치·launcher upgrade 검수는 기존 Linux P0 항목으로 계속 남긴다. 이 시각 polish를 이유로 Draft를 해제하지 않는다.
