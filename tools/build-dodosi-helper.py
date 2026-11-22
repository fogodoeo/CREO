"""Package only reviewed Dodosi helper sources; never include account data."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = ('manifest.json', 'provider.js', 'form.js', 'background.js', 'bridge.js')

def build():
    target = ROOT / 'public/downloads/creo-dodosi-helper.zip'
    target.parent.mkdir(exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for name in FILES:
            info = ZipInfo('creo-dodosi-helper/' + name, (2026, 11, 23, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, (ROOT / 'tools/dodosi-helper' / name).read_bytes())
    print(target)

if __name__ == '__main__':
    build()
