# Native GNOME validation log

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
