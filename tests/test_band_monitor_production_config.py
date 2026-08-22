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

    def test_missing_band_phone_verification_metadata_does_not_block_approval(self) -> None:
        repository_root = Path(__file__).resolve().parents[1]
        config = json.loads(
            (repository_root / "band_join_monitor_config.json").read_text(
                encoding="utf-8"
            )
        )

        # BAND does not consistently expose this private verification field.
        # Admission still requires an 11-digit 010 number in the profile rules.
        self.assertIs(config["profile_rules"]["require_010_phone"], True)
        self.assertEqual(config["profile_rules"]["phone_digits"], 11)
        self.assertIs(
            config["phone_verification_rules"]["require_verified"],
            False,
        )


if __name__ == "__main__":
    unittest.main()
