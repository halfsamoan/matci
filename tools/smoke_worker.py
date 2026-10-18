"""Run an isolated worker smoke and print only non-identifying aggregate results."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    mode = 'live' if sys.platform.startswith('linux') else 'demo'
    with tempfile.TemporaryDirectory(prefix='matci-smoke-') as directory:
        result = subprocess.run([sys.executable, '-m', 'matci', '--mode', mode, '--once',
                                 '--state-dir', directory], cwd=Path(__file__).resolve().parents[1],
                                capture_output=True, text=True, encoding='utf-8', timeout=30, check=True)
        snapshot = json.loads(result.stdout)
        assert snapshot['type'] == 'snapshot' and snapshot['mode'] == mode
        memory = snapshot['memory']
        assert 0 <= memory['available_bytes'] <= memory['total_bytes']
        assert len(snapshot['processes']) <= 256
        assert all('argv' not in item and 'cmdline' not in item for item in snapshot['processes'])
        summary = json.loads((Path(directory) / 'history-summary.json').read_text(encoding='utf-8'))
        print(json.dumps({'mode': mode, 'health': snapshot['health'],
                          'memory_values_valid': True, 'process_count': len(snapshot['processes']),
                          'psi': snapshot['pressure']['availability'], 'summary_created': bool(summary),
                          'gnome_runtime_verified': False}, ensure_ascii=True))


if __name__ == '__main__':
    main()
