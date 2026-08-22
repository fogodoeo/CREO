#!/usr/bin/env python3
"""Run the BAND monitor and mirror successful approvals to Supabase."""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import band_join_monitor as monitor_module


TRUE_VALUES = {"1", "true", "yes", "y", "on"}
IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
BaseBandJoinMonitor = monitor_module.BandJoinMonitor


class MemberSyncOutbox:
    """Durable, private retry queue for approved BAND members."""

    def __init__(self, path: Path, logger: logging.Logger):
        self.path = path
        self.logger = logger
        self._lock = threading.RLock()
        self._records: dict[str, dict[str, Any]] = {}
        self.last_save_ok = True
        self._load()

    @staticmethod
    def _nonnegative_int(value: Any) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    def _load(self) -> None:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            return
        raw_records = payload.get("records", {}) if isinstance(payload, dict) else {}
        if not isinstance(raw_records, dict):
            return
        for stable_key, raw_record in raw_records.items():
            if not re.fullmatch(r"[0-9a-f]{64}", str(stable_key)):
                continue
            if not isinstance(raw_record, dict):
                continue
            phones = list(dict.fromkeys(
                str(phone) for phone in raw_record.get("phones", [])
                if re.fullmatch(r"010\d{8}", str(phone))
            ))
            display_name = str(raw_record.get("display_name", "")).strip()
            member_key = str(raw_record.get("member_key", "")).strip()
            if not phones or not display_name or not member_key:
                continue
            self._records[str(stable_key)] = {
                "phones": phones,
                "display_name": display_name[:80],
                "member_key": member_key[:200],
                "attempts": self._nonnegative_int(raw_record.get("attempts", 0)),
                "updated_at": str(raw_record.get("updated_at", ""))[:80],
            }

    def _save(self) -> bool:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(self.path.suffix + ".tmp")
            temporary.write_text(
                json.dumps(
                    {"version": 1, "records": self._records},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                encoding="utf-8",
            )
            try:
                temporary.chmod(0o600)
            except OSError:
                pass
            temporary.replace(self.path)
            self.last_save_ok = True
            return True
        except OSError as exc:
            self.last_save_ok = False
            self.logger.error(
                "BAND 회원 동기화 대기열 저장 실패: %s",
                type(exc).__name__,
            )
            return False

    def enqueue(
        self,
        stable_key: str,
        *,
        phones: list[str],
        display_name: str,
        member_key: str,
    ) -> bool:
        with self._lock:
            existing = self._records.get(stable_key, {})
            self._records[stable_key] = {
                "phones": list(dict.fromkeys(phones)),
                "display_name": display_name[:80],
                "member_key": member_key[:200],
                "attempts": self._nonnegative_int(existing.get("attempts", 0)),
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
            return self._save()

    def get(self, stable_key: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._records.get(stable_key)
            return dict(record) if record else None

    def keys(self) -> list[str]:
        with self._lock:
            return list(self._records)

    def remove(self, stable_key: str) -> bool:
        with self._lock:
            if self._records.pop(stable_key, None) is not None:
                return self._save()
            return True

    def mark_failure(self, stable_key: str) -> bool:
        with self._lock:
            record = self._records.get(stable_key)
            if not record:
                return True
            record["attempts"] = self._nonnegative_int(record.get("attempts", 0)) + 1
            record["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
            return self._save()

    def count(self) -> int:
        with self._lock:
            return len(self._records)


def enabled(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in TRUE_VALUES


class SupabaseMemberDirectory:
    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self.enabled = enabled("BAND_MEMBER_SYNC_ENABLED", False)
        self.url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        self.service_role_key = os.environ.get(
            "SUPABASE_SERVICE_ROLE_KEY", ""
        ).strip()
        table = os.environ.get("BAND_MEMBER_TABLE", "band_members").strip()
        self.table = table if IDENTIFIER_RE.fullmatch(table) else ""
        self.timeout = 7.0
        self.attempts = 3
        self.configured = bool(
            self.enabled
            and self.url.startswith("https://")
            and self.service_role_key
            and self.table
        )

    def upsert(
        self,
        *,
        phone: str,
        display_name: str,
        member_key: str,
    ) -> tuple[bool, str]:
        if not self.enabled:
            return True, "disabled"
        if not self.configured:
            return False, "Supabase 회원 명단 환경변수가 준비되지 않았습니다."
        if not re.fullmatch(r"010\d{8}", phone):
            return False, "승인 프로필에서 유효한 전화번호를 확인하지 못했습니다."

        now = dt.datetime.now(dt.timezone.utc).isoformat()
        body = json.dumps(
            {
                "phone_normalized": phone,
                "display_name": display_name,
                "band_member_key": member_key or None,
                "is_active": True,
                "joined_at": now,
                "updated_at": now,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        query = urllib.parse.urlencode({"on_conflict": "phone_normalized"})
        endpoint = f"{self.url}/rest/v1/{self.table}?{query}"
        request = urllib.request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json; charset=utf-8",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )

        last_error = "unknown"
        for attempt in range(self.attempts):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    status = int(getattr(response, "status", 200))
                if 200 <= status < 300:
                    return True, "synced"
                last_error = f"HTTP {status}"
            except urllib.error.HTTPError as exc:
                last_error = f"HTTP {exc.code}"
            except (OSError, urllib.error.URLError) as exc:
                last_error = type(exc).__name__
            if attempt + 1 < self.attempts:
                time.sleep(0.5 * (attempt + 1))
        return False, f"Supabase 동기화 실패: {last_error}"


class SyncedBandJoinMonitor(BaseBandJoinMonitor):
    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self.member_directory = SupabaseMemberDirectory(self.logger)
        self._last_member_sync: dict[str, Any] | None = None
        self._member_sync_results: dict[str, dict[str, Any]] = {}
        configured_outbox = os.environ.get("BAND_MEMBER_SYNC_OUTBOX_FILE", "").strip()
        outbox_path = (
            Path(configured_outbox).expanduser()
            if configured_outbox
            else self.registry.state_path.with_name("member-sync-outbox.json")
        )
        self.member_sync_outbox = MemberSyncOutbox(outbox_path, self.logger)
        try:
            supplied_interval = float(
                os.environ.get("BAND_MEMBER_SYNC_INTERVAL_SECONDS", "300")
            )
        except ValueError:
            supplied_interval = 300
        self.member_sync_interval_seconds = max(5.0, supplied_interval)
        self._member_sync_run_lock = threading.RLock()
        self._member_sync_worker: threading.Thread | None = None

    def start(self) -> None:
        if self._member_sync_worker and self._member_sync_worker.is_alive():
            return
        super().start()
        self._member_sync_worker = threading.Thread(
            target=self._member_sync_loop,
            name="band-member-sync-retry",
            daemon=True,
        )
        self._member_sync_worker.start()

    def stop(self) -> None:
        self.stop_event.set()
        worker = getattr(self, "_member_sync_worker", None)
        if worker and worker.is_alive() and worker is not threading.current_thread():
            worker.join(timeout=2)
        super().stop()

    def _member_sync_loop(self) -> None:
        self._sync_pending_members()
        while not self.stop_event.wait(self.member_sync_interval_seconds):
            self._sync_pending_members()

    def runtime_status_extras(self) -> dict[str, Any]:
        directory = getattr(self, "member_directory", None)
        return {
            "member_sync": {
                "enabled": bool(directory and directory.enabled),
                "configured": bool(directory and directory.configured),
                "last_result": self._last_member_sync,
                "pending": (
                    self.member_sync_outbox.count()
                    if hasattr(self, "member_sync_outbox")
                    else 0
                ),
                "interval_seconds": int(
                    getattr(self, "member_sync_interval_seconds", 300)
                ),
                "outbox_persistent": bool(
                    getattr(getattr(self, "member_sync_outbox", None), "last_save_ok", True)
                ),
            }
        }

    def _record_member_sync(
        self, result: str, success: bool, request: Any | None = None
    ) -> None:
        self._last_member_sync = {
            "result": result,
            "success": success,
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        stable_key = str(getattr(request, "stable_key", "") or "")
        if stable_key:
            self._member_sync_results[stable_key] = dict(self._last_member_sync)

    def _prepare_member_sync(self, request: Any) -> tuple[dict[str, Any] | None, str]:
        profile = self.profile_matcher.match(request.display_name)
        if not profile.eligible or not profile.phone:
            return None, "profile_phone_missing"

        phone_verification = self.phone_matcher.match(profile, request)
        if not phone_verification.eligible or not phone_verification.phone:
            return None, "verified_phone_unavailable"

        phones = list(dict.fromkeys(
            phone for phone in (profile.phone, phone_verification.phone)
            if re.fullmatch(r"010\d{8}", phone)
        ))
        stable_key = str(getattr(request, "stable_key", "") or "")
        if not re.fullmatch(r"[0-9a-f]{64}", stable_key):
            stable_key = monitor_module.make_stable_key(
                request_id=str(
                    getattr(request, "applicant_key", "")
                    or getattr(request, "request_id", "")
                ),
                display_name=str(getattr(request, "display_name", "")),
                application_time=str(getattr(request, "application_time", "")),
                source="MEMBER_SYNC",
            )
        return {
            "stable_key": stable_key,
            "phones": phones,
            "display_name": profile.name,
            "member_key": str(
                getattr(request, "applicant_key", "")
                or getattr(request, "request_id", "")
                or stable_key
            ),
        }, "ready"

    def _sync_outbox_record(self, stable_key: str) -> tuple[bool, str]:
        with self._member_sync_run_lock:
            record = self.member_sync_outbox.get(stable_key)
            if not record:
                return True, "already_synced"
            phones = record.get("phones", [])
            display_name = str(record.get("display_name", ""))
            member_key = str(record.get("member_key", ""))
            results: list[tuple[bool, str]] = []
            for phone in phones:
                try:
                    result = self.member_directory.upsert(
                        phone=phone,
                        display_name=display_name,
                        member_key=member_key,
                    )
                except Exception as exc:  # Keep the retry worker alive on provider faults.
                    self.logger.error(
                        "BAND 승인 회원 명단 동기화 예외: %s",
                        type(exc).__name__,
                    )
                    result = (False, "unexpected_sync_error")
                results.append(result)
            synced = bool(results) and all(result[0] for result in results)
            if synced:
                if all(result[1] == "disabled" for result in results):
                    detail = "disabled"
                elif len(results) <= 1:
                    detail = results[0][1]
                else:
                    detail = "synced_profile_and_verified"
                self.member_sync_outbox.remove(stable_key)
                self._record_member_sync(detail, True)
                if detail != "disabled":
                    self.logger.info(
                        "BAND 승인 회원을 Supabase 명단에 등록했습니다."
                    )
                return True, detail

            self.member_sync_outbox.mark_failure(stable_key)
            self._record_member_sync("sync_failed", False)
            detail = "; ".join(
                result[1] for result in results if not result[0]
            ) or "no_phone"
            self.logger.error("BAND 승인 회원 명단 동기화 실패: %s", detail)
            return False, detail

    def _sync_pending_members(self) -> None:
        for stable_key in self.member_sync_outbox.keys():
            if self.stop_event.is_set():
                return
            try:
                self._sync_outbox_record(stable_key)
            except Exception as exc:  # One corrupt item must not stop later retries.
                self.logger.error(
                    "BAND 회원 동기화 대기열 처리 예외: %s",
                    type(exc).__name__,
                )

    def perform_action(self, request: Any, action: str) -> tuple[bool, str]:
        success, message = super().perform_action(request, action)
        if not success or action != "approve":
            return success, message

        prepared, preparation_result = self._prepare_member_sync(request)
        if not prepared:
            self._record_member_sync(preparation_result, False, request)
            self.logger.error(
                "BAND 승인 후 회원 명단 동기화 준비 실패: %s",
                preparation_result,
            )
            return True, f"{message} 회원 명단 자동 등록은 준비하지 못했습니다."

        persisted = self.member_sync_outbox.enqueue(
            prepared["stable_key"],
            phones=prepared["phones"],
            display_name=prepared["display_name"],
            member_key=prepared["member_key"],
        )
        synced, detail = self._sync_outbox_record(prepared["stable_key"])
        if synced:
            return True, message

        storage = "대기열" if persisted else "현재 실행의 메모리 대기열"
        return True, (
            f"{message} 회원 명단 등록은 {storage}에 저장했으며 "
            f"주기적으로 다시 시도합니다: {detail}"
        )


def main() -> int:
    monitor_module.BandJoinMonitor = SyncedBandJoinMonitor
    return monitor_module.main()


if __name__ == "__main__":
    raise SystemExit(main())
