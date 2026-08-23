from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

import render_start


class RenderSupervisorTests(unittest.TestCase):
    def test_node_child_never_receives_band_login_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory, mock.patch.dict(
            os.environ,
            {
                "BAND_COOKIE_HEADER": "private-header",
                "BAND_COOKIE_JSON": "private-json",
            },
            clear=True,
        ), mock.patch.object(
            render_start, "IS_RENDER", True
        ), mock.patch.object(
            render_start, "PLATFORM_PERSISTENT_ROOT", Path(temporary_directory) / "platform"
        ), mock.patch("render_start.subprocess.Popen") as popen:
            render_start.start_node()

        command = popen.call_args.args[0]
        environment = popen.call_args.kwargs["env"]
        self.assertEqual(Path(command[1]).name, "server.js")
        self.assertNotIn("BAND_COOKIE_HEADER", environment)
        self.assertNotIn("BAND_COOKIE_JSON", environment)
        self.assertEqual(environment["NODE_OPTIONS"], "--max-old-space-size=128")
        self.assertEqual(environment["MALLOC_ARENA_MAX"], "2")
        self.assertEqual(
            Path(environment["CREO_DATA_DIR"]),
            Path(temporary_directory) / "platform",
        )

    def test_platform_storage_migrates_legacy_sqlite_once_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            legacy_directory = root / "storage"
            persistent_directory = root / "persistent"
            legacy_directory.mkdir()
            legacy_database = legacy_directory / "creo-platform.sqlite"
            connection = sqlite3.connect(legacy_database)
            connection.execute("CREATE TABLE sample(value TEXT NOT NULL)")
            connection.execute("INSERT INTO sample(value) VALUES ('legacy')")
            connection.commit()
            connection.close()
            environment: dict[str, str] = {}

            with mock.patch.object(render_start, "ROOT", root), mock.patch.object(
                render_start, "IS_RENDER", True
            ), mock.patch.object(
                render_start, "PLATFORM_PERSISTENT_ROOT", persistent_directory
            ):
                target = render_start.prepare_platform_storage(environment)
                connection = sqlite3.connect(target)
                first = connection.execute("SELECT value FROM sample").fetchone()[0]
                connection.execute("UPDATE sample SET value = 'persistent'")
                connection.commit()
                connection.close()
                render_start.prepare_platform_storage(environment)
                connection = sqlite3.connect(target)
                second = connection.execute("SELECT value FROM sample").fetchone()[0]
                connection.close()

            self.assertEqual(environment["CREO_DATA_DIR"], str(persistent_directory))
            self.assertEqual(first, "legacy")
            self.assertEqual(second, "persistent")

    def test_failed_platform_migration_leaves_no_partial_database(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            legacy_directory = root / "storage"
            persistent_directory = root / "persistent"
            legacy_directory.mkdir()
            (legacy_directory / "creo-platform.sqlite").write_bytes(b"not-sqlite")
            environment: dict[str, str] = {}

            with mock.patch.object(render_start, "ROOT", root), mock.patch.object(
                render_start, "IS_RENDER", True
            ), mock.patch.object(
                render_start, "PLATFORM_PERSISTENT_ROOT", persistent_directory
            ):
                with self.assertRaises(sqlite3.DatabaseError):
                    render_start.prepare_platform_storage(environment)

            self.assertFalse((persistent_directory / "creo-platform.sqlite").exists())
            self.assertFalse(
                (persistent_directory / "creo-platform.sqlite.migrating").exists()
            )

    def test_monitor_child_uses_one_persistent_subdirectory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            persistent_root = Path(temporary_directory) / "band-monitor"
            with mock.patch.object(render_start, "PERSISTENT_ROOT", persistent_root), mock.patch.dict(
                os.environ,
                {"BAND_COOKIE_JSON": "private-json"},
                clear=True,
            ), mock.patch(
                "render_start.resolve_chrome_executable", return_value="/fake/chrome"
            ), mock.patch("render_start.subprocess.Popen") as popen:
                render_start.start_band_monitor()

            command = popen.call_args.args[0]
            environment = popen.call_args.kwargs["env"]
            self.assertEqual(Path(command[1]).name, "band_member_sync_monitor.py")
            self.assertIn("--daemon", command)
            self.assertEqual(environment["BAND_CHROME_EXECUTABLE"], "/fake/chrome")
            self.assertEqual(environment["MALLOC_ARENA_MAX"], "2")
            self.assertEqual(
                Path(environment["BAND_CHROME_PROFILE_DIR"]),
                persistent_root / "chrome-profile",
            )
            self.assertEqual(
                Path(environment["BAND_MONITOR_STATE_FILE"]),
                persistent_root / "state.json",
            )
            self.assertEqual(
                Path(environment["BAND_MONITOR_STATUS_FILE"]),
                persistent_root / "runtime.json",
            )
            self.assertEqual(environment["BAND_COOKIE_JSON"], "private-json")
            self.assertTrue(persistent_root.is_dir())


if __name__ == "__main__":
    unittest.main()
