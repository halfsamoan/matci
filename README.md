# matci

A GNOME Shell extension for memory inspection and explicit window-close requests.

<img src=".github/assets/preview.png" alt="matci web prototype with synthetic memory data" width="760">

The image shows the web prototype with synthetic data, not a validated GNOME session.

## Implementation

- **Memory attribution:** reads Linux `/proc`, separates system-wide `MemAvailable` from per-process PSS/RSS, and marks incomplete observations.
- **Window ownership:** maps observations to current GNOME application windows and checks identity again before requesting a close.
- **Close workflow:** requires a user selection, records the request, and observes its result without escalating to a forced termination.
- **Process lifecycle:** uses a Python standard-library worker over versioned JSON Lines and stores local history in SQLite.

System, Shell, terminal, development-tool, and unidentified targets are protected. Memory figures are observations, not estimates of reclaimable capacity.

[Process collector](matci/procfs.py) · [Protection policy](matci/policy.py) · [Window actions](extension/actions.js)

## Run the demo

From the repository root, with Python installed:

```sh
python -m http.server 4180 --bind 127.0.0.1 --directory web
```

Open [localhost:4180](http://127.0.0.1:4180). The demo does not modify real applications or system memory.

## Install on GNOME

The extension declares GNOME Shell 50 support. Install Python 3, GLib schema tools, and GNOME extension preferences, then run:

```sh
python3 tools/install_extension.py
```

Log out and back in after the first installation, then run:

```sh
gnome-extensions enable matci@local
gnome-extensions prefs matci@local
```

Open the overlay from the panel RAM item or numpad `+`.

## Validation status

The project records Windows prototype checks and WSL collection tests. Real GNOME window closing, suspend/resume, scaling, performance, and coexistence with [Archsport](https://github.com/halfsamoan/archsport) still require target-device validation.

[Development and verification](CONTRIBUTING.md)

## License

[MIT](LICENSE). Club marks belong to their respective owners; see the [asset manifest](web/assets/logos/manifest.json).
