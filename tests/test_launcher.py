import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from install_extension import sync_launcher


class LauncherRollbackTests(unittest.TestCase):
    def test_upgrade_creates_launcher_and_pre_gtk_rollback_removes_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'matci'
            (target / 'app').mkdir(parents=True)
            (target / 'app/main.js').write_text('// GTK entry', encoding='utf-8')
            launcher = sync_launcher(target, root / 'applications')
            self.assertTrue(launcher.is_file())
            (target / 'app/main.js').unlink()
            self.assertIsNone(sync_launcher(target, root / 'applications'))
            self.assertFalse(launcher.exists())

    def test_rollback_does_not_delete_unmanaged_desktop_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            applications = root / 'applications'
            applications.mkdir()
            launcher = applications / 'org.matci.App.desktop'
            original = '[Desktop Entry]\nName=User shortcut\n'
            launcher.write_text(original, encoding='utf-8')
            self.assertIsNone(sync_launcher(root / 'pre-gtk', applications))
            self.assertEqual(launcher.read_text(encoding='utf-8'), original)
