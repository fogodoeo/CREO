from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest import mock

from band_member_sync_monitor import (
    BaseBandJoinMonitor,
    MemberSyncOutbox,
    SupabaseMemberDirectory,
    SyncedBandJoinMonitor,
)


class _Response:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class SupabaseMemberDirectoryTests(unittest.TestCase):
    def test_upsert_uses_service_role_without_exposing_phone_in_url(self) -> None:
        environment = {
            "BAND_MEMBER_SYNC_ENABLED": "true",
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "service-role-secret",
        }
        with mock.patch.dict(os.environ, environment, clear=False):
            directory = SupabaseMemberDirectory(logging.getLogger("test"))
        with mock.patch("urllib.request.urlopen", return_value=_Response()) as opened:
            ok, detail = directory.upsert(
                phone="01012345678",
                display_name="홍길동",
                member_key="member-1",
            )

        self.assertTrue(ok)
        self.assertEqual(detail, "synced")
        request = opened.call_args.args[0]
        self.assertNotIn("01012345678", request.full_url)
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["phone_normalized"], "01012345678")
        self.assertEqual(request.get_header("Authorization"), "Bearer service-role-secret")
        self.assertIn("resolution=merge-duplicates", request.get_header("Prefer"))

    def test_sync_requires_an_explicit_enable_flag(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "BAND_MEMBER_SYNC_ENABLED": "false",
                "SUPABASE_URL": "https://project.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY": "service-role-secret",
            },
            clear=False,
        ):
            directory = SupabaseMemberDirectory(logging.getLogger("test"))
        ok, detail = directory.upsert(
            phone="01012345678",
            display_name="홍길동",
            member_key="member-1",
        )
        self.assertTrue(ok)
        self.assertEqual(detail, "disabled")

    def test_roster_batch_upsert_preserves_existing_join_timestamps(self) -> None:
        environment = {
            "BAND_MEMBER_SYNC_ENABLED": "true",
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "service-role-secret",
        }
        with mock.patch.dict(os.environ, environment, clear=False):
            directory = SupabaseMemberDirectory(logging.getLogger("test"))
        with mock.patch("urllib.request.urlopen", return_value=_Response()) as opened:
            ok, detail = directory.upsert_many(
                [
                    {
                        "phone": "01012345678",
                        "display_name": "홍길동/서울/01012345678",
                        "member_key": "",
                    }
                ]
            )

        self.assertTrue(ok)
        self.assertEqual(detail, "synced")
        payload = json.loads(opened.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["phone_normalized"], "01012345678")
        self.assertNotIn("joined_at", payload[0])
        self.assertNotIn("band_member_key", payload[0])


