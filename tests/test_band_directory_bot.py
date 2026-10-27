import unittest
from unittest.mock import Mock
from band_directory_bot import DirectoryMonitor, member_record, eligible, phone_from_text


class FakeDirectory:
    def __init__(self):
        self.events = []
        self.claimed = set()
        self.fail = None

    def call(self, operation, data=None):
        self.events.append((operation, data))
        if operation == self.fail:
            raise OSError("storage unavailable")
        if operation == "claim":
            key = data["applicationId"]
            if key in self.claimed:
                return {"claimed": False, "state": "claimed"}
            self.claimed.add(key)
            return {"claimed": True}
        return {"ok": True}


def worker(directory):
    monitor = object.__new__(DirectoryMonitor)
    monitor.directory = directory
    monitor.auto_enabled = True
    monitor.saved_fingerprints = {}
    monitor.approved_count = 0
    return monitor


class DirectoryBotTests(unittest.TestCase):
    def test_application_detail_is_saved_before_approval(self):
        directory = FakeDirectory()
        monitor = worker(directory)
        monitor.api = Mock(side_effect=[
            {"items": [{"member_key": "padded+member/key==", "applicant_name": "업체", "created_at": 100}], "paging": {}},
            {"application": {"cellphone_verified": True, "cellphone": "01012345678"}},
            {},
        ])
        monitor.poll(None)
        self.assertEqual(directory.events[0][1]["members"][0]["sources"]["verified"]["text"], "01012345678")
        self.assertEqual([c.args[1] for c in monitor.api.call_args_list],
                         ["getApplicationOfBand", "getApplicationDetailInfo", "acceptApplication"])
        self.assertEqual(monitor.approved_count, 1)

    def test_incomplete_application_detail_never_approves(self):
        directory = FakeDirectory()
        monitor = worker(directory)
        monitor.api = Mock(side_effect=[{"items": [{"member_key": "key", "name": "01012345678"}]}, {}])
        with self.assertRaisesRegex(RuntimeError, "application_detail_schema_changed"):
            monitor.poll(None)
        self.assertEqual(directory.events, [])

    def test_roster_batch_checkpoint_advances_only_after_saved_records(self):
        directory = FakeDirectory()
        monitor = worker(directory)
        rows = [{"member_key": "member_key_%02d" % i, "name": "회원"} for i in range(12)]
        monitor.progress, monitor.roster_rows, monitor.roster_index = {"offset": 50}, rows, 0
        monitor.api = lambda _connection, _operation, args: {"members": args[0]}
        directory.fail = "members"
        with self.assertRaises(OSError):
            monitor.roster_step(None)
        self.assertEqual(monitor.progress["offset"], 50)
        self.assertEqual(monitor.roster_index, 0)
        directory.fail = "progress"
        with self.assertRaises(OSError):
            monitor.roster_step(None)
        self.assertEqual(monitor.progress["offset"], 50)
        self.assertEqual(monitor.roster_index, 0)
        directory.fail = None
        monitor.roster_step(None)
        self.assertEqual(monitor.progress["offset"], 60)
        monitor.roster_step(None)
        self.assertEqual(monitor.progress["offset"], 62)
        self.assertEqual(directory.events[-1], ("progress", {"offset": 62, "complete": False}))

    def test_empty_roster_page_completes_but_short_detail_batch_cannot_skip(self):
        directory = FakeDirectory()
        monitor = worker(directory)
        monitor.progress, monitor.roster_rows, monitor.roster_index = {"offset": 1157}, [], 0
        monitor.api = Mock(return_value={"members": []})
        monitor.roster_step(None)
        self.assertTrue(monitor.progress["complete"])
        monitor.progress, monitor.roster_rows = {"offset": 0}, [{"user_no": 123}]
        with self.assertRaisesRegex(RuntimeError, "roster_schema_changed"):
            monitor.roster_step(None)
        self.assertEqual(monitor.progress["offset"], 0)

    def test_answer_only_business_is_eligible_without_profile_format(self):
        item = {"member_key": "key", "name": "사업체", "join_answer": "연락처 010-1234-5678"}
        self.assertTrue(eligible(member_record(item)))
        self.assertFalse(eligible(member_record({"name": "사업체", "join_answer": "가입일 20261028"})))

    def test_real_verified_phone_only_and_no_otp_or_mask_inference(self):
        self.assertNotIn("verified", member_record({"cellphone": "01012345678"})["sources"])
        self.assertNotIn("verified", member_record({"cellphone": "010****5678", "cellphone_verified": True})["sources"])
        self.assertNotIn("verified", member_record({"cellphone": "123456", "cellphone_verified": True})["sources"])
        self.assertTrue(eligible(member_record({"cellphone": "+821012345678", "cellphone_verified": True})))

    def test_phone_parser_attached_profile_and_ambiguity(self):
        self.assertEqual(phone_from_text("김철수01012345678"), "01012345678")
        self.assertEqual(phone_from_text("01012345678 / 01099998888"), "")
        self.assertEqual(phone_from_text("20261028", allow_short=False), "")

    def test_store_before_approve_and_duplicate_suppression(self):
        directory = FakeDirectory()
        monitor = worker(directory)
        item = {"member_key": "member-key", "name": "업체", "created_at": 100, "join_answer": "01012345678"}
        actions = []
        def approve(key):
            self.assertEqual([e[0] for e in directory.events], ["members", "claim"])
            actions.append(key)
        monitor.process_application(item, approve)
        monitor.process_application(item, approve)
        self.assertEqual(actions, ["member-key"])
        self.assertTrue(directory.events[2][1]["success"])
        self.assertEqual(monitor.approved_count, 1)

    def test_storage_failure_prevents_approval(self):
        directory = FakeDirectory()
        directory.fail = "members"
        monitor = worker(directory)
        actions = []
        with self.assertRaises(OSError):
            monitor.process_application({"member_key": "key", "name": "01012345678"}, actions.append)
        self.assertEqual(actions, [])

    def test_unknown_approval_result_is_journaled_and_not_repeated(self):
        directory = FakeDirectory()
        monitor = worker(directory)
        item = {"member_key": "key", "name": "01012345678"}
        def timeout(_key):
            raise TimeoutError()
        with self.assertRaises(TimeoutError):
            monitor.process_application(item, timeout)
        self.assertEqual(directory.events[-1], ("finish", {"applicationId": "key:", "success": False}))
        restarted = worker(directory)
        restarted.process_application(item, timeout)
        self.assertEqual(restarted.approved_count, 0)

    def test_no_phone_is_saved_and_left_pending_without_rejection(self):
        directory = FakeDirectory()
        worker(directory).process_application({"member_key": "key", "name": "업체"}, lambda _: self.fail("must not approve"))
        self.assertEqual([e[0] for e in directory.events], ["members"])


if __name__ == "__main__":
    unittest.main()
