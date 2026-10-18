# Archsport 모션 재사용 계약

근거: 사용자 소유 작업 폴더의 commit `7aeb397cc8f736b82f75aed5010a870a8794b59a`. 파일 SHA256·라인·발췌는 `archsport-motion.json`에 저장한다. 원본 Mint 모션은 정지 사진으로 시간·곡선을 판독할 수 없다.

## GNOME 실제 코드

- 두 노치는 `addChrome(... affectsStruts:false)`로 패널 아래에 겹쳐 그린다. 높이가 커져도 GNOME 작업영역을 예약하지 않으므로 기존 창 좌표는 바뀌지 않는다. 바탕 surface는 pointer 입력을 통과시키고 실제 버튼만 받는다.
- `archsport/extension/extension.js`: compact 280×46, expanded 최대 520×370, event 최대 180px. 예정/최근 경기·통계의 실제 줄 수로 높이를 계산하고 경기 정보가 비면 아이콘 한 줄만 둔다.
- `matci/extension/extension.js`: compact 190×46, expanded 500×190–350. 앱 목록이 짧으면 창도 작아지고 목록이 길 때만 150px까지 스크롤한다. 앱 고유 아이콘과 짧은 보호 표시를 사용한다.
- 노치 위치·크기 전이는 목표 geometry가 바뀔 때만 320ms `EASE_OUT_CUBIC`으로 실행한다. 5초 데이터 poll이 모션을 다시 시작하지 않는다. `enable-animations`가 꺼지면 0ms다.
- Archsport는 새 득점 점수만 360ms 살짝 커지며 나타나고, 새 사건 행은 260ms 짧게 올라오며 나타난다. 자동 사건 표시가 끝나도 사용자가 직접 펼친 화면은 닫지 않는다.
- Mint for Mac은 제공된 정지 화면으로 앱 분류·아이콘·보호 이유·검토 조작을 참고했다. Apple Sports는 기존 출처 문서와 공식 화면/Live Activities 지침을 참고했다. 원본 실행 파일이나 inspector가 없어 REA 동작 추적 및 원본 모션 시간 측정은 하지 않았다.

## Windows 웹 참고 코드

- `web/style.css`: compact 336×46, expanded 460×224, event 460×144.
- width/height 420ms `cubic-bezier(.22,1,.36,1)`, opacity 160ms, content transform 260ms, expanded content delay 80ms.
- `web/app.js`: 이벤트 시연 hold 6000ms 후 compact. matci는 실제 작업 진행 중 event timer로 검토/결과를 강제 닫지 않고 단순 정보 이벤트에만 hold 적용한다.
- reduced-motion은 animation/transition을 제거한다. 웹의 goal-pulse는 축구 전용이므로 memory 결과에 그대로 붙이지 않는다. 기본 노치 형태 변화의 값은 보존한다.

## 검수

compact↔expanded 연타는 가장 최근 geometry로 전환한다. native 폭 clamp와 패널 아래 위치, click-through, 콘텐츠 clipping은 현재 로그인 세션에서 화면으로 확인한다. 웹 관측만으로 GNOME 모션 통과라고 쓰지 않는다. Archsport와 matci 동시 활성/해제·확장·이벤트·125/150% 검수가 남아 있다. 배치 fallback은 최종 계획의 슬롯 정책을 따른다.
