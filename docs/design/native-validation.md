# Native GNOME validation log

## 2026-10-20 마무리 후보 (matci v16 / Archsport v19)

격리된 `GSETTINGS_BACKEND=keyfile` GNOME Shell 50.1(1600×900 가상 모니터)에
최종 소스를 설치해 확인했다. 합성 경기·앱 상태는 실행 중인 복사본에만 Eval로
주입했고 소스에는 없다. [matci v16 캡처](iterations/README.md), [Archsport v19 캡처](../../../archsport/docs/design/iterations/README.md). 실제 사용자 세션은 아직 v17/v14 ACTIVE다.

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
