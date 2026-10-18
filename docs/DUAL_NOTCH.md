# 두 노치가 함께 움직이는 방식

Archsport와 matci의 최신 공존 버전을 함께 설치한다. 각 저장소의 `extension/dockModel.js`와 `notchDock.js`는 같은 버전이다. 별도 서비스나 daemon은 없다.

두 compact 노치는 패널 아래에서8 logical px 간격으로 한 중앙 그룹을 이룬다. 한쪽을 펼치면 다른 쪽이 접히며 그룹이 중앙을 유지한다. 두 표면은 `affectsStruts:false` 오버레이라 기존 창 위치를 바꾸지 않는다. 빈 배경은 클릭을 통과하고 버튼만 입력을 받는다. native320ms EASE_OUT_CUBIC, Windows 웹 시연420ms cubic-bezier(.22,1,.36,1)를 유지한다.

수동 화면/검토100, 경기 이벤트80, 메모리 제안30으로 claim한다. 명시적인 다른 노치 클릭은 전환할 수 있고, 자동 이벤트는 수동 검토를 닫지 않는다. 창 닫기 관측이 진행 중이면 표시를 접더라도 receipt는 정리한다.

그룹 폭이 모니터 여백을 넘으면 활성 노치를 유지하고 다른 노치를 숨긴다. 두 앱은 각자의 GNOME 패널 메뉴로 접근할 수 있다. 한 앱을 disable하면 그 앱의 등록/worker만 정리하고 남은 노치가 중앙으로 돌아온다. worker/설정/DB는 공유하지 않는다.

구버전 Archsport는 공유 registry에 참여하지 않는다. 처음 함께 설치할 때 둘 다 업데이트한다. 실제 animation·focus·패널·배율은 Ubuntu에서 검수한다. 웹 사진/Node 테스트를 GNOME 통과 근거로 쓰지 않는다.
