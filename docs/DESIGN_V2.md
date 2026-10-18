# Memory 창 개편 계약

사용자 피드백(2026-10-18)에 따라 큰 독립 GTK4 창을 추가한다. 웹과 GTK 모두 검정 바탕, 상태별 yellow/blue/gray/lime, 세로 사용량 축과 입자, 여백 중심 목록, 아이콘 rail, 자동 제안 popover를 사용한다. 사용자 제안 색은 역할을 재현하는 새 팔레트이며 원본 픽셀 측정값이 아니다.

- 웹은 계속 합성 시연이다. 큰 메모리 화면을 기본으로 두고 결과를 같은 화면에서 입자 확산·관측 counter로 보여준다. 양의 관측 변화만 lime, 음수도 그대로 표시한다. 모션 감소 시 정지 상태로 즉시 전환한다.
- GTK4 독립 창은 켜져 있는 matci 확장의 세션 D-Bus 객체만 사용한다. worker를 추가하지 않는다. 창은 메모리·기록·설정과 Auto Care popover를 제공하고, 앱 아이콘은 설치된 desktop app의 GIcon을 사용한다.
- Review→Confirm은 같은 CloseController를 재사용한다. review nonce는 D-Bus sender와 60초 수명에 묶인다. 요청 신원·window 집합·저장 ack 뒤 재검증을 보존한다. 창에서 PID 신호를 보내지 않는다. demo는 실제 앱 닫기를 거부한다.
- 확장 disable/worker 재시작/설정 변경/클라이언트 연결 해제 시 검토를 무효화한다. 앱이 닫힌 뒤 요청을 재실행하지 않는다. bridge payload는 128KiB, 선택은 최대100개다.
- 노치는 요약·빠른 검토·큰 창 열기 역할이다. Archsport registry와 기존 100/80/30·320ms 계약은 유지한다.
- GTK 앱은 의존성이 GJS+GTK4인 별도 프로세스이며 Python core는 stdlib만 유지한다. 설치기는 앱 launcher와 아이콘을 설치하고 확장 runtime에도 app 파일을 동봉한다.
- Disk/Organize/cache/uninstall은 이 개편에서 구현하지 않는다. 존재하지 않는 기능의 동작 버튼을 만들지 않는다. 메모리 추세는 이 세션에 실제 관측된 값만 표시한다.

검증: 기존 Python/JS 회귀 + bridge sender/nonce/expiry/busy/reconnect 테스트, GSettings strict 검사, 390/1440 브라우저 클릭/키보드/모션 감소/오류 상태, WSL GTK4 headless smoke. WSL smoke는 ASUS GNOME 확장 실행·실제 정상 닫기·절전·배율 검수를 대체하지 않는다.

API 근거: [GJS D-Bus](https://gjs.guide/guides/gio/dbus.html), [Gtk.DrawingArea](https://docs.gtk.org/gtk4/class.DrawingArea.html), [Gio.AppInfo GIcon](https://gnome.pages.gitlab.gnome.org/gtk/gio/iface.AppInfo.html). 원본 binary 분석이나 REA Evidence는 새로 수행하지 않았다.
