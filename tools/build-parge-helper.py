"""Build a reproducible extension archive from an explicit source allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = {name: ROOT / 'tools/parge-helper' / name for name in (
    'manifest.json', 'popup.html', 'popup.css', 'form.js', 'background.js', 'bridge.js')}
FILES.update({name: ROOT / 'public' / name for name in ('mobile-phone.js', 'parge-dispatch-core.js')})

def build():
    target = ROOT / 'public/downloads/creo-parge-helper.zip'
    target.parent.mkdir(exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for name, source in sorted(FILES.items()):
            info = ZipInfo('creo-parge-helper/' + name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, source.read_bytes())
    print(target)

if __name__ == '__main__':
    build()
