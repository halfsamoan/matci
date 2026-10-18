## Parity: 32.3 / 100

features 32.3  (13 counted, must-haves 0 of 6 done)

Not shippable yet: 6 must-have features are not done.

## By area, weakest first
- disk                           0.0  (3 features)
- organize                       0.0  (2 features)
- history                       30.0  (2 features)
- memory                        50.0  (4 features)
- settings                      50.0  (1 features)
- notch                         50.0  (1 features)

## Missing, in build order
- [must] history: 결과 재측정과 기록, partial  (F03 F08 S05; 관측 변화량과 실제 귀속 구별; M3; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [must] memory: 앱 선택과 정상 닫기, partial  (F03 S02; 사용자 선택 및 현재 창 재검증; M3; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [must] memory: 앱별 메모리 목록, partial  (F02 S02; PSS 우선 RSS fallback 구별; M1-M2; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [must] memory: 전체 메모리 상태 표시, partial  (F02 S02; MemAvailable 기반 계산 정의 표시; M1-M2; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [must] memory: 활동 중 앱 보호와 이유, partial  (F03 F05; S02; 터미널과 개발 도구 보호; M1-M3; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [must] notch: 빠른 상태 진입, partial  (F02 S04; 원본 menu bar를 GNOME 노치로 재설계; M1-M2; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [should] disk: 디스크 읽기 스캔, no  (F06 S06; M4)
- [should] disk: 디스크 항목 분류, no  (F06 S06; Linux 경로 규칙 별도 검증; M4)
- [should] history: 기간별 사용량 추세, no  (F08 S05; M4)
- [should] organize: 폴더 이동과 undo, no  (F07 S07; 충돌과 변경 원본 보호; M4)
- [should] organize: 폴더 정리 미리보기, no  (F07 S07; 사용자 선택 root만; M4)
- [should] settings: 임계값 설정, partial  (F04 S03; 제품 정책 초안; M3; 소스/합성 검증 및 WSL 수집 구현; 실제 GNOME P0 미검증)
- [could] disk: 재생성 가능 캐시 정리, no  (실행 중 앱 제외와 계획 재검증 이후 별도 구현; M4 이후)

## Left out on purpose (not scored)
- 자동 메모리 종료: matci MVP는 제안만; 자동 종료는 미지원
- 앱 제거: 원본 macOS 제거와 Linux 패키지 관리는 다름; M5는 설치 출처 안내부터
- APFS 공유 저장과 macOS 투명 압축: ext4 기본 Ubuntu와 같은 기능으로 약속하지 않음
- Apple Shortcuts 통합: 대상 Linux 플랫폼 범위 밖

## Yours, not in the original (not scored)
- Archsport 노치 모션 재사용
- Archsport 동시 노치 충돌 대응
- PSI와 메트릭 종류 표시
- 절전 복귀와 worker 단일 수명
- 키보드와 모션 감소
- 자동 관리 제안 모드
- Chrome 탭 discard
