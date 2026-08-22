#!/usr/bin/env python3
"""Run CREO and the isolated BAND approval monitor in one Render service."""

from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from typing import Optional


ROOT = Path(__file__).resolve().parent
IS_RENDER = any(
    os.environ.get(name)
    for name in ("RENDER", "RENDER_SERVICE_ID", "RENDER_EXTERNAL_URL")
)
PERSISTENT_ROOT = Path("/var/data/band-monitor") if IS_RENDER else ROOT / ".band-monitor"
PLATFORM_PERSISTENT_ROOT = Path("/var/data/creo-platform")
STATUS_PATH = Path(
    os.environ.get("BAND_MONITOR_STATUS_FILE", str(PERSISTENT_ROOT / "runtime.json"))
)
TRUE_VALUES = {"1", "true", "yes", "y", "on"}


def enabled(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in TRUE_VALUES


def member_sync_interval_seconds() -> int:
    try:
        supplied = float(os.environ.get("BAND_MEMBER_SYNC_INTERVAL_SECONDS", "300"))
    except ValueError:
        supplied = 300
    return max(5, int(supplied))


def write_disabled_status() -> None:
    try:
        STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        config_path = Path(
            os.environ.get(
                "BAND_MONITOR_CONFIG", str(ROOT / "band_join_monitor_config.json")
            )
        )
        try:
            config = json.loads(config_path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            config = {}
        phone_rules = config.get("phone_verification_rules", {})
        if not isinstance(phone_rules, dict):
            phone_rules = {}
        sync_enabled = enabled("BAND_MEMBER_SYNC_ENABLED", False)
        sync_configured = bool(
            sync_enabled
            and os.environ.get("SUPABASE_URL", "").strip().startswith("https://")
            and os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            and os.environ.get("BAND_MEMBER_TABLE", "band_members").strip()
        )
        payload = {
            "version": "render-supervisor-1",
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "state": "DISABLED",
            "detail": "BAND_MONITOR_ENABLED=false",
            "connected": False,
            "monitor_enabled": False,
            "headless": enabled("BAND_CHROME_HEADLESS", True),
            "auto_approve": bool(config.get("auto_approve_enabled", False)),
            "auto_reject": bool(config.get("auto_reject_enabled", False)),
            "follow_up_question": bool(
                config.get("follow_up_question", {}).get("enabled", False)
                if isinstance(config.get("follow_up_question", {}), dict)
                else False
            ),
            "phone_verification": {
                "enabled": bool(phone_rules.get("enabled", False)),
                "require_verified": bool(phone_rules.get("require_verified", False)),
                "require_number_match": False,
            },
            "applications": {
                "tracked": 0,
                "queued": 0,
                "eligible": 0,
                "invalid": 0,
                "verification_pending": 0,
                "phone_mismatch": 0,
                "approved": 0,
                "rejected": 0,
                "action_failed": 0,
            },
            "last_action": None,
            "member_sync": {
                "enabled": sync_enabled,
                "configured": sync_configured,
                "last_result": None,
                "pending": 0,
                "interval_seconds": member_sync_interval_seconds(),
                "outbox_persistent": True,
            },
        }
        temporary = STATUS_PATH.with_suffix(STATUS_PATH.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(STATUS_PATH)
    except OSError as exc:
        print(f"[render-supervisor] status write failed: {exc}", flush=True)


def prepare_platform_storage(environment: dict[str, str]) -> Optional[Path]:
    """Point platform SQLite at the Render disk and migrate the legacy DB once."""
    configured = environment.get("CREO_DATA_DIR", "").strip()
    if configured:
        target_directory = Path(configured)
    elif IS_RENDER:
        target_directory = PLATFORM_PERSISTENT_ROOT
        environment["CREO_DATA_DIR"] = str(target_directory)
    else:
        return None

    target_directory.mkdir(parents=True, exist_ok=True)
    target_database = target_directory / "creo-platform.sqlite"
    legacy_database = ROOT / "storage" / "creo-platform.sqlite"
    if target_database.exists() or not legacy_database.is_file():
        return target_database

    temporary_database = target_directory / "creo-platform.sqlite.migrating"
    try:
        if temporary_database.exists():
            temporary_database.unlink()
        source = sqlite3.connect(f"file:{legacy_database.as_posix()}?mode=ro", uri=True)
        destination = sqlite3.connect(temporary_database)
        try:
            source.backup(destination)
            integrity = destination.execute("PRAGMA integrity_check").fetchone()
            if not integrity or integrity[0] != "ok":
                raise RuntimeError("platform SQLite migration integrity check failed")
        finally:
            destination.close()
            source.close()
        temporary_database.replace(target_database)
        print(
            f"[render-supervisor] platform SQLite migrated to {target_database}",
            flush=True,
        )
    finally:
        if temporary_database.exists():
            temporary_database.unlink()
    return target_database


def start_node() -> subprocess.Popen[bytes]:
    environment = os.environ.copy()
    environment.pop("BAND_COOKIE_HEADER", None)
    environment.pop("BAND_COOKIE_JSON", None)
    environment.setdefault("NODE_OPTIONS", "--max-old-space-size=192")
    prepare_platform_storage(environment)
    command = ["node", str(ROOT / "server.js")]
    print(f"[render-supervisor] starting web app: {' '.join(command)}", flush=True)
    return subprocess.Popen(command, cwd=ROOT, env=environment)


def resolve_chrome_executable(
    environment: dict[str, str], root: Path = ROOT
) -> str:
    """Find Chromium from Docker or Puppeteer's native-runtime download."""
    configured = environment.get("BAND_CHROME_EXECUTABLE", "").strip()
    if configured and Path(configured).is_file():
        return configured

    system_chromium = Path("/usr/bin/chromium")
    if system_chromium.is_file():
        return str(system_chromium)

    bundled_pattern = (
        root
        / "node_modules"
        / ".cache"
        / "puppeteer"
        / "chrome"
    )
    bundled_candidates = sorted(
        bundled_pattern.glob("linux-*/chrome-linux64/chrome"),
        reverse=True,
    )
    for candidate in bundled_candidates:
        if candidate.is_file():
            return str(candidate)

    try:
        result = subprocess.run(
            [
                "node",
                "-e",
                (
                    "const p=require('puppeteer');"
                    "process.stdout.write(p.executablePath())"
                ),
            ],
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        candidate = result.stdout.strip()
        if candidate and Path(candidate).is_file():
            return candidate
        print(
            "[render-supervisor] Puppeteer Chrome path is missing",
            flush=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(
            f"[render-supervisor] Puppeteer Chrome lookup failed: {exc}",
            flush=True,
        )
    return configured


def start_band_monitor() -> subprocess.Popen[bytes]:
    environment = os.environ.copy()
    environment["PYTHONUNBUFFERED"] = "1"
    PERSISTENT_ROOT.mkdir(parents=True, exist_ok=True)
    environment.setdefault(
        "BAND_CHROME_PROFILE_DIR", str(PERSISTENT_ROOT / "chrome-profile")
    )
    environment.setdefault(
        "BAND_MONITOR_STATE_FILE", str(PERSISTENT_ROOT / "state.json")
    )
    environment.setdefault(
        "BAND_MONITOR_LOG_FILE", str(PERSISTENT_ROOT / "monitor.log")
    )
    environment.setdefault(
        "BAND_MONITOR_STATUS_FILE", str(PERSISTENT_ROOT / "runtime.json")
    )
    chrome_executable = resolve_chrome_executable(environment)
    if chrome_executable:
        environment["BAND_CHROME_EXECUTABLE"] = chrome_executable
        print(
            "[render-supervisor] Headless Chrome is ready",
            flush=True,
        )
    config_path = environment.get(
        "BAND_MONITOR_CONFIG", str(ROOT / "band_join_monitor_config.json")
    )
    command = [
        sys.executable,
        str(ROOT / "band_member_sync_monitor.py"),
        "--config",
        config_path,
        "--daemon",
    ]
    print("[render-supervisor] starting BAND monitor", flush=True)
    return subprocess.Popen(command, cwd=ROOT, env=environment)


def stop_process(process: Optional[subprocess.Popen[bytes]], name: str) -> None:
    if not process or process.poll() is not None:
        return
    print(f"[render-supervisor] stopping {name}", flush=True)
    process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    stopping = threading.Event()

    def request_stop(_signum: int, _frame: object) -> None:
        stopping.set()

    for signal_name in ("SIGTERM", "SIGINT"):
        signal_value = getattr(signal, signal_name, None)
        if signal_value is not None:
            signal.signal(signal_value, request_stop)

    node_process = start_node()
    # Fail closed until the operator explicitly enables the approval sidecar.
    # This prevents two services from approving the same application during a
    # staged migration or rollback.
    band_enabled = enabled("BAND_MONITOR_ENABLED", False)
    band_process: Optional[subprocess.Popen[bytes]] = None
    if band_enabled:
        band_process = start_band_monitor()
    else:
        write_disabled_status()
        print(
            "[render-supervisor] BAND monitor disabled; set "
            "BAND_MONITOR_ENABLED=true to enable it",
            flush=True,
        )

    exit_code = 0
    try:
        while not stopping.wait(1):
            node_exit = node_process.poll()
            if node_exit is not None:
                print(
                    f"[render-supervisor] web app exited: {node_exit}",
                    flush=True,
                )
                exit_code = node_exit or 1
                break

            if band_enabled and band_process and band_process.poll() is not None:
                band_exit = band_process.returncode
                print(
                    f"[render-supervisor] BAND monitor exited: {band_exit}; "
                    "restarting in 10 seconds",
                    flush=True,
                )
                if stopping.wait(10):
                    break
                band_process = start_band_monitor()
    finally:
        stop_process(band_process, "BAND monitor")
        stop_process(node_process, "web app")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
