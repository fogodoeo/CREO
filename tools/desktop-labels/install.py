"""Install the narrow Dodosi adapter into an existing, version-2 standalone app.

Usage: python install.py <app-directory>. Backups are kept next to changed files.
Refuses unknown layouts rather than overwriting another app version.
"""
from pathlib import Path
import ast
import shutil
import sys


def prepare(app):
    replacements = {
        'label_print_bridge.py': [
            ('    return [normalize_identification_label(label) if isinstance(label, dict) and label.get("kind") == "identification" else normalize_shipping_label(label) for label in labels]',
             '    from dodosi_label_design import normalize_ticket\n    jobs = []\n    for label in labels:\n        if isinstance(label, dict) and label.get("kind") == "dodosi_ticket":\n            jobs.extend(normalize_ticket(label, LabelBridgeRequestError))\n        else:\n            jobs.append(normalize_identification_label(label) if isinstance(label, dict) and label.get("kind") == "identification" else normalize_shipping_label(label))\n    return jobs'),
            ('"shippingLabelVersion": 2,', '"shippingLabelVersion": 2, "dodosiTicketVersion": 4,'),
            ('    provider = status_provider or (lambda: {"ready": True})', '    provider = status_provider or (lambda: {"ready": True})\n    enqueue_lock = threading.Lock()'),
            ('                accepted = enqueue_labels(labels)', '                with enqueue_lock:\n                    accepted = enqueue_labels(labels)'),
        ],
        'niimbot_printer.py': [
            ('    normalized_layout = _safe_text(label_layout).lower()',
             '    normalized_layout = _safe_text(label_layout).lower()\n    if normalized_layout in {"dodosi_departure_b1", "dodosi_arrival_b1"}:\n        from dodosi_label_design import render\n        return render(num, item_name, winner_name, winner_phone, company, sold_price, normalized_layout == "dodosi_departure_b1", font_key)'),
        ],
        'band_monitor_app.py': [
            ('payload.get("label_layout") in {"identification_b1_50x30", "identification_fold_b1_50x30", "numbering_b1_50x30"}',
             'payload.get("label_layout") in {"identification_b1_50x30", "identification_fold_b1_50x30", "numbering_b1_50x30", "dodosi_departure_b1", "dodosi_arrival_b1"}'),
        ],
    }
    changed = {}
    for name, edits in replacements.items():
        original = (app / name).read_bytes()
        source = original.decode('utf-8').replace('\r\n', '\n')
        if name == 'label_print_bridge.py':
            for version in (1, 2, 3):
                source = source.replace(f'"dodosiTicketVersion": {version}', '"dodosiTicketVersion": 4')
        for before, after in edits:
            if after in source:
                continue
            if source.count(before) != 1:
                raise RuntimeError(f'Unknown app version: {name}; no files changed')
            source = source.replace(before, after, 1)
        ast.parse(source)
        newline = '\r\n' if b'\r\n' in original else '\n'
        changed[name] = source.replace('\n', newline).encode('utf-8')
    return changed


def install(app):
    changes = prepare(app)
    # Validate every anchor before the first write. Keep originals for rollback.
    for name, content in changes.items():
        target = app / name
        backup = app / (name + '.before-dodosi-sides-20261125')
        if not backup.exists():
            shutil.copy2(target, backup)
        if target.read_bytes() != content:
            target.write_bytes(content)
    design = app / 'dodosi_label_design.py'
    backup = app / 'dodosi_label_design.py.before-dodosi-sides-20261125'
    if design.exists() and not backup.exists():
        shutil.copy2(design, backup)
    shutil.copy2(Path(__file__).with_name('dodosi_label_design.py'), design)
    print('Dodosi ticket adapter installed. Restart the monitor app to load it.')


if __name__ == '__main__':
    install(Path(sys.argv[1]).resolve())
