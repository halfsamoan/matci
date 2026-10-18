# 로컬 backend 계획

서버·계정·결제·메일·외부 API는 적용하지 않는다. backend 역할은 stdlib worker와 SQLite다. `.env.example`이나 API 키가 필요한 설계가 아니다.

- [x] 저장 위치·owner UID·데이터 최소화 결정 (`architecture.md`).
- [x] 5-table schema 초안 작성. 실제 사용자 DB에 적용하지 않음.
- [x] worker read-only 수집과 Extension 창 닫기 책임 분리.
- [x] 메시지 크기/enum/idempotency 및 잘못된 입력 계약 작성.
- [x] Shell app view→worker 기록 경로와 GSettings 보호 목록의 DB mirror 결정.
- [ ] collector 구현, missing/partial/권한 경합 unit tests.
- [ ] 모든 store query의 current UID와 cross-table ownership 검사 구현.
- [ ] migration runner의 version 검증·트랜잭션·upgrade backup 구현.
- [ ] XDG 디렉터리0700/파일0600·atomic summary writer·보존 구현.
- [ ] fixture/demo에서 실제 action으로 이어질 수 없는 runtime guard 구현.
- [ ] stdin command validation·중복 action 저장·이전 session 거부 검사.
- [ ] requested commit/ack 이후에만 닫기, 중단된 receipt는 partial/INTERRUPTED 처리.
- [ ] crash/resume baseline 및 한 worker 보장 실기 검수.

보호 규칙과 metrics는 로컬 사용자 데이터다. 원시 argv/env/window document title은 DB와 진단에 저장하지 않는다. 분류에 child activity가 필요하면 같은 UID 정보만 메모리에서 제한적으로 보고, 민감한 문자열 대신 reason enum만 남긴다.
