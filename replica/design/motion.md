# Archsport 모션 재사용 계약

근거: 사용자 소유 작업 폴더의 commit `7aeb397cc8f736b82f75aed5010a870a8794b59a`. 파일 SHA256·라인·발췌는 `archsport-motion.json`에 저장한다. 원본 Mint 모션은 정지 사진으로 시간·곡선을 판독할 수 없다.

## GNOME 실제 코드

- `extension/extension.js`의 `_render`: width compact 360 / expanded 500, height 46 / 250, width는 monitor width−24로 clamp.
- `remove_all_transitions()` 후 `ease`: enable-animations가 참이면 320ms, 거짓이면 0ms, `Clutter.AnimationMode.EASE_OUT_CUBIC`.
- width notify와 onComplete에 `_place` 적용, X 중앙 유지. primary monitor Y는 monitor.y + Main.panel.height.
- `stylesheet.css`: 아래 radius 26, padding 14/20, shadow 0/12/32/0.25. compact 간격 16.
- event는 별도 고정 크기가 아니라 기존 확장 구조로 전개된다. matci도 native event는 expanded footprint를 사용한다.

## Windows 웹 참고 코드

- `web/style.css`: compact 336×46, expanded 460×224, event 460×144.
- width/height 420ms `cubic-bezier(.22,1,.36,1)`, opacity 160ms, content transform 260ms, expanded content delay 80ms.
- `web/app.js`: 이벤트 시연 hold 6000ms 후 compact. matci는 실제 작업 진행 중 event timer로 검토/결과를 강제 닫지 않고 단순 정보 이벤트에만 hold 적용한다.
- reduced-motion은 animation/transition을 제거한다. 웹의 goal-pulse는 축구 전용이므로 memory 결과에 그대로 붙이지 않는다. 기본 노치 형태 변화의 값은 보존한다.

## 검수

compact↔expanded 연타는 현재 transition에서 재시작하고 오래된 timer를 취소한다. native 폭 clamp와 패널 아래 위치, 접근성, 콘텐츠 clipping을 실제 GNOME에서 확인한다. 웹 관측만으로 GNOME 모션 통과라고 쓰지 않는다. M2에 Archsport와 matci 동시 활성/해제·확장·이벤트·125/150% 충돌 검사를 포함한다. 배치 fallback은 최종 계획의 슬롯 정책을 따른다.
