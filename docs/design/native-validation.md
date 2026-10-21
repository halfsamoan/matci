# Native GNOME validation log

## 2026-10-21 UX 검토 (matci v21, 브랜치 claude/ux-review)

격리된 GNOME Shell 50.1에 소스를 설치하고, 계산기 창 1개와 합성 상태로 촬영했다. 실제 세션 결과는 아니다.

- 목록: 메모리 내림차순으로 정렬하고, 열려 있는 동안 순서를 고정한다. 보호 이유를 이름 아래에 표시한다. 선택이 0개일 때 안내한다.
  'N개 앱 닫기…' → 질문형 검토 → 위험 색 '창 닫기'. 검토로 들어가면 '취소'에 포커스를 둔다.
- 값이 없을 때: 문제 카드(원인, 자동 재연결, '지금 다시 연결')를 보여 준다.
  머리말 '연결 끊김'과 버전 불일치 시 재로그인 안내. 숨은 행은 높이 계산에서 뺀다.
- 큰 글자(pt 글꼴), 키보드(머리말 기준점, stage Esc, 포커스 링 배경)는 Archsport와 같다.
  가상 키보드로 열기 → Tab → Esc와 포커스 복귀를 확인했다.
- 설정 창: 제안 기준 비활성 연동, 단축키 줄, 앱 선택형 보호 목록, 기록 한국어화. 격리 셸에서 오류 없이 열린다.
- 아직 하지 않은 것: 실세션 설치/재로그인, 실제 앱 닫기 흐름 재검증, Orca 낭독.


## 2026-10-20 Mac 노치 slab (matci v18 / Archsport v21, 브랜치 design/mac-notch)

격리된 GNOME Shell 50.1(1600×900 가상 모니터, `GSETTINGS_BACKEND=keyfile`)에 최종 소스를
설치하고, 실행 중인 복사본에만 Eval로 합성 상태를 넣어 촬영했다. 실제 세션·실제 경기·입력·배율
결과가 아니다.

- 형태: 목·어깨·본문 3단을 없애고 패널 바로 아래(간격 0)에서 흘러나오는 한 덩어리로 바꿨다. 위
  모서리는 오목 귀(높이에 따라 6→14px), 측면은 수직, 아래 반경은 펼침 22·낮은 compact는 높이
  비례(34px에서 15)다. 본문 폭(344/388/368)은 그대로이고 할당 폭에 귀 두 개가 더해진다. 클릭
  판정은 귀를 뺀 slab(판정 위젯 6개→2개)이고, 귀와 아래 모서리 바깥은 아래 화면으로 전달된다.
- 재질: 블러를 제거하고 패널 배경색을 읽어 같은 색으로 칠한다(이음매 없음). 아래로 3% 밝아지는
  lift와 측면·아래 1px 키라인(흰 7%)만 재질감으로 둔다. 패널 테마가 반투명이면 검정으로 대체한다.
- 모션: 목 점화→어깨→본문 3단 대신 cubic-bezier(.2,.8,.2,1) 한 번의 변형(열림 210·닫힘 160ms).
  내용은 최종 크기로 고정된 채(FixedLayout 홀더) 표면이 자라며 드러나고, 50/75ms 뒤 3px 위에서
  내려오며 정착한다. 접힐 때는 내용이 90ms에 사라지고 그 시점에 compact 내용이 줄어드는 표면
  안에서 정착한다. 연속 클릭은 현재 기하에서 되돌아간다.
- 두 노치: 함께 보이면 본문 간격을 귀 두 개(28px)만큼 벌려 각자 패널에서 흘러내린 덩어리로 보인다.
- 색: 흰색은 주정보(점수·상대 팀명·사용률·앱 이름)에만, 나머지는 회색 3단계. 파랑은 키보드
  포커스와 matci 주 버튼, 초록은 지금 진행 중인 경기, 주황은 실제 경고에만 쓴다. 숫자는 tnum.
