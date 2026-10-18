# REA 조사 기록

2026-10-18. 적용 스킬: `reverse-engineer-anything` v42 및 연결 복구 가이드.

## 질문과 상태

| 질문 | 증거 | 판정 |
|---|---|---|
| 어느 앱인가 | E01–E06 + S01/S02/S11 | Mint for Mac, 높은 신뢰 |
| 메모리 해제는 무엇인가 | S02 | 앱 정상 종료 요청. 탭 discard로 단정하지 않음 |
| 원본 내부 구현은 무엇인가 | 원본 binary/package/runtime 없음 | 미해결, 이번 계획의 의존성 아님 |
| Linux 이전 가능성 | L01–L09 + 사용자 Archsport 소스 | 공식 문서 기반 설계, 실기 미검증 |
| REA 도구가 연결됐는가 | `rtk proxy rea doctor --client codex --json` 실행 | CLI 6.5.0/skill 42, Codex registration missing/config_drift, exit 1 |

현재 세션 도구 목록에 REA binary/session 도구가 없었다. doctor는 읽기 진단이며 사용자 설정을 고치지 않았다. 엔진 부재 안내는 원본 분석을 실행했다는 뜻이 아니다. 진단 전체는 개인 경로가 포함돼 공유 산출물에 저장하지 않았다.

REA의 “Every conclusion must distinguish observations, inferences, and unknowns.” 원칙을 recon과 sources에 적용했다. E/S/L/A ID는 자체 조사 ID다. **REA Evidence가 생성되지 않았으며 디컴파일·동적 원본 추적을 수행하지 않았다.**

사진만 주어진 현재 목표에는 패키지 분석 도구의 유효 입력이 없다. 임의의 다른 프로그램이나 사용자 Archsport를 원본 분석 대상처럼 대체하지 않았다. 공개 가이드와 사진으로 행위 사양을 작성하고 Linux 구현은 새로 작성한다.

추후 명시적으로 원본 package/runtime 분석이 필요한 경우 실제 아티팩트·질문을 먼저 고정하고 REA setup dry-run의 변경 경로·백업을 검토한다. 현재는 setup이나 Hopper/Ghidra 설치가 계획 완성에 필요하지 않다.
