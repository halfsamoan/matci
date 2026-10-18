# 앱 identity 참고 자산

웹 시연에서만 사용하는 앱·테마 아이콘이다. Mint 자산은 사용하지 않았다. 제품 소유/제휴를 주장하지 않는다.

- `chrome.svg`: [Google Chrome 공식 정적 자산](https://www.google.com/chrome/static/images/chrome-logo.svg). Google Chrome 표장은 Google 소유. 원본 SVG, 2026-10-18 취득.
- `code.png`: [Microsoft VS Code 공식 저장소](https://github.com/microsoft/vscode/blob/main/resources/linux/code.png). VS Code 표장은 Microsoft 소유. 원본 PNG, 2026-10-18 취득. [브랜드 정책](https://code.visualstudio.com/brand).
- `files.png`, `terminal.png`, `image.png`: Ubuntu22.04의 `tango-icon-theme`32×32 원본. 일반 파일/터미널/이미지 MIME 테마 아이콘이며 특정 앱 로고를 가장하지 않는다. [Tango 프로젝트](https://tango.freedesktop.org/), public domain. Ubuntu 패키지 copyright 안내를 동봉한다.

실제 GTK 앱은 이 고정 자산 대신 해당 기기에 설치된 `Gio.AppInfo.get_icon()`의 GIcon을 사용한다. 앱 entry가 없으면 GNOME 테마의 일반 앱 아이콘으로 표시한다.
