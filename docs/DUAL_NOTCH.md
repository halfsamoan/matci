# Archsport와 matci 표면 공존

Archsport와 matci는 독립 확장이다. 각 저장소의 `extension/notchDock.js`, `extension/dockModel.js`, `extension/notchSurface.js`는 byte 동일해야 하며 `tools/dev.py --check-only`가 이를 검사한다. `DOCK_PROTOCOL`을 올릴 때 두 저장소를 같은 변경에서 갱신한다. 별도 서비스나 daemon은 없다.

대기 상태에서 matci는 GNOME 패널의 RAM 아이콘과 사용률만 표시한다. 사용자가 패널 항목을 누르면 상세 overlay가 열리고, 다시 누르거나 접기 버튼을 누르면 닫힌다. Archsport는 경기 상태가 있을 때만 패널 아래 노치를 표시한다. 두 확장 모두 `affectsStruts:false`를 사용하므로 작업영역을 예약하지 않고 기존 창 위치를 바꾸지 않는다. 패널과 이어지는 오목한 귀와 아래 둥근 모서리 바깥은 아래 앱으로 클릭을 전달하고, 노치 표면과 조작 버튼은 입력을 받는다.

matci 표면은 사용자의 패널 입력으로 열리며 Archsport 자동 이벤트보다 우선한다. 경기 이벤트는 이미 열린 matci 검토 화면을 닫지 않는다. 창 닫기 관측 중 표시를 접더라도 receipt는 정리한다.

표면이 겹치거나 모니터 폭이 부족하면 수동 matci overlay를 유지하고 Archsport는 패널 항목으로 접근한다. matci는 항상 패널에서 다시 열 수 있다. 한 앱을 disable하면 해당 앱의 등록과 worker만 정리한다. worker·설정·DB는 공유하지 않는다.

구버전 Archsport는 shared registry에 참여하지 않는다. 처음 함께 설치할 때 두 확장을 같은 배치 계약 버전으로 업데이트한다. 실제 animation·focus·패널·배율은 Ubuntu에서 검수한다. 웹 프리뷰와 Node 테스트를 GNOME 통과 근거로 쓰지 않는다.
