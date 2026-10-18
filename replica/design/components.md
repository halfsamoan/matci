# 컴포넌트 사양

제품 색·규격은 `tokens.json`의 matci 제안값이다. 원본 사진은 계층·분류의 참고이며 정밀 pixel 측정이 아니다. Archsport 모션 값은 사용자 소스에서 확인했다. V2 구현은 `../../docs/DESIGN_V2.md`를 따른다. idle yellow/active blue/protected gray/freed lime으로 의미를 나눈다.

MemoryField: Canvas/Gtk.DrawingArea가 같은 point model을 사용한다. 세로 축·최대320입자·양의 관측 변화 후1.6초 확산/counter, 모션 감소 시 정지/즉시 값. 점은 바이트와1:1 대응하지 않는다. 브라우저 hidden/화면 이동 때 RAF 중지, GTK는 활성 메모리 창에서만 redraw한다.

후속 변경: 왕복 sine 대신 단조 ease-out outgoing 층(최대80입자)의 scatter+fade를 사용한다. 기본 field는 새 밀도로 남으며 사라진 입자를 원위치로 돌리지 않는다. GTK 행은 hover/선택 배경/라임 focus와 checkbox 상태를 구분한다. MiB/GiB adaptive formatting은 정확히1GiB에서 단위를 바꾸며 작은 양수는 `<1 MiB`,누락은 확인 불가다.

AutoCarePopover: 토글+50–99 slider+정책 설명, 기본off·키보드 조작·자동 닫기 없음. GTK는 GSettings, 웹은 시연 상태다. GTK demo/smoke는 설정도 memory backend다.

| 컴포넌트 | variants / 상태 | 상호작용·접근성 | 사용 화면 |
|---|---|---|---|
| Notch | compact/expanded/event/hidden, stale, reduced | Enter/Space 열기, Escape 접기, 이벤트가 포커스 탈취 안 함, 접근 가능한 상태 이름 | S04 |
| MemoryMeter | normal/high/unknown/partial | 사용 가능 RAM 기준 명시, 색 외 텍스트, null이면 값 없음 | S02/S04 |
| AppRow | unselected/selected/protected/unknown/gone | 이름 60자 ellipsis+접근 가능한 전체명, 선택 checkbox, 보호 이유 읽기 가능. PSS/RSS 배지 | S02 |
| ReasonChip | protected/working/unmapped/permission | 아이콘/문자 동시, 툴팁만으로 중요 이유 전달하지 않음 | S02 |
| SelectionReview | ready/stale/changed/empty | 앱과 전체 대상 창 수·손실 가능성 제시, 재검토와 취소, focus trap와 원래 항목 복귀 | S02 |
| Button | primary/secondary/quiet, hover/focus/disabled/busy | native focus ring, 요청 중 중복 방지, spinner만 남기지 않고 레이블 유지 | 공통 |
| ActionReceipt | requested/observing/completed/partial/cancelled/timeout | 요청과 관측 결과를 구별, signed delta 표시, live/demo 구별 | S05 |
| ThresholdControl | off/on/suggestion, invalid | label 연결, 50–99 범위 초안, 키보드 조절. 기본 꺼짐 | S03 |
| SettingsRow | monitor/protection/reduce | 입력 변경 적용 시점 안내, 모션 전역 GNOME 설정 우선 | S03 |
| PartialError | stale/permission/unsupported | 마지막 관측 시각, 재시도, 오류가 0 사용량으로 보이지 않음 | S01/S02 |
| HistoryRow | empty/filled/unavailable | 목록 순서와 시각, 데이터 지우기, 문서 제목/명령행 미저장 | S05 |

노치 list는 스크롤 영역과 헤더/하단 action 영역을 분리한다. 포커스 행이 clipping 안에 숨지 않게 스크롤한다. 포인터 대상은 데스크톱 32 logical px 이상, prefs의 주요 조작은 44 logical px를 목표로 한다. 배율 125/150%는 실제 GNOME에서 확인한다. 웹 390px는 노트북 앱이 모바일 제품이라는 뜻이 아니라 시연 페이지 overflow 검수다.

loading/empty/error/permission/long content는 원본 미관측 상태까지 matci 자체 요구로 포함한다. 대비 검사는 tokens의 모든 실제 text/background pair를 대상으로 수행하며, 구현 시 새 조합을 추가하면 pairs도 갱신한다.
