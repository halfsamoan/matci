# 개발·검증 참고

[프로젝트 소개](README.md)

기존 README의 상세 실행·검증 내용을 이 문서로 옮겼습니다. 과거 실행 기록은 당시 환경의 결과이며 새 검증 결과를 뜻하지 않습니다.

## Windows에서 보기

```powershell
python -m http.server 4180 --bind 127.0.0.1 --directory web
```

[시연 화면](http://127.0.0.1:4180)에서 패널 RAM 항목, 상세 오버레이, 메모리 선택·검토·기록·설정을 확인한다. 합성 데이터이며 Windows 앱이나 실제 메모리는 변경하지 않는다.

## Ubuntu에서 로그아웃 없이 개발

```bash
python3 tools/dev.py --check-only
python3 tools/dev.py
```

두 확장을 `.dev/`의 분리된 XDG 데이터·설정·상태 경로에 설치하고 중첩 GNOME Shell에서 함께 실행한다. 파일 변경 때 테스트와 schema 검사를 통과한 경우에만 중첩 Shell을 다시 띄운다. 메인 데스크톱 세션과 사용자 확장 설치는 건드리지 않는다. Archsport 저장소에서 시작하려면 `python3 tools/dev.py`를 실행하면 matci 개발 루프로 연결된다.

Mutter Devkit이 아직 없으면 `python3 tools/dev.py --headless`로 두 확장의 GNOME 시작 상태를 검사할 수 있다. 이 모드는 화면·입력·배치 검수를 대신하지 않는다.

GNOME 49+에서 화면을 띄우려면 Mutter Devkit이 필요하다. Ubuntu 패키지는 `mutter-dev-bin`이다. 이 패키지가 없으면 검사와 격리 staging은 끝내고 화면 실행 단계에서 중단한다.

## Ubuntu 설치

```bash
python3 tools/doctor.py --output local-diagnostics/doctor.json
python3 -m unittest discover -s tests -v
glib-compile-schemas --strict --dry-run extension/schemas
python3 tools/install_extension.py
gnome-extensions enable matci@local
gnome-extensions prefs matci@local
```

사용자 세션 설치는 `python3 tools/install_extension.py`, 업데이트는 `--upgrade`, 직전 버전 복구는 `--rollback`이다. 업데이트 가능한 GNOME 환경에서는 새 버전을 staging하고 실제 Shell 실행 버전과 worker 수를 doctor에 표시한다. 새 UI의 GNOME 적용 여부는 설치 버전과 실행 버전이 일치하는지 확인한다. 로그아웃 없이 반복 검수하려면 위의 `tools/dev.py` 중첩 세션을 쓴다.

matci는 평소 상단 패널의 RAM 아이콘과 사용률만 보인다. 패널 항목을 누르면 상세 오버레이가 열리고, 다시 누르거나 접기 버튼을 누르면 닫힌다. 오버레이는 작업 공간을 예약하지 않아 기존 창 위치를 바꾸지 않는다.

넘버패드 `Del`(NumLock과 무관)로도 오버레이를 열고 닫는다. Shell이 이 키를 가로채므로 일반 데스크톱에서는 앱에 전달되지 않는다. 바꾸려면 `gsettings --schemadir ~/.local/share/gnome-shell/extensions/matci@local/schemas set org.gnome.shell.extensions.matci matci-toggle-shortcut "['<Super>m']"`처럼 지정한다.

```bash
# 확장을 끈 상태에서 CLI를 분리 검사한다(기본 state에는 worker 1개만 허용).
gnome-extensions disable matci@local
python3 -m matci --once
# 키 없이 별도 상태에 합성 시연
python3 -m matci --mode demo --once --state-dir /tmp/matci-demo
gnome-extensions enable matci@local
```

## 구조와 검수

- GNOME Extension → Python subprocess, versioned JSON Lines. 별도 서비스·계정·네트워크 불필요.
- matci overlay는 사용자 패널 입력으로만 열린다. Archsport 경기 표면과 겹치면 수동 화면을 우선한다.
- [Linux 인수인계와 실기 절차](docs/LINUX_HANDOFF.md)
- [노치 공존 규칙](docs/DUAL_NOTCH.md)
- [검증 기록과 한계](replica/verification.md)
- [최초 구현 계획](docs/IMPLEMENTATION_PLAN.md) · [원본 조사](replica/recon.md)

디스크·폴더 정리·패키지 제거는 후속 범위다. 참고 사진은 연구용이며 실행 패키지에 포함하지 않는다. 구단 표장은 각 권리자 소유이고 출처는 `web/assets/logos/manifest.json`에 기록했다.

## License

소스와 동봉된 문서는 [MIT License](LICENSE)로 제공한다. `web/assets/logos/`의 구단 엠블럼·로고와 기타 제3자 상표는 MIT 라이선스 대상이 아니며 각 권리자에게 권리가 있다. 출처와 파일 해시는 `web/assets/logos/manifest.json`에 기록했다.
