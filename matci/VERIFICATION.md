# Core proof-first evidence

2026-10-18: `rtk proxy python -X utf8 -m unittest discover -s tests -p test_core_contract.py -v`
was run before the `matci` package existed. The zero-MemAvailable assertion failed
at import with `ModuleNotFoundError: No module named 'matci'` (1 test, exit 1).
The implementation then supplied the parser and worker. The parent build log
records the final scoped suite result and target-device limitations.

Synthetic fixtures do not establish actual GNOME compatibility or memory savings.
