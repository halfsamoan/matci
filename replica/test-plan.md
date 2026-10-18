# matci 검수 계획

자동 검수는 `verification.md`의 최신 결과를 따른다. 아래는 실제 GNOME와 후속 기능까지 포함한 acceptance cases이며, 특히 P0 실기 검수는 아직 전부 미실행이다. 단위/통합 테스트의 synthetic 창 callback을 실제 앱 닫기 검수로 세지 않는다.

## 흐름별 케이스

| ID | 실행 / 입력 | 기대 결과 |
|---|---|---|
| F01-H1 | Linux에서 enable, 실제 수집 | live 라벨과 새 sample, worker1개 |
| F01-E1 | Windows에서 실제 mode 요청 | unsupported 안내; demo 자동 위장 금지 |
| F01-N1 | demo fixture에 실제 PID처럼 보이는 값 | 모든 OS action 거부; fixture에는 실제 창 token 없음 |
| F02-H1 | 정상 meminfo/PSS/PSI | 계산 정의와 각 metric 일치 |
| F02-E1 | MemAvailable 누락/0 total/PSI 없음 | null/error와 availability 구별, 가짜 0% 금지 |
| F02-E2 | smaps 접근 거부, RSS fallback, 일부 소멸 | coverage partial, PSS/RSS 합계를 정확한 시스템 총합으로 표시 안 함 |
| F02-E3 | MemAvailable=0, 오래된 PSS와 새 identity | 100%는 유효, metric age 표시, identity와 PSS freshness 구별 |
| F02-N1 | 다른 UID·PID0·음수·PID starttime 변경 | 후보에서 제외, 잘못된 프로세스 관측/실행 안 함 |
| F03-H1 | disposable GUI 앱 1개 선택→검토→닫기 | 현재 창에 정상 닫기, 요청/결과와 signed observed delta |
| F03-E1 | 중복 클릭/자동 새 sample/새 창/닫기 직전 종료 | action1개 또는 stale 재검토, token 재사용 불가 |
| F03-E2 | 저장 필요 테스트 문서에서 취소 | 창 잔존/취소가 실제 관측된 범위로 기록, 강제 종료 없음 |
| F03-E3 | 모든 창 닫혔지만 background process 잔존 | 창 닫힘과 앱 전체 종료 구별, 무조건 해제 완료 아님 |
| F03-E4 | requested ack 전 저장 실패/ack 후 대상 변경/요청 직후 crash | ack 전 닫기0건, 변경 시 rejected, 재시작 partial/INTERRUPTED와 자동 재실행0건 |
| F03-N1 | 보호 앱·다른 UID·위조/오래된 review | 실제 execution boundary에서 거부 |
| F04-H1 | fake monotonic clock로 threshold 지속 | 한 번 제안, 사용자 설정과 cooldown 적용 |
| F04-E1 | 임계값 출렁임/절전/시계 변경/재시작 | hysteresis, baseline reset, 과거 알림 폭주 없음 |
| F04-N1 | 제안 활성만으로 idle app 종료 대기 | 앱 종료 0건, notification만 |
| F05-H1 | 보호 목록·모션 감소 변경 | 적용 시점과 이유 표시, GNOME global animation 준수 |
| F05-E1 | 긴 이름/키보드만/고대비/125–150% | focus 보임, 이름 접근 가능, action 잘림 없음 |
| F05-N1 | 기본 시스템·개발 보호를 config로 해제 시도 | builtin 보호 정책이 실행 경로에 유지 |
| F06-H1 | 임시 디렉터리 read-only 스캔 | 목록과 크기만, 파일 변경0건 |
| F06-E1 | 권한 거부/순환 symlink/취소/대량 파일 | 경계 준수, partial과 진행률, Shell UI block 없음 |
| F06-N1 | 선택 root 밖 심볼릭 링크 | root 탈출/임의 파일 열기 금지 |
| F07-H1 | 임시 fixture 미리보기→이동→undo | 바이트·위치 복원, 기록 일치 |
| F07-E1 | 이름 충돌/실행 후 원본 변경/중단/디스크 full | 덮어쓰기 없음, 복구/부분 상태 설명 |
| F07-N1 | 외부 root·민감 세션 경로·예상 밖 device | 실행 거부, 사용자 파일 자동 손상 없음 |
| F08-H1 | receipts 기록·재실행·사용자 지우기 | 보존/삭제와 UTC 정렬, raw argv 없음 |
| F08-E1 | DB lock/손상/미래 schema/owner UID 불일치 | 원본 보존·명확한 오류, 무단 새 DB 위장 금지 |
| F08-N1 | 음수 변화량/전후 샘플 없음 | signed 값 또는 unknown, 허위 성과0건 |
| F08-N2 | record_app_view의 임의 bytes/다른 sample process key/보호 해제 | 현재 sample 검증, metric 자체 계산, builtin 보호 mirror 변경 거부 |

UI 공통: 빈 목록/loading/error/권한/긴 텍스트/키보드/Escape/focus 복귀. 웹 390×844 및 1440×900은 M1 브라우저에서, GNOME은 실제 목표 장치에서 검사한다. 원본에 자동화/부하 테스트를 실행하지 않는다.

## Ubuntu 실기 P0 — 전부 미실행

| ID | 조건 | 통과 기준 |
|---|---|---|
| P0-01 | 실제 GNOME/Wayland 버전 | metadata/API 대상이 실행 버전과 일치 |
| P0-02 | enable/disable 10회 | actor/timer/signal 누수·worker 중복 없음 |
| P0-03 | meminfo/PSS/RSS/PSI 교차 확인 | 정의·단위·누락 구별; OS 숫자와 시간차 허용 기록 |
| P0-04 | Chrome 다중 프로세스/Snap/Flatpak | 겹친 합계 없음, 불명확 mapping은 unknown |
| P0-05 | disposable GUI 정상 닫기/미저장 취소 | 요청과 종료 관측 구별, 취소 뒤 앱 생존 |
| P0-06 | 터미널+에이전트/빌드/영상 | 보호 이유 표시, 자동 종료0건 |
| P0-07 | suspend/resume | 새 baseline, stale 요청 거부, worker1개 |
| P0-08 | worker 종료·EOF·깨진 JSON | backoff, 오류 표시, 늦은 callback 무효 |
| P0-09 | 125/150%·외부 모니터 재연결 | 패널 아래, 텍스트 clipping 없음, 모니터 fallback |
| P0-10 | fullscreen/overview/lock | 정책대로 숨김, 복귀 중복 없음 |
| P0-11 | matci 패널 진입 + Archsport 경기 표면 동시 사용 | matci idle panel-only, 수동 overlay 우선, click-through와 충돌 fallback 확인 |
| P0-12 | 모션 on/off·키보드 | native320ms와 0ms, focus 복귀 |
| P0-13 | 30분 관측 | CPU/RSS·샘플 주기 비용 측정, 목표 미달 시 조정 |
| P0-14 | 로그아웃/로그인·upgrade/rollback | 한 worker, 사용자 DB/설정 보존 |
| P0-15 | 네트워크 없음 | 핵심 관측 정상, 외부 접속 필요 없음 |

기록 형식: 실행일/장치/GNOME·세션·배율/절차/실제 결과/비밀 제거한 증거 위치. 각 결과는 passed/failed/not-run으로 기록한다. 목표를 문서에 썼다는 이유로 passed로 바꾸지 않는다.
