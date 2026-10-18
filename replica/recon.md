# 원본 분석 — Mint → matci

## 정체 판정

**대상은 DZG Studio LLC의 Mint for Mac이며, 첨부 자료는 Memory 기능 시연이다. 신뢰도 높음.** E03의 `Free up memory`, `Auto Care`, Home/Disk/Organize/Memory/Uninstall/Log 메뉴와 E02/E05/E06의 Idle/In use/System & protected/Freed 분류가 S01/S02에 대응한다. 계정 `dzg_studio`도 S11의 게시자와 일치한다. 정확한 시연 버전·에디션과 Instagram 게시물 URL은 확인하지 못했다.

E01은 넓은 메모리 화면, E02는 작업 중인 앱과 정리 결과, E03은 임계값 92% 설정, E04는 별도 `dusklane` 음악 웹 앱, E05는 Chrome 여러 행과 결과 변화, E06은 후보 목록을 보여준다. manifest의 E 번호는 첨부 순서이며 실제 시간 순서가 아니다. 412MB/1.82GB 같은 사진 값은 제품 성능 검증 수치가 아니다.

이 자료는 Instagram 자체를 복제하라는 요청도, 음악 스트리밍 앱을 만들라는 요청도 아니다. 터미널의 “Run all the UI checks…” 등은 원본 시연 내용이며 실행하지 않는다.

## 사용 범위

사용자의 개인 노트북과 포트폴리오를 위한 Ubuntu GNOME 재설계. 원본 전체를 한 번에 구현하지 않는다. **Memory + 노치 + 정상 닫기 결과 확인**이 첫 수직 흐름이다. Disk·Organize·Uninstall·Trend는 조사에 포함하되 후속 단계로 분리한다.

## 화면 목록

| ID | 화면 / 진입 | 원본 근거와 관측 상태 | matci 상태·구현 단계 |
|---|---|---|---|
| S01 | 첫 실행 / 홈 | Home 메뉴 E03, 세부 화면 미관측 | 목적·권한·시연/실제 구분 M1/M2 |
| S02 | 메모리 상세 | E02/E03/E05/E06, 목록·선택·작업 이유·해제 결과 | 핵심 목록/부분 관측/빈 목록/오류 M1–M3 |
| S03 | 자동 관리 설정 | E03 토글·임계값, S02/S03 문서 | 기본 꺼짐, 제안만 M3 |
| S04 | 빠른 상태 | S08 메뉴바 가이드, 사진에서는 버튼만 | 패널 아래 노치, compact/expanded/event/hidden M1/M2 |
| S05 | 작업 기록 / 추세 | Log 메뉴 E03, S09 추세 문서. 두 화면은 동일하다고 단정하지 않음 | 요청/취소/재측정 로그 M3, 추세 M4 |
| S06 | 디스크 분석 | Disk 메뉴 E03, S04/S05/S06 | 읽기 스캔 M4, 변경 동작 별도 gate |
| S07 | 폴더 정리 | Organize 메뉴 E03, S07 | 미리보기→이동→undo M4 |
| S08 | 앱 제거 | Uninstall 메뉴 E03, S01 설명 | 설치 출처 안내부터 M5, 자동 패키지 삭제 제외 |

총 8개 목표 화면, M1–M3 핵심 화면 5개(S01–S05). 미관측 원본의 loading/error/권한/키보드 동작은 추정하지 않고 matci 요구사항으로 추가한다.

## 흐름 목록

| ID | 사용자 목적 / 화면 | 핵심 결과 / 예외 |
|---|---|---|
| F01 | 최초 실행 S01→S04→S02 | 실제/시연 명시, unsupported OS는 안내, 실데이터처럼 보이는 자동 fixture 전환 금지 |
| F02 | 메모리 확인 S04→S02 | 전체 RAM, 앱별 추정·접근 불가·관측 시각 표시 |
| F03 | 선택 종료 S02→S05→S02 | 후보 선택→대상 재확인→닫기 요청→재측정. 취소·창 잔존·매핑 실패·동일 PID 재사용 대응 |
| F04 | 자동 제안 S03→S04→S02 | 임계값 지속 시 알림, 자동 종료 없음. cooldown·절전 복귀 baseline |
| F05 | 보호·설정 S02→S03 | 보호 목록과 제외 이유, 키보드/모션 감소 |
| F06 | 디스크 확인 S06 | 읽기 스캔·취소·권한 거부·심볼릭 링크 경계 |
| F07 | 폴더 정리 S07→S05 | 이동 미리보기·충돌·원본 변경·undo 실패 설명 |
| F08 | 기록 확인 S05 | 데이터 보존 기간, 비밀 정보 제외, 관측값과 귀속 효과 구분 |

F03 matci 계획 경로는 목록에서 선택 후 대상 확인 후 요청까지 3개 상호작용 단계(행 선택, 검토 열기, 닫기 요청)다. 원본 영상의 전체 클릭 수는 확인 불가다.

## 반복 컴포넌트

MemoryMeter(전체/unknown), AppRow(선택/보호/접근 불가/이미 종료), ReasonChip, MetricLabel(PSS/RSS), SelectionReview, ActionReceipt, Notch(compact/expanded/event), ThresholdControl, EmptyState, PartialError, HistoryRow. 상세 상태는 `design/components.md` 참조.

## 추론 모델

MemorySample은 시각·전체 RAM·앱 목록을 가진다(E02, 높음). AppObservation은 표시명·작업 이유·메모리 값을 가진다(E06, 높음). AutoCarePolicy는 활성화와 임계값을 가진다(E03, 높음). ActionReceipt는 정리 전후 결과를 기록한다(E05/S09, 중간: 원본 내부 저장 구조는 미확인). DiskCandidate/OrganizePlan/UndoRecord는 S04–S07 동작에서 추론한 후속 모델이다. 원본 DB 구조를 복구한 것이 아니다.

## 규모와 경계

핵심 M 규모(수 주 수준의 작업 묶음, 일정 보장 아님), 전체 관리 앱은 L 규모다. 어려운 부분은 앱/프로세스 매핑, 안전한 정상 종료, 메모리 수치 해석과 GNOME 실기 수명 관리다. macOS 전용 압축·APFS 공유 저장·Apple Shortcuts는 Linux 동일 기능으로 약속하지 않는다. 크롬 탭 제어는 별도 브라우저 확장으로만 후속 검토한다.
