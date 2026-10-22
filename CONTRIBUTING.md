# Development and verification

## Synthetic worker

The Python core uses the standard library. Run the synthetic worker in a separate state directory:

```sh
python3 -m matci --mode demo --once --state-dir /tmp/matci-demo
```

For real `/proc` collection, use Linux. Do not start a second CLI worker against the default state while the extension owns it.

## Checks

```sh
python3 -m unittest discover -s tests -v
python3 tools/doctor.py --output local-diagnostics/doctor.json
glib-compile-schemas --strict --dry-run extension/schemas
python3 tools/smoke_worker.py
```

Node syntax checks do not establish GJS or GNOME API compatibility. WSL `/proc` checks do not establish successful window closing in a GNOME session.

## Isolated GNOME development

```sh
python3 tools/dev.py --check-only
python3 tools/dev.py
```

The development loop stages matci and Archsport in isolated XDG paths under `.dev/`. It checks tests and schemas before restarting the nested Shell. GNOME 49+ graphical nesting requires Mutter Devkit; on Ubuntu, the package is `mutter-dev-bin`. `--headless` checks startup without replacing visual and input validation.

## User installation

```sh
python3 tools/install_extension.py
gnome-extensions enable matci@local
gnome-extensions prefs matci@local
```

Log out and back in after the first installation. Use `--upgrade` to stage an update and `--rollback` to restore the previous installation. Replacing files does not guarantee that the running GNOME session has reloaded them.

## Data and action contracts

- `matci/procfs.py` collects same-user processes and distinguishes PSS, RSS, age, and incomplete coverage.
- `matci/policy.py` supplies protection decisions; low activity alone is not evidence that an application is safe to close.
- `matci/worker.py` and `matci/store.py` handle bounded snapshots, worker ownership, local history, and interrupted requests.
- `extension/actions.js` requests a normal close on current Shell window objects after identity and ownership checks.

The default state is under `~/.local/state/matci`. Do not publish raw process arguments, window titles, environment dumps, or local diagnostics. Reports of memory change must remain observations; they must not be relabeled as capacity reclaimed from a specific app.

## Target-device acceptance

Validate real window closing, unsaved-document cancellation, process survival, worker interruption, suspend/resume, display scaling, and simultaneous Archsport placement on the target GNOME system. Use disposable test applications first. No automatic or forced process termination is implemented.

Earlier target-device checklists and execution records are retained under `docs/` and `replica/`; their historical pass counts are not results from a new run.
