import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from band_directory_bot import DirectoryClient, DirectoryMonitor, extra_directories


class SharedBandTests(unittest.TestCase):
    def test_extra_band_requires_explicit_own_token_and_allowlist(self):
        env = {"BAND_DIRECTORY_ORIGIN": "https://example.test", "BAND_DIRECTORY_BOT_TOKEN": "a" * 32,
               "BAND_DIRECTORY_EXTRA_BANDS": "105217754"}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError):
                extra_directories()
            os.environ["BAND_DIRECTORY_BOT_TOKEN_105217754"] = "b" * 32
            extra = extra_directories()[0]
            self.assertEqual((extra.band_no, extra.token), ("105217754", "b" * 32))
            for invalid in ("104432443", "105217754,105217754", "999999999"):
                os.environ["BAND_DIRECTORY_EXTRA_BANDS"] = invalid
                with self.assertRaises(ValueError):
                    extra_directories()

    def test_secondary_client_scopes_every_operation_with_its_own_token(self):
        with patch.dict(os.environ, {"BAND_DIRECTORY_ORIGIN": "https://example.test"}):
            client = DirectoryClient("105217754", "b" * 32)
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock()
        response.read.return_value = b'{}'
        with patch("band_directory_bot.urllib.request.urlopen", return_value=response) as send:
            for op in ("members", "claim", "finish", "heartbeat", "session", "progress"):
                client.call(op, {"example": True})
                request = send.call_args.args[0]
                self.assertTrue(request.full_url.endswith("/" + op + "?bandNo=105217754"))
                self.assertEqual(request.headers["Authorization"], "Bearer " + "b" * 32)

    def shared(self):
        owner = Mock(page_band_no="104432443", _session_snapshot_path=Path("unused"))
        directory = Mock(band_no="105217754")
        return owner, directory, DirectoryMonitor({}, directory, shared=owner)

    def test_secondary_never_starts_browser_or_installs_another_session(self):
        with patch("band_directory_bot.base.BandJoinMonitor.__init__") as initialize:
            owner, directory, secondary = self.shared()
        initialize.assert_not_called()
        directory.call.assert_not_called()
        self.assertIs(secondary.chrome, owner.chrome)
        self.assertEqual(secondary.page_band_no, "104432443")
        self.assertEqual(secondary.band_no, "105217754")

    def test_secondary_records_and_actions_keep_the_target_band_after_restart(self):
        owner, directory, secondary = self.shared()
        secondary.auto_enabled = True
        secondary.checkpoint_session = Mock()
        secondary.api = Mock(side_effect=[{"items": [{"member_key": "same-key", "created_at": 123}]},
                                         {"application": {"join_answer": "01012345678"}}, {}])
        claimed = set()
        def store(op, data=None):
            if op == "claim":
                key = data["applicationId"]
                if key in claimed:
                    return {"claimed": False}
                claimed.add(key)
                return {"claimed": True}
            return {}
        directory.call.side_effect = store
        secondary.poll(None)
        self.assertEqual(directory.call.call_args_list[0].args[1]["members"][0]["bandNo"], "105217754")
        for call in secondary.api.call_args_list:
            self.assertEqual(call.args[2][0], "105217754")
        restarted = DirectoryMonitor({}, directory, shared=owner)
        restarted.auto_enabled = True
        approve = Mock()
        restarted.process_application({"member_key": "same-key", "created_at": 123, "join_answer": "01012345678"}, approve)
        approve.assert_not_called()

    def test_one_band_poll_failure_does_not_skip_other_band(self):
        owner, directory, secondary = self.shared()
        primary = DirectoryMonitor({}, Mock(band_no="104432443"), shared=owner)
        primary.shared_bands = [secondary]
        connection = Mock()
        connection.call.return_value = {"result": {"value": "https://www.band.us/band/104432443/applications"}}
        primary.poll = Mock(side_effect=OSError("temporary storage failure"))
        primary.heartbeat = Mock()
        secondary.poll = Mock()
        secondary.roster_step = Mock()
        secondary.reconcile_step = Mock()
        secondary.heartbeat = Mock()
        primary._periodic_dom_tasks(connection)
        self.assertEqual(primary.runtime_state, "error")
        secondary.poll.assert_called_once_with(connection)


if __name__ == "__main__":
    unittest.main()
