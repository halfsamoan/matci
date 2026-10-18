# REA + replica 전체 적용 기록

사용자가 전체 pack 및 REA를 요청했고 뒤이어 architect/REA를 직접 지정했다. 관련 SKILL.md 12개를 읽고 현재 목표인 **분석과 최종 계획**에 적용했다. 아래의 “후속”은 스킬 미호출을 숨기는 표시가 아니라 구현·배포를 아직 수행하지 않았다는 상태다.

| 스킬 | 이번 적용 | 산출물 / 상태 |
|---|---|---|
| reverse-engineer-anything | 질문·증거·추론·미확인 구분, CLI doctor, 독립 Linux 질문 병렬 조사 | rea.md / sources.md; 원본 binary/runtime 분석 미실행 |
| replica-recon | 앱 식별, 8화면/8흐름, 컴포넌트/모델/경계 | recon.md / features.csv / screens manifest |
| replica-architect | recon 기반 native stack, 5-table SQLite 초안, 0 HTTP routes, stdio/UI 계약 | architecture.md / schema.sql / contracts/ |
| replica-design | matci 역할 토큰·대비·컴포넌트·사용자 모션 근거 | design/; primitives는 M1 구현 |
| replica-build | 핵심 vertical slice와 단계별 화면/파일 순서 | build-log.md / IMPLEMENTATION_PLAN; 실행 앱 미구현 |
| replica-backend | local worker·SQLite·권한·보존 설계, 불필요한 cloud/auth/payment 제외 | backend.md; 실제 collector/DB migration 적용은 후속 |
| replica-test | 흐름별 정상/경계/부정 검수와 실기 gate | test-plan.md / bugs.md; 앱 E2E 미실행 |
| replica-diff | 초기 기능표를 도구로 계산, 참고/clone 화면 조건 구분 | parity.md; 원본 기능 parity 0/100, visual diff 불가 |
| replica-entrepreneur | 접근 가능한 리뷰의 실제 범위 기록, 샘플 부족 명시, Linux 설계 가설 분리 | reviews.csv / feedback.md / fixes.md |
| replica-brand | 사용자 이름 matci 유지, 자체 palette/문구/명명 확인 계획 | brand.md / brand.json; 상표·도메인 확보 주장 없음 |
| replica-launch | 개인 포트폴리오 설명·가격 비적용·향후 소개 절차 | launch/; 마케팅 사이트·스토어 미게시 |
| replica-deploy | Linux 설치 검수·backup·rollback gate 설계 | deploy.md; 설치/공개 배포 미실행 |

스킬의 웹 SaaS 기본값(Next/Postgres/Stripe)은 native 사용자 범위에 맞게 대체했다. brand의 이름 후보 20개 생성은 사용자가 이름을 이미 지정했으므로 수행하지 않는다. 모바일 스토어용 listing/유료 티어도 생성하지 않는다. 구현 전 commits/screenshots/sweep를 제품 완성처럼 보고하지 않는다.
