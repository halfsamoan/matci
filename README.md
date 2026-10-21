# matci — 포트폴리오 02

Ubuntu GNOME의 메모리 관측·수동 정리 도우미. matci는 평소 패널에 RAM 사용률만 표시하고, 눌렀을 때 상세 오버레이를 연다.

matci와 [Archsport](https://github.com/halfsamoan/archsport)는 별도 앱·저장소다. matci는 사용자가 열 때만 표면을 표시하고 Archsport는 경기 관련 상태가 있을 때만 노치를 표시한다. 겹침 방지 배치만 공유한다.

전체 RAM 사용률(MemTotal−MemAvailable), PSI, 프로세스별 PSS/RSS, 관측 가능한 프로세스 CPU 비율을 구별한다. 앱 행에는 값(2^30 바이트 기준 GB)만 보인다(예: `0.83 GB`). RSS 지표, 부분 coverage, 혼합 지표로 정확도가 낮은 값은 행의 접근성 이름에 `부분 측정`을 붙여 스크린리더로 알린다. 화면에는 `≤` 표시와 툴팁을 두지 않는다. 지표 종류·측정 나이·보호 이유도 행의 접근성 이름에 남는다. 보호 이유를 확인한 뒤 직접 선택한 앱의 현재 창에 정상 닫기를 요청한다. 자동 종료·강제 종료·캐시 강제 비우기는 하지 않는다. Python core는 표준 라이브러리만 사용한다.

펼친 노치에는 Linux hwmon의 CPU 온도와 `cpu_fan`으로 식별된 팬 속도를 보조 정보로 표시한다. `lm-sensors`의 `sensors` 명령과 같은 커널 값을 읽는다. 이 장치의 CPU 값은 `k10temp/Tctl` 제어 온도이며 다이 온도와 다를 수 있다. 해당 센서가 없거나 읽히지 않으면 값은 `—`로 표시하고, 둘 다 없으면 보조 줄을 숨긴다. GPU·ACPI 온도나 GPU 팬 값을 대신 사용하지 않는다. 패널 표시는 기존 RAM 사용률 그대로다. 이번 변경의 확장 버전은 23이다.

**현재 수집하지 않는 항목:** 시스템 전체 CPU 사용률, swap 사용량, GPU 사용률, GPU 온도는 snapshot/provider에 아직 없다. 최종 제품 명세에 포함된 후속 P1 작업이며 현재 구현 완료로 간주하지 않는다.

**현재: MVP 소스와 Windows 시연 구현. WSL의 실제 `/proc` 수집 및 자동 검사는 통과했으나, ASUS 노트북의 Ubuntu GNOME 실행·절전·배율·실제 창 닫기는 아직 미검증이다.** GNOME46/50은 선언한 검수 대상이지 확인된 호환성 목록이 아니다.

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