- matci: 머리말 제목 앞·도구 뒤 끝, 지표 행 기준선 정렬, 앱 행에서 RSS/PSS 접미사 제거('0.83 GB',
  2^30 기반 값의 메모리 관행 표기). PSS와 RSS 값이 함께 보일 때만 RSS 값 앞에 '≤'(상한)를 회색으로
  붙인다. 지표 종류·측정 나이·보호 이유는 접근성 이름에 남는다. 보호 앱은 행 끝 회색 자물쇠,
  선택은 중립 회색 강조 + 흰 체크. partial 상태는 값이 빠진 행이 있을 때만 알린다. 측정 전 스타일
  적용으로 처음 열 때 높이가 12px 모자라던 문제를 고쳤다.
캡처: [기본·두 노치](iterations/16-v18-normal-coexist.png), [선택](iterations/17-v18-selected.png), [검토](iterations/18-v18-review.png), [닫힘](iterations/19-v18-close.png).

- 메모리(같은 격리 조건, 상태마다 새 Shell): 켜고 끄기 10회에서 actor는 Archsport +66/−66, matci +13/−13으로
  정확히 돌아오고(판정 위젯 4개 감소), fd와 worker 수도 원상 복귀했다. Shell 쪽 Archsport 비용은 익명 메모리
  +4~9MB 범위로 측정마다 흔들렸다(새 Shell 기준선 자체가 296–302MB로 변동). tnum 유무 A/B(각 2회)에서도
  차이를 구분할 수 없었다. 블러 FBO와 노치 아래 화면이 바뀔 때의 재블러가 사라졌다.
