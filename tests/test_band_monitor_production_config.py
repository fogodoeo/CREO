import json
import unittest
from pathlib import Path


class BandMonitorProductionConfigTests(unittest.TestCase):
    def test_dom_fallback_stays_enabled_for_missed_api_notifications(self) -> None:
        repository_root = Path(__file__).resolve().parents[1]
        config = json.loads(
            (repository_root / "band_join_monitor_config.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertIs(config.get("dom_read_enabled"), True)
        self.assertLessEqual(
            float(config.get("applications_safety_refresh_seconds", 0)),
            60,
        )


if __name__ == "__main__":
    unittest.main()
