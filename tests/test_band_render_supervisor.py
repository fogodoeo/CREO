from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import render_start


class RenderSupervisorTests(unittest.TestCase):
    def test_node_child_never_receives_band_login_secrets(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "BAND_COOKIE_HEADER": "private-header",
                "BAND_COOKIE_JSON": "private-json",
            },
            clear=True,
        ), mock.patch("render_start.subprocess.Popen") as popen:
            render_start.start_node()

        command = popen.call_args.args[0]
        environment = popen.call_args.kwargs["env"]
        self.assertEqual(Path(command[1]).name, "server.js")
        self.assertNotIn("BAND_COOKIE_HEADER", environment)
        self.assertNotIn("BAND_COOKIE_JSON", environment)
        self.assertEqual(environment["NODE_OPTIONS"], "--max-old-space-size=192")

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
