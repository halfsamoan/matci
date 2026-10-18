# Archsport 모션 재사용 계약

근거: 사용자 소유 작업 폴더의 commit `7aeb397cc8f736b82f75aed5010a870a8794b59a`. 파일 SHA256·라인·발췌는 `archsport-motion.json`에 저장한다. 원본 Mint 모션은 정지 사진으로 시간·곡선을 판독할 수 없다.

## GNOME 실제 코드

- matci 대기 상태에는 패널 RAM 아이콘·사용률만 표시한다. 사용자가 패널 항목을 활성화하면 상세 overlay를 연다. Archsport만 경기 상태에서 compact·expanded·event 모드로 나타난다.
- 표시되는 overlay는 `addChrome(... affectsStruts:false)`로 패널 아래에 겹쳐 그린다. 높이가 커져도 GNOME 작업영역을 예약하지 않으므로 기존 창 좌표는 바뀌지 않는다. 바탕 surface는 pointer 입력을 통과시키고 실제 버튼만 받는다.
- `archsport/extension/extension.js`: compact 280×46, expanded 폭 최대 520 px·높이 최대 520 px(모니터 가용 높이에 따라 축소), event 높이 최대 180 px. 예정/최근 경기·통계의 실제 줄 수로 높이를 계산하고 본문이 넘치면 스크롤한다.
- `matci/extension/extension.js`: 사용자가 연 expanded overlay는 500×190–350이며, 앱 목록이 짧으면 창도 작아지고 목록이 길 때만 150px까지 스크롤한다. 앱 고유 아이콘과 짧은 보호 표시를 사용한다.
- 노치 위치·크기 전이는 목표 geometry가 바뀔 때만 320ms `EASE_OUT_CUBIC`으로 실행한다. 5초 데이터 poll이 모션을 다시 시작하지 않는다. `enable-animations`가 꺼지면 0ms다.
- 두 확장은 공유 stage capture 한 개로 바깥의 버튼 누름(좌·우클릭 포함)을 감지한다. 펼친 소유 노치만 접고, 컨텍스트 메뉴/클릭 대상에는 이벤트를 전파한다. 현재 소유 노치의 패널 토글 영역과 노치 안 컨트롤은 예외로 두며, 다른 확장 아이콘은 바깥 클릭으로 처리한다. matci의 선택 검토는 접을 때 유지한다.
- 닫기와 열기 표면은 각각 170ms/220ms opacity·scale 전환을 쓴다. 열기·닫기 중 연속 입력은 현재 전환을 취소하고 최신 상태로 이어진다. 모션 감소는 GNOME `enable-animations` 설정을 따른다.
- Archsport는 점수 글자를 scale하지 않고 opacity와 4px y 이동으로 표시하며, 새 사건 행은 짧게 올라오며 나타난다. 득점/사건 전환은 240ms/220ms이고 자동 사건 표시가 끝나도 사용자가 직접 펼친 화면은 닫지 않는다.
- Mint for Mac은 제공된 정지 화면으로 앱 분류·아이콘·보호 이유·검토 조작을 참고했다. Apple Sports는 기존 출처 문서와 공식 화면/Live Activities 지침을 참고했다. 원본 실행 파일이나 inspector가 없어 REA 동작 추적 및 원본 모션 시간 측정은 하지 않았다.

## Windows 웹 참고 코드

- `web/style.css`: Archsport compact 336×46, expanded 460×224, event 460×144. matci idle은 패널 버튼만 보이고, 수동으로 연 상세 overlay는 460×224다.
- width/height 420ms `cubic-bezier(.22,1,.36,1)`, opacity 160ms, content transform 260ms, expanded content delay 80ms.
- `web/app.js`: Archsport 이벤트 시연 hold 6000ms 후 compact. matci는 사용자가 닫을 때까지 상세 overlay를 유지한다.
- reduced-motion은 animation/transition을 제거한다. 웹의 goal-pulse는 축구 전용이므로 memory 결과에 그대로 붙이지 않는다. 기본 노치 형태 변화의 값은 보존한다.

## 2026-10-19 업데이트

- Archsport expanded의 본문은 고정 헤더 아래 `St.ScrollView`로 이동했다. 리스트가 긴 경우 모니터 가용 높이 안에서 스크롤하고, 짧은 목록은 콘텐츠 높이만 사용한다.
- matci expanded 목록은 이전부터 스크롤 영역을 사용한다. 두 UI의 보조 글자 크기와 pressed 상태 피드백을 키웠다.
- 종료 때 `Main.panel`, root, indicator, stage의 destroy 신호로 worker와 shared capture를 먼저 멈춘다. 종료 후 콜백은 UI 접근하지 않는다.
- 로그아웃/재로그인은 실행하지 않았다. Shell shutdown warning이 없어졌는지는 다음 실제 종료 로그로 확인해야 한다.

## 검수

compact↔expanded 연타는 가장 최근 geometry로 전환한다. native 폭 clamp와 패널 아래 위치, click-through, 콘텐츠 clipping은 격리된 중첩 GNOME 세션에서 화면으로 확인한다. 웹 관측만으로 GNOME 모션 통과라고 쓰지 않는다. Archsport와 matci 동시 활성/해제·확장·이벤트·125/150% 검수가 남아 있다. 배치 fallback은 최종 계획의 슬롯 정책을 따른다.
