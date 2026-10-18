# matci — 포트폴리오 02

Ubuntu GNOME용 메모리 관측·정리 도우미. 현재 단계는 **원본 조사와 구현 계획 완료, 앱 구현 전**이다.

Windows에서 준비하고 ASUS Vivobook 15 Pro의 Ubuntu GNOME에서 사용한다. Archsport와 같은 패널 아래 노치 모션을 사용한다.

- [최종 작업 계획](docs/IMPLEMENTATION_PLAN.md)
- [Linux 인수인계](docs/LINUX_HANDOFF.md)
- [원본 앱과 화면 분석](replica/recon.md)
- [구조와 데이터 계약](replica/architecture.md)
- [전체 스킬 적용 기록](replica/skill-coverage.md)
- [검증 상태](replica/verification.md)

첫 구현 흐름: 실제 RAM 관측 → 후보와 제외 이유 표시 → 사용자가 고른 창에 정상 닫기 요청 → 결과 재측정.

계획 문서는 실행 앱이 아니다. 데모·Windows 점검과 Linux 실기 검수를 구별한다. 폴더는 첫 프로젝트와 독립적으로 만들었으며 기존 프로젝트의 파일을 수정하지 않는다.
