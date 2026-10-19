# matci reconstruction audit

## 2026-10-20 후속 구현

실제 Shell은 재로그인 후 v13 ACTIVE였다. 다음 후보 v14에는 사용자 설치
Pretendard 1.3.9와 상단 중앙 104×8에서 펼쳐지는 등장 모션을 적용했다.
격리 GNOME 50.1의 계산 글꼴과 모션 프레임은
[캡처](iterations/README.md)에 기록했다. 아래 v12/v13 상태 설명은
당시 기록이며, 새 후보의 실제 사용자 세션 검수는 아직 남아 있다.

The paired source audit and prototype are in
`../../../archsport/docs/design/notch-reconstruction-audit.md` and
`../../../archsport/docs/design/prototype/notch.html`. This repository's
installed v12 `extension.js`, `stylesheet.css`, `notchDock.js`, and
`dockModel.js` match source SHA-256 after the 2026-10-19 relogin. The user
subsequently supplied the four reference/current images; they are copied into
Archsport's `docs/design/reference/`. The current matci crop shows the light
card, filled round controls, explanatory normal-state row, and thick scrollbar.

matci-specific changes proposed for the prototype: keep the normal view
monochrome; show system percent, used and available amounts, a subtle meter,
top apps, and Review. Move RAM basis and metric caveats to accessible text or
the existing settings/details path, while preserving the distinction between
system RAM and per-app PSS/RSS in any labels that could imply aggregation.
Keep protection reasons and close consequences visible in the review flow.

The v13 source applies the normal-state density and dark surface changes.
Protected apps still show an inline `보호됨` label and expose the reason through
the disabled row's accessible name. The review confirmation and close policy
are unchanged. An isolated GNOME Shell 50.1 virtual-monitor render now verifies
the empty, three-app, and review layouts with synthetic states; see
`docs/design/iterations/README.md`. The user's installed session has not loaded
v13, so real input, scale, and close behavior remain unverified.
