"""Bundle the shared game with Electron's official macOS runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from tempfile import gettempdir
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
ELECTRON_VERSION = '45.3.2'
BASE_URL = f'https://github.com/electron/electron/releases/download/v{ELECTRON_VERSION}'
RUNTIME_ROOT = 'Electron.app/'
APP_ROOT = 'Desktop Billiards.app/'


def download(url, destination):
    partial = destination.with_suffix(destination.suffix + '.part')
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
                    '--retry', '2', '--output', str(partial), url], check=True)
    partial.replace(destination)


def runtime_zip(cache, arch):
    cache.mkdir(parents=True, exist_ok=True)
    name = f'electron-v{ELECTRON_VERSION}-darwin-{arch}.zip'
    runtime = cache / name
    sums = cache / 'SHASUMS256.txt'
    if not sums.exists():
        download(f'{BASE_URL}/SHASUMS256.txt', sums)
    hashes = {file.lstrip('*'): digest for digest, file in
              (line.split(maxsplit=1) for line in sums.read_text().splitlines() if line.strip())}
    def verified():
        if not runtime.is_file():
            return False
        with runtime.open('rb') as source:
            return hashlib.file_digest(source, 'sha256').hexdigest() == hashes[name]
    if not verified():
        download(f'{BASE_URL}/{name}', runtime)
    if not verified():
        raise RuntimeError(f'Checksum mismatch: {name}')
    return runtime


def build(output, runtime):
    output.parent.mkdir(parents=True, exist_ok=True)
    resources = APP_ROOT + 'Contents/Resources/'
    temp = output.with_suffix('.tmp')
    with ZipFile(runtime) as original, ZipFile(temp, 'w', ZIP_DEFLATED, compresslevel=2) as package:
        for item in original.infolist():
            # Keep Apple's executable modes and the framework's symbolic links.
            data = original.read(item)
            if not item.filename.startswith(RUNTIME_ROOT):
                if item.filename in ('LICENSE', 'LICENSES.chromium.html'):
                    package.writestr(item.filename, data)
                continue
            if item.filename == RUNTIME_ROOT+'Contents/Resources/default_app.asar':
                continue
            item.filename = APP_ROOT + item.filename[len(RUNTIME_ROOT):]
            package.writestr(item, data)
        manifest = json.loads((ROOT/'package.json').read_text(encoding='utf8'))
        package.writestr(resources+'app/package.json', json.dumps({
            'name': manifest['name'], 'version': manifest['version'],
            'productName': 'Desktop Billiards', 'main': 'main.cjs'
        }))
        for name in ('main.cjs', 'preload.cjs'):
            package.write(ROOT/'mac'/name, resources+'app/'+name)
        web = ROOT/'release/web'
        for item in sorted(web.rglob('*')):
            if item.is_file():
                package.write(item, resources+'app/web/'+item.relative_to(web).as_posix())
        package.write(ROOT/'assets/audio/CREDITS.txt', 'AUDIO-CREDITS.txt')
        package.write(ROOT/'node_modules/three/LICENSE', 'THREE-LICENSE.txt')
    with ZipFile(temp) as package:
        if package.testzip() is not None:
            raise RuntimeError('macOS bundle failed ZIP integrity check')
    temp.replace(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch', default='both', choices=['both', 'arm64', 'x64'])
    parser.add_argument('--cache', type=Path, default=Path(gettempdir())/f'DesktopBilliards-electron-{ELECTRON_VERSION}')
    parser.add_argument('--output', type=Path, default=ROOT/'release/mac')
    args = parser.parse_args()
    subprocess.run(['node', 'scripts/build.mjs'], cwd=ROOT, check=True)
    for arch in ('arm64', 'x64') if args.arch == 'both' else (args.arch,):
        output = args.output/f'Desktop-Billiards-macOS-{arch}.zip'
        build(output, runtime_zip(args.cache, arch))
        print(output)


if __name__ == '__main__':
    main()
