"""Create an allowlisted GNOME runtime archive without local user data."""
import argparse
import zipfile
from pathlib import Path


def runtime_files(source):
    source = Path(source).resolve()
    for folder in ('extension', 'app', 'matci', 'data', 'migrations'):
        base = source / folder
        if not base.exists():
            continue
        if base.is_symlink():
            raise ValueError('Runtime directories cannot be symlinks')
        for path in sorted(base.rglob('*')):
            if path.is_symlink():
                raise ValueError('Runtime files cannot be symlinks')
            relative = path.relative_to(base)
            if not path.is_file() or '__pycache__' in relative.parts:
                continue
            if folder == 'extension':
                if path.suffix not in ('.js', '.json', '.css', '.xml', '.svg'):
                    continue
                target = relative
            elif folder == 'app':
                if path.suffix not in ('.js', '.css', '.svg'):
                    continue
                target = Path(folder) / relative
            elif folder == 'matci':
                if path.suffix not in ('.py', '.sql'):
                    continue
                target = Path(folder) / relative
            elif folder == 'data':
                if path.suffix != '.json':
                    continue
                target = Path(folder) / relative
            else:
                if path.suffix != '.sql':
                    continue
                target = Path(folder) / relative
            yield path, target.as_posix()


def package_extension(source, output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    files = list(runtime_files(source))
    if not any(name == 'metadata.json' for _, name in files):
        raise ValueError('Missing extension metadata')
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path, name in files:
            archive.write(path, name)
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('dist/matci-extension.zip'))
    args = parser.parse_args()
    count = package_extension(Path(__file__).resolve().parents[1], args.output)
    print(f'{args.output}: {count} runtime files. Schema sources included; compile at installation.')


if __name__ == '__main__':
    main()
