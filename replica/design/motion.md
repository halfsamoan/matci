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

## 콘텐츠 전환 추가 — 2026-10-18

Apple의 페이드·작은 수직 이동을 참고한 독자 구현이다. Apple 원본 코드나 실측 타이밍을 복제한 것은 아니다. 컨테이너의 GNOME320ms/웹420ms와 공유 배치 우선순위는 유지한다.

- 이전 콘텐츠는 위로4px 이동하며100–110ms에 사라진다. 새 콘텐츠는 아래6px에서 올라오며180–220ms에 나타난다. 본문은55ms 뒤 시작해 컨테이너 전개와 겹친다. 웹 헤더는2px/160ms다.
- compact/overview/review/observing/result처럼 의미가 바뀔 때만 전환한다. 같은 상태의 RAM 갱신은 재생하지 않으며 동일 웹 markup은 DOM도 보존한다.
- 연속 입력은 대기시키지 않는다. 진행 중 표시값에서 이어가고 오래된 outgoing을 정리한다. outgoing 컨트롤은 조작·키보드 대상에서 제외하며 웹 복제층에는 aria-hidden도 적용한다. 새 컨트롤은 즉시 사용할 수 있다.
- GNOME 호스트는 최신 콘텐츠만 측정하고 이전 allocation을 유지한다. GNOME46에 없는 `set_no_layout`에 의존하지 않는다. [GNOME46 BinLayout 소스](https://github.com/GNOME/mutter/blob/gnome-46/clutter/clutter/clutter-bin-layout.c)의 preferred-size/allocate 계약을 기준으로 구현했다.
- 모션 감소를 켜면 진행 중 콘텐츠 모션과 outgoing을 즉시 정리한다. Archsport 실제 앱 소스는 변경하지 않는다. Matci 웹에 표시하는 합성 동반 노치만 같은 콘텐츠 전환을 사용한다.

## 검수

compact↔expanded 연타는 현재 transition에서 재시작하고 오래된 timer를 취소한다. native 폭 clamp와 패널 아래 위치, 접근성, 콘텐츠 clipping을 실제 GNOME에서 확인한다. 웹 관측만으로 GNOME 모션 통과라고 쓰지 않는다. M2에 Archsport와 matci 동시 활성/해제·확장·이벤트·125/150% 충돌 검사를 포함한다. 배치 fallback은 최종 계획의 슬롯 정책을 따른다.
