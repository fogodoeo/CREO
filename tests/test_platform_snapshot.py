from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing
from tools.platform_snapshot import export_snapshot, verify_snapshot, restore_snapshot


class PlatformSnapshotTests(unittest.TestCase):
    def test_wal_records_outbox_and_tombstones_survive_verified_transfer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with closing(sqlite3.connect(root / "source.sqlite")) as source:
                source.execute("PRAGMA journal_mode=WAL")
                source.execute("CREATE TABLE platform_kv(key TEXT PRIMARY KEY,value TEXT)")
                source.execute("CREATE TABLE platform_outbox(key TEXT PRIMARY KEY,value TEXT)")
                source.execute("CREATE TABLE platform_deleted_keys(key TEXT PRIMARY KEY)")
                source.execute("INSERT INTO platform_kv VALUES ('lot-test','비공개 테스트 값')")
                source.execute("INSERT INTO platform_outbox VALUES ('queued','not-yet-mirrored')")
                source.execute("INSERT INTO platform_deleted_keys VALUES ('deleted')")
                source.commit()
                manifest = export_snapshot(root / "source.sqlite", root / "bundle")
                self.assertEqual(manifest["counts"], {"platform_kv": 1, "platform_outbox": 1, "platform_deleted_keys": 1})
                restore_snapshot(root / "bundle", root / "target.sqlite")
                with closing(sqlite3.connect(root / "target.sqlite")) as target:
                    self.assertEqual(target.execute("SELECT value FROM platform_kv").fetchone()[0], "비공개 테스트 값")
                    self.assertEqual(target.execute("SELECT key FROM platform_deleted_keys").fetchone()[0], "deleted")
                with self.assertRaises(FileExistsError):
                    restore_snapshot(root / "bundle", root / "target.sqlite")
                database = root / "bundle" / "creo-platform.sqlite"
                with database.open("ab") as stream:
                    stream.write(b"corruption")
                with self.assertRaisesRegex(ValueError, "checksum"):
                    verify_snapshot(root / "bundle")


if __name__ == "__main__":
    unittest.main()