class SyncedMonitorHookTests(unittest.TestCase):
    def _bare_monitor(self, outbox_path: Path) -> SyncedBandJoinMonitor:
        monitor = object.__new__(SyncedBandJoinMonitor)
        monitor.logger = logging.getLogger("test")
        monitor._last_member_sync = None
        monitor._member_sync_results = {}
        monitor.member_sync_outbox = MemberSyncOutbox(outbox_path, monitor.logger)
        monitor.member_sync_interval_seconds = 300
        monitor._member_sync_run_lock = threading.RLock()
        monitor.stop_event = threading.Event()
        monitor.member_reconcile_enabled = True
        monitor.member_reconcile_interval_seconds = 60
        monitor._last_roster_snapshot = {}
        monitor._last_roster_reconcile = None
        return monitor

    def test_only_successful_approval_is_synced(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            monitor = self._bare_monitor(Path(directory) / "outbox.json")
            monitor.profile_matcher = mock.Mock()
            monitor.profile_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
                name="홍길동",
            )
            monitor.phone_matcher = mock.Mock()
            monitor.phone_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
            )
            monitor.member_directory = mock.Mock()
            monitor.member_directory.upsert.return_value = (True, "synced")
            request = SimpleNamespace(
                display_name="홍길동 01012345678",
                applicant_key="member-1",
                request_id="member-1",
                verified_phone="01012345678",
                phone_verified=True,
            )

            with mock.patch.object(
                BaseBandJoinMonitor,
                "perform_action",
                return_value=(True, "승인 완료"),
            ):
                success, _message = monitor.perform_action(request, "approve")
            self.assertTrue(success)
            monitor.member_directory.upsert.assert_called_once_with(
                phone="01012345678",
                display_name="홍길동",
                member_key="member-1",
            )
            self.assertEqual(monitor.member_sync_outbox.count(), 0)

            monitor.member_directory.reset_mock()
            with mock.patch.object(
                BaseBandJoinMonitor,
                "perform_action",
                return_value=(True, "거절 완료"),
            ):
                monitor.perform_action(request, "reject")
            monitor.member_directory.upsert.assert_not_called()

    def test_unavailable_verified_phone_is_never_synced(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            monitor = self._bare_monitor(Path(directory) / "outbox.json")
            monitor.profile_matcher = mock.Mock()
            monitor.profile_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
                name="홍길동",
            )
            monitor.phone_matcher = mock.Mock()
            monitor.phone_matcher.match.return_value = SimpleNamespace(
                eligible=False,
                phone="01099998888",
            )
            monitor.member_directory = mock.Mock()
            request = SimpleNamespace(
                display_name="홍길동 01012345678",
                applicant_key="member-1",
                request_id="member-1",
                verified_phone="01099998888",
                phone_verified=True,
            )

            with mock.patch.object(
                BaseBandJoinMonitor,
                "perform_action",
                return_value=(True, "승인 완료"),
            ):
                success, _message = monitor.perform_action(request, "approve")
            self.assertTrue(success)
            monitor.member_directory.upsert.assert_not_called()
            self.assertEqual(monitor.member_sync_outbox.count(), 0)

    def test_accepted_mismatched_numbers_sync_as_two_local_membership_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            monitor = self._bare_monitor(Path(directory) / "outbox.json")
            monitor.profile_matcher = mock.Mock()
            monitor.profile_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
                name="홍길동",
            )
            monitor.phone_matcher = mock.Mock()
            monitor.phone_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01099998888",
            )
            monitor.member_directory = mock.Mock()
            monitor.member_directory.upsert.return_value = (True, "synced")
            request = SimpleNamespace(
                stable_key="mismatch-alias",
                display_name="홍길동 01012345678",
                applicant_key="member-1",
                request_id="member-1",
                verified_phone="01099998888",
                phone_verified=True,
            )
            with mock.patch.object(
                BaseBandJoinMonitor,
                "perform_action",
                return_value=(True, "승인 완료"),
            ):
                success, _message = monitor.perform_action(request, "approve")
            self.assertTrue(success)
            self.assertEqual(monitor.member_directory.upsert.call_count, 2)
            self.assertEqual(
                {
                    call.kwargs["phone"]
                    for call in monitor.member_directory.upsert.call_args_list
                },
                {"01012345678", "01099998888"},
            )

    def test_failed_sync_is_retried_after_restart(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            outbox_path = Path(directory) / "outbox.json"
            monitor = self._bare_monitor(outbox_path)
            monitor.profile_matcher = mock.Mock()
            monitor.profile_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
                name="홍길동",
            )
            monitor.phone_matcher = mock.Mock()
            monitor.phone_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
            )
            monitor.member_directory = mock.Mock()
            monitor.member_directory.upsert.return_value = (False, "temporary")
            request = SimpleNamespace(
                stable_key="a" * 64,
                display_name="홍길동 01012345678",
                applicant_key="member-1",
                request_id="member-1",
                application_time="2026-08-22T00:00:00Z",
            )
            with mock.patch.object(
                BaseBandJoinMonitor,
                "perform_action",
                return_value=(True, "승인 완료"),
            ):
                success, message = monitor.perform_action(request, "approve")
            self.assertTrue(success)
            self.assertIn("주기적으로 다시 시도", message)
            self.assertEqual(monitor.member_sync_outbox.count(), 1)

            restarted = self._bare_monitor(outbox_path)
            restarted.member_directory = mock.Mock()
            restarted.member_directory.upsert.return_value = (True, "synced")
            restarted._sync_pending_members()

            restarted.member_directory.upsert.assert_called_once_with(
                phone="01012345678",
                display_name="홍길동",
                member_key="member-1",
            )
            self.assertEqual(restarted.member_sync_outbox.count(), 0)
            self.assertEqual(MemberSyncOutbox(outbox_path, restarted.logger).count(), 0)

    def test_duplicate_queue_input_collapses_to_one_durable_record(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "outbox.json"
            outbox = MemberSyncOutbox(path, logging.getLogger("test"))
            for _ in range(3):
                self.assertTrue(
                    outbox.enqueue(
                        "b" * 64,
                        phones=["01012345678"],
                        display_name="홍길동",
                        member_key="member-1",
                    )
                )
            self.assertEqual(outbox.count(), 1)
            self.assertEqual(MemberSyncOutbox(path, logging.getLogger("test")).count(), 1)

    def test_runtime_status_exposes_queue_health_without_member_pii(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            monitor = self._bare_monitor(Path(directory) / "outbox.json")
            monitor.member_directory = SimpleNamespace(enabled=True, configured=True)
            monitor.member_sync_outbox.enqueue(
                "c" * 64,
                phones=["01012345678"],
                display_name="홍길동",
                member_key="member-1",
            )
            status = monitor.runtime_status_extras()
            serialized = json.dumps(status, ensure_ascii=False)
            self.assertEqual(status["member_sync"]["pending"], 1)
            self.assertTrue(status["member_sync"]["outbox_persistent"])
            self.assertNotIn("01012345678", serialized)
            self.assertNotIn("홍길동", serialized)

    def test_roster_reconcile_backfills_manual_approvals_once_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            monitor = self._bare_monitor(Path(directory) / "outbox.json")
            monitor.profile_matcher = mock.Mock()
            matches = {
                "홍길동/서울/01012345678": SimpleNamespace(
                    eligible=True,
                    phone="01012345678",
                ),
                "전화번호없음": SimpleNamespace(eligible=False, phone=""),
            }
            monitor.profile_matcher.match.side_effect = matches.__getitem__
            monitor.member_directory = mock.Mock()
            monitor.member_directory.upsert_many.return_value = (True, "synced")

            profiles = ["홍길동/서울/01012345678", "전화번호없음"]
            self.assertEqual(monitor._reconcile_roster_profiles(profiles), (True, "synced"))
            monitor.member_directory.upsert_many.assert_called_once_with(
                [
                    {
                        "phone": "01012345678",
                        "display_name": "홍길동/서울/01012345678",
                        "member_key": "",
                    }
                ]
            )
            self.assertEqual(
                monitor._reconcile_roster_profiles(profiles),
                (True, "unchanged"),
            )
            self.assertEqual(monitor.member_directory.upsert_many.call_count, 1)
            self.assertEqual(monitor._last_roster_reconcile["eligible"], 1)
            self.assertNotIn("홍길동", json.dumps(monitor.runtime_status_extras(), ensure_ascii=False))

            restarted = self._bare_monitor(Path(directory) / "restarted-outbox.json")
            restarted.profile_matcher = monitor.profile_matcher
            restarted.member_directory = mock.Mock()
            restarted.member_directory.upsert_many.return_value = (True, "synced")
            self.assertEqual(
                restarted._reconcile_roster_profiles(profiles),
                (True, "synced"),
            )
            restarted.member_directory.upsert_many.assert_called_once()

    def test_failed_roster_reconcile_retries_the_same_member(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            monitor = self._bare_monitor(Path(directory) / "outbox.json")
            monitor.profile_matcher = mock.Mock()
            monitor.profile_matcher.match.return_value = SimpleNamespace(
                eligible=True,
                phone="01012345678",
            )
            monitor.member_directory = mock.Mock()
            monitor.member_directory.upsert_many.side_effect = [
                (False, "temporary"),
                (True, "synced"),
            ]
            profiles = ["홍길동/서울/01012345678"]

            self.assertEqual(
                monitor._reconcile_roster_profiles(profiles),
                (False, "temporary"),
            )
            self.assertEqual(monitor._last_roster_snapshot, {})
            self.assertEqual(
                monitor._reconcile_roster_profiles(profiles),
                (True, "synced"),
            )
            self.assertEqual(monitor.member_directory.upsert_many.call_count, 2)


if __name__ == "__main__":
    unittest.main()
