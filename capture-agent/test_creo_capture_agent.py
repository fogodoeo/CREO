import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("creo_capture_agent.py")
SPEC = importlib.util.spec_from_file_location("creo_capture_agent", MODULE_PATH)
agent = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(agent)


class CaptureAgentTests(unittest.TestCase):
    def test_f3_is_the_default_and_is_parseable(self):
        self.assertEqual(agent.DEFAULT_CONFIG["hotkey"], "f3")
        self.assertEqual(agent.parse_hotkey("f3"), [0x72])

    def test_old_untouched_hotkey_migrates_to_f3(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            previous = (agent.APP_DIR, agent.CONFIG_PATH)
            try:
                agent.APP_DIR = root
                agent.CONFIG_PATH = root / "config.json"
                agent.CONFIG_PATH.write_text(
                    json.dumps({"config_version": 2, "hotkey": "Ctrl + Shift + F12", "agent_id": "test"}),
                    encoding="utf-8",
                )
                config = agent.load_config()
                self.assertEqual(config["config_version"], 2)
                self.assertEqual(config["hotkey"], "f3")
            finally:
                agent.APP_DIR, agent.CONFIG_PATH = previous

    def test_diagnostics_never_store_the_agent_token(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            previous = (agent.APP_DIR, agent.DIAGNOSTICS_PATH)
            try:
                agent.APP_DIR = root
                agent.DIAGNOSTICS_PATH = root / "diagnostics.json"
                agent.write_diagnostics("test", token_present=True, last_error="")
                payload = agent.DIAGNOSTICS_PATH.read_text(encoding="utf-8")
                self.assertIn('"token_present": true', payload)
                self.assertNotIn("agent_token", payload)
            finally:
                agent.APP_DIR, agent.DIAGNOSTICS_PATH = previous


if __name__ == "__main__":
    unittest.main()
