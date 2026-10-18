# 검증 기록

2026-10-18 / Windows. 계획 산출물의 검사 결과는 아래에 추가한다. 실제 앱·GNOME 검수와 구별한다.

- 원본 공개 자료: sources.md의 페이지와 사용자 이미지 참조. 원본 앱 실행은 하지 않음.
- REA doctor: CLI 6.5.0 / skill42, Codex 등록 missing/config_drift, exit1. 설정 변경 없음. 원본 REA Evidence 없음.
- 설계 무결성: `rtk proxy python tools/verify_planning.py` exit0. JSON/CSV 파싱, 로컬 Markdown 링크, 참고 이미지6개 SHA256, 기능표24행 고유성/상태 검사 통과.
- SQLite: in-memory 초안5테이블 생성, foreign keys 활성 확인. 잘못된 total/available/orphan/metric/builtin 보호/observed delta 입력6건 거부, cascade·SET NULL·음수 변화량·FK consistency 검사 통과. 실제 사용자 DB 생성 없음. store 권한 검사나 OS 제어 검증이 아님.
- 디자인 대비: replica-design의 `contrast.py` exit0, 제안 조합 **13/13 AA 통과**, 최소 비율5.52:1. 결과는 `design/contrast-report.json`, CSS 초안은 `design/tokens.css`. 실제 UI·focus·배율 검증이 아님.
- parity: replica-diff의 `parity.py` exit0, **0.0/100, 원본 must 0/6**, 원본 비교13행. `parity.md`에 도구 결과 저장. 추가 matci 요구는 별도 행이며 점수에서 빠지므로 최종 P0 검수를 따로 적용한다. 도구 exit0은 제품 출시 가능 판정이 아니다.
- 앱 단위 테스트/E2E/GNOME/schema compile/정상 앱 닫기/절전/배율/성능: **모두 미실행**.

노치 source manifest는 사용자 Archsport 파일 hash와 발췌이며 GNOME 작동 통과 증거가 아니다. 사진은 참고 전용으로 저장하고 제품 패키지에서는 제외한다.

Linux 기술 조사와 아키텍처의 독립 검토에서 지표별 freshness, 앱 view 저장 경로, 보호 규칙 원본, 요청 전 receipt ack, 중단 기록 처리를 보완했다. 이 검토도 앱 실행 검수로 세지 않는다. 설계 검증 명령은 표준 라이브러리만 사용하므로 Linux에서 `python3 tools/verify_planning.py`로 반복할 수 있다.
