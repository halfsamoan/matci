# 컴포넌트 사양

색상과 규격은 `tokens.json`에 정리했다. 원본 사진은 정보 위계 참고이며 pixel 단위 복제 기준은 아니다. 실제 GNOME UI 구현을 반영한 사양이다. 화면 밀도와 배치는 실기 검수가 남아 있다.

| 컴포넌트 | variants / 상태 | 상호작용·접근성 | 사용 화면 |
|---|---|---|---|
| Notch | compact/expanded/event/hidden, live/stale/sync/demo | compact는 아이콘과 핵심 수치, expanded는 헤더·상태 배지·작업 영역. 키보드 조작과 접근 가능한 상태 이름 | S04 |
| MemoryMeter | normal/high/unknown/partial | 사용 가능 RAM 기준 명시, 색 외 텍스트, null이면 값 없음 | S02/S04 |
| AppRow | unselected/selected/protected/unknown/gone | 한 줄 앱명·창 수·PSS/RSS·표본/입력 시각, 선택 아이콘, 보호 이유 | S02 |
| ReasonChip | protected/working/unmapped/permission | 아이콘/문자 동시, 툴팁만으로 중요 이유 전달하지 않음 | S02 |
| SelectionReview | ready/stale/changed/empty | 앱과 전체 대상 창 수·손실 가능성 제시, 재검토와 취소, focus trap와 원래 항목 복귀 | S02 |
| Button | primary/secondary/quiet, hover/focus/disabled/busy | native focus ring, 요청 중 중복 방지, spinner만 남기지 않고 레이블 유지 | 공통 |
| ActionReceipt | requested/observing/completed/partial/cancelled/timeout | 요청과 관측 결과를 구별, signed delta 표시, live/demo 구별 | S05 |
| ThresholdControl | off/on/suggestion, invalid | label 연결, 50–99 범위 초안, 키보드 조절. 기본 꺼짐 | S03 |
| SettingsRow | monitor/protection/reduce | 입력 변경 적용 시점 안내, 모션 전역 GNOME 설정 우선 | S03 |
| PartialError | stale/permission/unsupported | 마지막 관측 시각, 재시도, 오류가 0 사용량으로 보이지 않음 | S01/S02 |
| HistoryRow | empty/filled/unavailable | 목록 순서와 시각, 데이터 지우기, 문서 제목/명령행 미저장 | S05 |

노치 list는 스크롤 영역과 헤더/하단 action 영역을 분리한다. 핵심 상태는 아이콘만으로 전달하지 않고 텍스트 배지도 함께 둔다. 포커스 행이 clipping 안에 숨지 않는지, 배율 125/150%와 긴 앱명이 잘리는지는 실제 GNOME에서 확인한다. 웹 390px는 시연 페이지 overflow 검수다.

loading/empty/error/permission/long content는 원본 미관측 상태까지 matci 자체 요구로 포함한다. 대비 검사는 tokens의 모든 실제 text/background pair를 대상으로 수행하며, 구현 시 새 조합을 추가하면 pairs도 갱신한다.
