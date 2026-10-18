# 조사 출처

확인일: 2026-10-18 Asia/Seoul. E/S ID는 이 프로젝트의 조사 식별자이며 REA가 생성한 Evidence ID가 아니다.

| ID | 출처 | 사용 범위 / 한계 |
|---|---|---|
| E01–E06 | 사용자 첨부 JPG, `screens/manifest.json` | 실제 사진에서 보이는 화면만. 영상 순서·프레임 시간·숨은 동작 미확인 |
| S01 | https://mintstorage.app/ | 제품 정체, 전체 기능 범주 |
| S02 | https://mintstorage.app/guides/memory/ | 유휴 앱 선택, 정상 종료, 임계값 Auto Care |
| S03 | https://mintstorage.app/guides/auto-care/ | 자동 관리 설정과 동작 조건 |
| S04 | https://mintstorage.app/guides/disk/ | read-only scan, 네 가지 분류 |
| S05 | https://mintstorage.app/guides/safe-to-clean/ | 캐시 후보, 사용 중/변경된 파일 제외 |
| S06 | https://mintstorage.app/guides/optimize/ | macOS 저장 공간 최적화의 사용자 동작 |
| S07 | https://mintstorage.app/guides/organize/ | 미리보기, 이동, 되돌리기 |
| S08 | https://mintstorage.app/guides/menu-bar/ | 빠른 상태·작업 진입, 로그인 시작 |
| S09 | https://mintstorage.app/guides/trend/ | 로컬 기록 기반 추세 |
| S10 | https://mintstorage.app/pricing/ | Direct와 다른 에디션 구별. 현재 Direct는 메모리 해제 무료·무제한, 정리/분류 합산 주 1GB, Unlimited 1대 $39.99 일시불 또는 $9.99×4. matci 가격 결정 근거로 사용하지 않음 |
| S11 | https://mintstorage.app/terms | 게시자 DZG Studio LLC 및 공개 조사 범위 확인 |
| S12 | https://mintstorage.app/build-journey/37-gb-of-memory-on-a-mac-using-29/ | 개발팀이 공개한 메모리 합계·활동 판별·PID 검증 문제. 독립 사용자 리뷰가 아님 |
| S13 | https://apps.apple.com/us/app/mint-disk-cleaner-organizer/id6762415711?mt=12 | 검색 결과에서 앱 이름·게시 정보·리뷰 1개 발췌 확인. 본문 open 실패. Mac App Store판과 Direct 기능 차이 주의 |
| L01 | https://www.kernel.org/doc/html/latest/filesystems/proc.html | meminfo, 프로세스 지표 및 PSS/RSS |
| L02 | https://www.kernel.org/doc/html/latest/accounting/psi.html | PSI some/full |
| L03 | https://docs.kernel.org/admin-guide/sysctl/vm.html#drop-caches | drop_caches를 제품 정리 방식으로 채택하지 않는 근거 |
| L04 | https://mutter.gnome.org/meta/method.Window.get_user_time.html | 창 입력 시각. 온라인 문서와 대상 GNOME 버전 차이 재확인 필요 |
| L05 | https://mutter.gnome.org/meta/method.Window.get_pid.html | 0/불확실한 PID 매핑, 단독 신뢰 금지 |
| L06 | https://mutter.gnome.org/meta/method.Window.delete.html | 정상 창 닫기 요청. 실제 종료 보장은 아님 |
| L07 | https://developer.chrome.com/docs/extensions/reference/api/tabs#method-discard | Chrome 확장 탭 discard API 존재 |
| L08 | https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging | 별도 브라우저 연동의 후속 경로 |
| L09 | https://support.google.com/chrome/answer/12929150?hl=en | Chrome Memory Saver 보호 활동 |
| A01 | 사용자 Archsport commit `7aeb397cc8f736b82f75aed5010a870a8794b59a` | `extension/extension.js`, `extension/stylesheet.css`, `web/style.css`, `web/tokens.css`, `web/app.js` 실제 코드. `design/archsport-motion.json`에 해시·라인·발췌 보관 |

원본 실행 파일·소스·사설 API·계정은 사용하지 않았다. 전체 페이지를 복제해 보관하지 않고 필요한 사실과 링크만 기록한다.