- Ubuntu 세션 모드(Yaru, 패널 #131313)에서 패널과 노치 윗단이 같은 (19,19,19)로 이어지는 것을 확인했다.
  아직 판정하지 않은 것: 실제 화면의 배율·입력·프레임, 라이트 배경 위 인상, 5분 유휴 CPU.

## 2026-10-20 마무리 후보 (matci v16 / Archsport v19)

격리된 `GSETTINGS_BACKEND=keyfile` GNOME Shell 50.1(1600×900 가상 모니터)에
최종 소스를 설치해 확인했다. 합성 경기·앱 상태는 실행 중인 복사본에만 Eval로
주입했고 소스에는 없다. [matci v16 캡처](iterations/README.md), [Archsport v19 캡처](https://github.com/halfsamoan/archsport/blob/main/docs/design/iterations/README.md). 실제 사용자 세션은 아직 v17/v14 ACTIVE다.

- 계획 격차 수정: matci 노치 루트를 St focus group으로 등록해 Tab·방향키가 행,
  보호 행(보호 이유 포함), `검토 N`에 닿는다. 새로고침은 worker 오류·갱신
  실패·worker 중단 때만 보이며 버전 불일치 안내를 덮지 않는다. Archsport 결과 행과
  다른 진행 경기의 접근성 이름은 스포일러 설정이면 점수를 숨기고, 두 팀 행에도
  홈/원정을 넣는다. 일정 머리말의 중복 아이콘을 없앴다. 두 노치는 닫힐 때
  보조정보를 먼저, 주정보를 45ms 뒤 거두고 160ms에 목으로 돌아간다. compact 어깨는
  목 아래 깊이 18(허용 18–26)이고, 점화 프레임(높이 ≤12)은 어깨 곡선이 교차하지
  않도록 목 사각형만 그린다.
- 블러 누출 수정: v18/v15 캡처의 아래 모서리 바깥에 블러 사각형이 희미하게
  보였다. St가 스타일을 다시 계산할 때 CSS 기준으로 margin을 덮어써 블러 actor의
  `margin_*` inset이 0이 되었고(할당 상자 0,0–388×322), BACKGROUND 블러가 표면
  사각형 전체에 칠해졌다. 블러를 끄면 모서리 바깥 픽셀이 (83,44,65)에서 배경화면
  (100,37,72)으로 돌아오는 것으로 원인을 확인했다. inset을 위젯 style로 옮기고
  8px로 줄였다(할당 24,34–364,298). 블러를 켠 여섯 상태 모두 모서리 바로 바깥
  픽셀과 배경화면의 차이가 5 이하다. `Shell.BlurEffect`는 두 확장 모두 BACKGROUND,
  반경 28, 밝기 0.73으로 붙어 있다.
- 클릭 판정 수정: `Main.loadTheme()`(밝기 테마 전환과 같은 경로) 후 판정 영역의
  margin이 0이 되어 투명 상단 모서리가 노치로 pick되었다. `style-changed`에서 다시
  계산하도록 고친 뒤에는 테마 재적용 전후 모두 투명 모서리·어깨 바깥·아래 모서리
  바깥은 `Meta_BackgroundActor`, 목과 본문은 노치로 pick되었다.
- 모션: 열림은 너비와 높이가 함께 커지고, 90ms 재클릭은 현재 크기에서
  되돌아간다. `enable-animations=false`면 20ms에 완성 크기다. 시간은 GLib 타이머
  요청값이며 실제 디스플레이 프레임 시간이 아니다.
- 검사: Python(Archsport 67, matci 52), Node(Archsport 19, matci 29), 스키마,
  `build_design.py --check`, 공유 파일 바이트 일치, ESLint(npx 캐시의 flat config
  eslint, 오류 0·기존 `_error` 미사용 경고만)를 통과했다. 격리 Shell 로그에
  `JS ERROR`와 `backdrop blur unavailable`가 없었다.

- RAM·수명주기(같은 격리 조건, 상태마다 새 Shell, 40초 안정화 후 5초 간격 8회
  중앙값): 두 확장이 gnome-shell에 더하는 RSS는 3–6MB이고 수정 전후 차이는 새
  Shell 간 잡음(±2MB) 안이다. 10회 켜고 끄기에서 actor는 Archsport +70/−70,
  matci +17/−17로 정확히 돌아오고 fd와 worker 수도 원상 복귀했다. 비용의 대부분은
  Python worker다. matci worker는 최근 snapshot 128개를 프로세스 목록째 보관해 실제
  /proc 기준 24MB에서 약 11분 동안 48.5MB(PSS 37MB)까지 늘었다. 지난 snapshot에서
  프로세스 목록을 빼고 응답 캐시를 압축하자 15분 동안 20.5MB(PSS 11.6MB)로
  평탄했다. Archsport worker는 약 27MB로 같고, 날마다 쌓이던 지난 football-data 창
  캐시 행과 오래된 라이브 snapshot을 정리해 장기 증가를 막았다. Shell 쪽에서는
  2초마다 반복되던 알림 파일 재기록, 대기 중 읽기 때문에 닫히지 않던 stdout 파이프,
  8KB마다 약 90KB 줄을 다시 인코딩하던 matci 수신 버퍼, 해제되지 않던 Cairo
  context와 스크롤 timeout을 정리했다.
- 실제 세션(v17/v14, 수정 전 코드) 45분 관찰: gnome-shell RSS+swap은 약 350.6MB에서
  평탄했다. `gnome-extensions disable matci@local` 뒤에도 matci가 ACTIVE로 남아 worker가
  계속 돌았다. GNOME Shell 50.1 `_callExtensionDisable`이 await 전에 계산한 순서
  인덱스로 `_extensionOrder`를 지우는 구조라, 겹친 enable/disable 이후 matci가 순서
  목록에서 빠진 것으로 보인다. 재로그인 전까지 이 세션의 matci 끔 측정은 유효하지
  않다.

아직 판정하지 않은 것: 실제 화면의 100/125/150% 배율, 실제 마우스·키보드·
스크린리더, overview·fullscreen·잠금·절전 복귀, 실제 디스플레이의 프레임 간격과
블러 켬/끔 5분 유휴 CPU. headless 가상 모니터는 유휴 중 다시 그리지 않으므로
유휴 CPU 비교 근거가 되지 않는다.

## 2026-10-20 목·어깨·본문 후보 (matci v15 / Archsport v18)

격리 `GSETTINGS_BACKEND=keyfile` GNOME Shell 50.1에서 두 확장을 함께
ACTIVE로 띄웠고, 임시 개발 복사본의 합성 기본·선택·검토 화면을
[캡처](iterations/README.md)했다. 보호 앱의 이유는 접근성 이름에 남기고
회색 자물쇠와 짧은 보호 표시를 그린다. 선택 전 `검토 0`과 정상 상태의
새로고침은 숨긴다. 테스트 목록을 stage에 붙인 뒤 높이를 계산해
`St-CRITICAL ... not in the stage` 경고도 해소했다.

가상 모니터의 hit probe에서 투명한 상단 모서리는 배경 actor, 목·어깨는
노치 hit actor로 pick됐다. 새 v18/v15를 다음 로그인용으로 함께 스테이징했고,
실제 사용자 Shell은 아직 matci v14 ACTIVE이며
실제 입력·배율·5분 유휴 성능 검수는 남았다.

## 2026-10-20 Pretendard / reveal candidate (v14)

재로그인 후 사용자 Shell은 matci v13 ACTIVE였다. 다음 후보 v14의
Pretendard 글꼴과 상단 앵커 등장 모션을 격리 GNOME Shell 50.1에서
합성 앱 목록으로 렌더링했다. 노치 루트와 패널 숫자의 계산 글꼴이 각각
Pretendard와 Pretendard Bold였고, [20/130/360ms 요청 시점
캡처](iterations/README.md)에서 시작 형태와 완성 형태를 확인했다.
현재 사용자 세션의 v14 입력·배율·절전 검수는 아직 남아 있다.
v14와 Archsport v17을 함께 다음 로그인용으로 스테이징했다. 최종
Python/Node/ESLint/schema 검사와 공유 도크 일치 검사를 통과했고,
임시 합성 코드 없는 격리 Shell의 동시 시작에도 `JS ERROR`가 없었다.

2026-10-19, GNOME Shell 50.1, Wayland. Logical monitor reported as 1728×972. The user logged in again; `gnome-extensions info` confirms Archsport v14 and matci v11 are ACTIVE. The next source candidates are v15/v12 and require their own native reload after staging.

## Verification completed

- Source syntax, Python/Node tests, schema dry run, CSS generation check and local byte comparison of shared tokens passed.
- `Clutter.AnimationMode.EASE_OUT_QUART` and `EASE_OUT_CUBIC` are present in the installed Clutter 18 typelib.
- GNOME interface currently reports `color-scheme='default'`, `gtk-theme='Yaru-purple'`, and animations enabled. The code selects the light expanded variant in this appearance.
- Code inspection confirms the existing shared dock outside-click logic and matci `keepReview: true` path are preserved. Both dock implementations now use the same motion duration and easing tokens.
- After the screen unlocked, the screenshot portal captured the **old installed** v11/v8 panel. The cropped baseline is `docs/design/iterations/00-before-panel-gnome50.png`; the full-desktop capture was removed.
- The user supplied native crops of the v14/v11 expanded UI: excess blank space in matci and a gray rectangular shadow visible beside a rounded Archsport corner. The v15/v12 source reduces widths and padding, sizes the matci list viewport from its content, rounds all four outer corners, and removes the outer shadow. The visual outcome is still unverified.

## Native visual gate pending

The desktop initially reported `org.gnome.ScreenSaver.GetActive = true`. Both `gnome-screenshot` and the screenshot portal returned a black image while locked; those captures were discarded. After the user's relogin, the v14/v11 surfaces are loaded. The tighter v15/v12 source is not loaded yet, so its appearance and motion are not claimed.

After unlock and the staged update applies at the next GNOME login, capture and inspect at least three iterations of the following actual GNOME states, saving only cropped UI evidence under `docs/design/iterations/`:

| Archsport | matci |
| --- | --- |
| idle panel, compact live, expanded live, goal event, schedule, multiple games, error | panel, overview, app list, selected apps, review, result, error |

Then validate 100/125/150% scaling, input including right/middle/side clicks, repeated open/close, cross-app ownership, overview/fullscreen, suspend/resume, lifecycle and 30-minute CPU/GPU/RSS before producing `final-apple-audit.png`. The worker/API paths must remain unchanged. Inspect relevant redacted `journalctl --user -b -o short-precise` errors after the actual run.

## 2026-10-20 Reliability/accessibility integration (Archsport v23 / matci v20)

Source validation on the integration worktrees passed: Archsport Python 80/80 and Node 33/33; matci Python 79/79 and Node 44/44; ESLint `--max-warnings 0` reported no warnings in either repository. Design generation/checks passed and the shared design files matched byte-for-byte.

No isolated GNOME Shell scenario, real-device measurement, staging/install, or relogin check was run for these versions. The handoff document's §1 prohibits those shell/device/staging actions in this task. Existing screenshots and measurements above describe earlier versions only and do not validate v23/v20. C1/C2/C7/C8/C9/C11 input, accessibility, lifecycle and resource behavior remain pending their permitted native review.
