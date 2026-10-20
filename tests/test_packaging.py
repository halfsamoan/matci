import tempfile
import unittest
import zipfile
from pathlib import Path
from tools.package_extension import package_extension, runtime_files


class PackagingTests(unittest.TestCase):
    def test_package_contains_runtime_only_and_preserves_schema_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['extension/metadata.json', 'extension/schemas/example.gschema.xml',
                         'extension/gschemas.compiled', 'matci/__init__.py', 'matci/schema.sql',
                         'matci/__pycache__/secret.pyc', 'data/demo.json', 'migrations/001_initial.sql',
                         'tools/attribution_report.py',
                         'replica/screens/private.jpg', 'local-diagnostics/health.json', '.env']:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('{}', encoding='utf-8')
            output = root / 'dist/matci.zip'
            package_extension(root, output)
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), {
                    'metadata.json', 'schemas/example.gschema.xml',
                    'matci/__init__.py', 'matci/schema.sql', 'data/demo.json', 'migrations/001_initial.sql'})

    def test_symlink_runtime_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'extension').mkdir()
            (root / 'outside').write_text('private', encoding='utf-8')
            try:
                (root / 'extension/metadata.json').symlink_to(root / 'outside')
            except OSError:
                self.skipTest('Host does not allow creating symlinks')
            with self.assertRaises(ValueError):
                list(runtime_files(root))


if __name__ == '__main__':
    unittest.main()
