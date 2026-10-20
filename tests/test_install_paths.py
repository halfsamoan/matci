import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'tools'
sys.path.insert(0, str(TOOLS))
try:
    SPEC = importlib.util.spec_from_file_location('matci_install_extension', TOOLS / 'install_extension.py')
    installer = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(installer)
finally:
    sys.path.remove(str(TOOLS))


class InstallPathTests(unittest.TestCase):
    def test_schema_compile_failure_removes_staging_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            parent = root / 'extensions'
            parent.mkdir()
            metadata = root / 'metadata.json'
            metadata.write_text(json.dumps({'uuid': installer.UUID}), encoding='utf-8')
            runtime_files = [(metadata, 'metadata.json')]
            with patch.object(installer, 'runtime_files', return_value=runtime_files), \
                    patch.object(installer.subprocess, 'run',
                                 side_effect=subprocess.CalledProcessError(1, 'glib-compile-schemas')):
                with self.assertRaises(subprocess.CalledProcessError):
                    installer.prepare_staging(root, parent, 'glib-compile-schemas')
            self.assertEqual(list(parent.glob('.matci-stage-*')), [])

    def test_pruning_sixth_backup_removes_oldest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for index in range(6):
                (root / f'extension-{index:02d}').mkdir()
            installer.prune_backups(root)
            self.assertFalse((root / 'extension-00').exists())
            self.assertEqual(len(list(root.glob('extension-*'))), 5)

    def test_updates_supported_requires_gsettings_and_manager(self):
        with tempfile.TemporaryDirectory() as temp:
            manager = Path(temp) / 'com.mattjakeman.ExtensionManager.desktop'
            manager.touch()
            cases = (
                ('true', [manager], True),
                ('false', [manager], False),
                ('true', [manager.with_name('missing.desktop')], False),
                ('false', [manager.with_name('missing.desktop')], False),
            )
            for output, paths, expected in cases:
                with self.subTest(gsettings=output, manager=paths[0].exists()):
                    self.assertEqual(installer.updates_supported(output, paths), expected)

    def test_upgrade_destination_respects_support_and_direct_override(self):
        self.assertEqual(installer.choose_install_path(False), 'initial')
        self.assertEqual(installer.choose_install_path(True, upgrade=True, supported=True), 'staged')
        self.assertEqual(installer.choose_install_path(True, upgrade=True, supported=False), 'direct')
        self.assertEqual(installer.choose_install_path(True, upgrade=True, direct=True, supported=True), 'direct')
        self.assertEqual(installer.choose_install_path(True, rollback=True, supported=True), 'direct')
        self.assertEqual(installer.choose_install_path(True), 'refuse')

    @patch.object(installer.subprocess, 'run')
    def test_running_version_reads_cached_shell_version_and_state(self, run):
        run.return_value.returncode = 0
        run.return_value.stdout = 'matci@local\n  Version: 2\n  State: ACTIVE\n'
        self.assertEqual(installer.running_version(command='gnome-extensions'), (2, 'ACTIVE'))

    @patch.object(installer.subprocess, 'run')
    def test_enable_extension_reports_command_success(self, run):
        run.return_value.returncode = 0
        self.assertTrue(installer.enable_extension(command='gnome-extensions'))
        run.assert_called_once()

    @patch.object(installer.subprocess, 'run')
    def test_enable_extension_reports_command_failure(self, run):
        run.return_value.returncode = 1
        self.assertFalse(installer.enable_extension(command='gnome-extensions'))

    @patch.object(installer, 'enable_extension', return_value=True)
    @patch.object(installer.subprocess, 'run')
    def test_direct_replacement_restores_old_files_and_active_state_on_failure(self, run, enable):
        run.return_value.returncode = 0
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / 'installed'
            target.mkdir()
            (target / 'old.txt').write_text('old', encoding='utf-8')
            staging = root / 'staging'
            staging.mkdir()
            (staging / 'new.txt').write_text('new', encoding='utf-8')
            parked = root / 'parked'
            rename = Path.rename

            def fail_staging(source, destination):
                if source == staging:
                    raise OSError('simulated replacement failure')
                return rename(source, destination)

            with patch.object(Path, 'rename', fail_staging):
                with self.assertRaises(OSError):
                    installer.replace_direct(staging, target, parked, root / 'backup', True)
            self.assertEqual((target / 'old.txt').read_text(encoding='utf-8'), 'old')
            enable.assert_called_once()

    @patch.object(installer, 'enable_extension', return_value=True)
    @patch.object(installer.subprocess, 'run')
    def test_direct_replacement_aborts_if_extension_cannot_be_disabled(self, run, enable):
        run.return_value.returncode = 1
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / 'installed'
            target.mkdir()
            (target / 'old.txt').write_text('old', encoding='utf-8')
            staging = root / 'staging'
            staging.mkdir()
            with self.assertRaises(SystemExit):
                installer.replace_direct(staging, target, root / 'parked', root / 'backup', True)
            self.assertEqual((target / 'old.txt').read_text(encoding='utf-8'), 'old')
            self.assertFalse((target / 'new.txt').exists())
            enable.assert_called_once()


if __name__ == '__main__':
    unittest.main()
