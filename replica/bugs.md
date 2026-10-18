# 버그와 확인 대기

구현/통합 검수에서 연속 sample_now가250ms rate limit에 걸리는 문제를 재현하고 requested ack 뒤300ms 대기로 수정했다. 전용 regression과 JS↔Python Worker 통합이 통과했다. 현재 확인된 미해결 결함은 없지만 실제 GNOME QA는 미실행이며 release-ready를 뜻하지 않는다. 전용 코드 검토는 사용량 한도로 완료되지 못했고, 수동 diff scan의 범위와 한계는 verification.md에 기록했다.

확인 대기: GNOME 실제 버전/API 차이, Snap/Flatpak 창 매핑, PSS 접근 제한, Chromium background 생존, 정상 닫기 취소 구분, Archsport actor 감지와 노치 슬롯. 이 항목은 재현된 버그가 아니라 설계 위험이다.

구현 후 형식: ID / S1–S4 / 환경 / 재현 절차 / 기대 / 실제 / 증거 / 수정 commit / 재검수. S1(손실·권한·핵심 중단), S2(기능 불가)는 릴리스 전에 해결한다.
