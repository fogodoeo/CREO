"""Offline SQLite transfer: consistent backup, checksum validation, no overwrite.

The bundle contains private operational data. Never put it in public/ or git.
Stop the old writer before the final export and keep exactly one writer active.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
from contextlib import closing

TABLES = ("platform_kv", "platform_outbox", "platform_deleted_keys")


def inspect_database(database):
    with closing(sqlite3.connect(Path(database).resolve().as_uri() + "?mode=ro", uri=True)) as connection:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        return {table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in TABLES}


def checksum(file):
    digest = hashlib.sha256()
    with Path(file).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_snapshot(source, directory):
    source, directory = Path(source).resolve(), Path(directory).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "creo-platform.sqlite"
    manifest = directory / "manifest.json"
    if target.exists() or manifest.exists():
        raise FileExistsError("Use a new private bundle directory; existing backups are never overwritten")
    temporary = directory / "snapshot.incoming"
    if temporary.exists():
        raise FileExistsError(temporary)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as origin, closing(sqlite3.connect(temporary)) as destination:
            origin.backup(destination)
        counts = inspect_database(temporary)
        temporary.replace(target)
        payload = {"format": 1, "sha256": checksum(target), "bytes": target.stat().st_size, "counts": counts}
        manifest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return payload
    finally:
        if temporary.exists():
            temporary.unlink()


def verify_snapshot(directory):
    directory = Path(directory).resolve()
    database = directory / "creo-platform.sqlite"
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format") != 1 or checksum(database) != manifest.get("sha256"):
        raise ValueError("Snapshot checksum mismatch")
    if database.stat().st_size != manifest.get("bytes") or inspect_database(database) != manifest.get("counts"):
        raise ValueError("Snapshot row count/size mismatch")
    return manifest


def restore_snapshot(directory, target):
    manifest = verify_snapshot(directory)
    target = Path(target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    # Refuse a live database or its WAL even when the main file was moved away.
    if any(Path(str(target) + suffix).exists() for suffix in ("", "-wal", "-shm", ".incoming")):
        raise FileExistsError("Restore target must be new and the target server must be stopped")
    temporary = Path(str(target) + ".incoming")
    try:
        shutil.copyfile(Path(directory).resolve() / "creo-platform.sqlite", temporary)
        if checksum(temporary) != manifest["sha256"]:
            raise ValueError("Copy checksum mismatch")
        temporary.replace(target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    export = subparsers.add_parser("export")
    export.add_argument("source"); export.add_argument("bundle_directory")
    verify = subparsers.add_parser("verify"); verify.add_argument("bundle_directory")
    restore = subparsers.add_parser("restore")
    restore.add_argument("bundle_directory"); restore.add_argument("target")
    args = parser.parse_args()
    if args.command == "export":
        result = export_snapshot(args.source, args.bundle_directory)
    elif args.command == "restore":
        result = restore_snapshot(args.bundle_directory, args.target)
    else:
        result = verify_snapshot(args.bundle_directory)
    print(json.dumps(result))  # Counts and checksum only; never record contents.
