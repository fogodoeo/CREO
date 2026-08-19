#!/usr/bin/env python3
"""CREO PRISM screenshot agent.

The agent leases capture jobs from the CREO server, triggers PRISM's global
Screenshot Output hotkey, compresses the result and uploads it to the matching
auction item. All runtime values are stored in the user's LocalAppData folder.
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import io
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import socket
import sys
import threading
import time
from typing import Any
import uuid

import requests
from PIL import Image, ImageOps


APP_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "CREO" / "CaptureAgent"
CONFIG_PATH = APP_DIR / "config.json"
LOG_PATH = APP_DIR / "capture-agent.log"
DIAGNOSTICS_PATH = APP_DIR / "diagnostics.json"
AGENT_VERSION = "1.2.0"
DEFAULT_CONFIG: dict[str, Any] = {
    "config_version": 2,
    "enabled": True,
    "service_url": "https://creok.onrender.com",
    "channel_id": "auto",
    "agent_id": "",
    "agent_token": "",
    "agent_name": socket.gethostname(),
    "screenshot_directory": str(Path.home() / "Videos"),
    "hotkey": "f3",
    "capture_delay_ms": 250,
    "screenshot_timeout_sec": 12,
    "poll_interval_sec": 1.0,
    "max_width": 1280,
    "webp_quality": 82,
    "crop_percent": [0.0, 0.0, 100.0, 100.0],
}


def _existing_directory(value: Any) -> Path | None:
    text = os.path.expandvars(str(value or "").strip().strip('"'))
    if not text:
        return None
    candidate = Path(text).expanduser()
    return candidate if candidate.is_dir() else None


def detect_prism_screenshot_directory(current: Any = "") -> Path:
    """Find PRISM/OBS's configured output folder, then fall back to common folders."""
    current_directory = _existing_directory(current)
    profile_roots: list[Path] = []
    for environment_name in ("APPDATA", "LOCALAPPDATA"):
        base = _existing_directory(os.environ.get(environment_name))
        if not base:
            continue
        for name in ("PRISMLiveStudio", "PRISM Live Studio", "PRISM", "obs-studio"):
            candidate = base / name
            if candidate.is_dir():
                profile_roots.append(candidate)

    config_candidates: list[Path] = []
    for root in profile_roots:
        try:
            config_candidates.extend(root.rglob("basic.ini"))
        except OSError:
            continue
    config_candidates.sort(key=lambda path: path.stat().st_mtime_ns if path.exists() else 0, reverse=True)
    path_keys = ("FilePath", "RecFilePath", "FFFilePath", "Path")
    for config_path in config_candidates:
        text = ""
        for encoding in ("utf-8-sig", "cp949", "utf-16"):
            try:
                text = config_path.read_text(encoding=encoding)
                break
            except (UnicodeError, OSError):
                continue
        for key in path_keys:
            match = re.search(rf"(?im)^\s*{re.escape(key)}\s*=\s*(.+?)\s*$", text)
            if match:
                detected = _existing_directory(match.group(1).replace("/", os.sep))
                if detected:
                    return detected

    common_candidates = [
        Path.home() / "Videos" / "PRISM Live Studio",
        Path.home() / "Videos" / "PRISM",
        Path.home() / "Pictures" / "PRISM Live Studio",
        Path.home() / "Pictures" / "PRISM",
        Path.home() / "Videos",
        Path.home() / "Pictures",
    ]
    one_drive = _existing_directory(os.environ.get("OneDrive"))
    if one_drive:
        common_candidates = [
            one_drive / "Videos" / "PRISM Live Studio",
            one_drive / "Pictures" / "PRISM Live Studio",
            one_drive / "Videos",
            one_drive / "Pictures",
            *common_candidates,
        ]
    for candidate in common_candidates:
        if candidate.is_dir():
            return candidate
    return current_directory or Path.home()

VK_CODES = {
    "ctrl": 0x11,
    "control": 0x11,
    "shift": 0x10,
    "alt": 0x12,
    "win": 0x5B,
    "f1": 0x70,
    "f2": 0x71,
    "f3": 0x72,
    "f4": 0x73,
    "f5": 0x74,
    "f6": 0x75,
    "f7": 0x76,
    "f8": 0x77,
    "f9": 0x78,
    "f10": 0x79,
    "f11": 0x7A,
    "f12": 0x7B,
}
KEYEVENTF_KEYUP = 0x0002


def load_config() -> dict[str, Any]:
    config = dict(DEFAULT_CONFIG)
    stored: dict[str, Any] = {}
    try:
        stored = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(stored, dict):
            config.update(stored)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    # v1.1 used Ctrl+Shift+F12. Existing installations using that untouched
    # default migrate to the new operator-selected F3 key automatically.
    if int(config.get("config_version") or 0) < 2:
        if str(config.get("hotkey") or "").strip().lower() == "ctrl+shift+f12":
            config["hotkey"] = "f3"
        config["config_version"] = 2
    if not str(config.get("agent_id") or "").strip():
        config["agent_id"] = f"{socket.gethostname()}-{uuid.uuid4().hex}"
    try:
        APP_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass
    return config


def save_config(config: dict[str, Any]) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def write_diagnostics(phase: str, **values: Any) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {}
    try:
        stored = json.loads(DIAGNOSTICS_PATH.read_text(encoding="utf-8"))
        if isinstance(stored, dict):
            payload.update(stored)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    payload.update(values)
    payload.update({
        "version": AGENT_VERSION,
        "phase": phase,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    })
    temporary = DIAGNOSTICS_PATH.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(DIAGNOSTICS_PATH)
    except OSError:
        pass


def setup_logging() -> logging.Logger:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("creo-capture-agent")
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG)
    handler = RotatingFileHandler(LOG_PATH, maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    if sys.stdout and not sys.stdout.closed:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(console)
    return logger


def auth_headers(config: dict[str, Any]) -> dict[str, str]:
    token = str(config.get("agent_token") or "").strip()
    headers = {"Content-Type": "application/json", "User-Agent": f"CREO-Capture-Agent/{AGENT_VERSION}"}
    if token:
        headers["X-Creo-Capture-Token"] = token
        headers["X-Creo-Admin"] = token
    return headers


def api_url(config: dict[str, Any], path: str) -> str:
    return f"{str(config.get('service_url') or '').rstrip('/')}/{path.lstrip('/')}"


def parse_hotkey(value: str) -> list[int]:
    keys: list[int] = []
    for raw in str(value or "").lower().replace(" ", "").split("+"):
        if not raw:
            continue
        code = VK_CODES.get(raw)
        if code is None and len(raw) == 1:
            code = ord(raw.upper())
        if code is None:
            raise ValueError(f"지원하지 않는 단축키: {raw}")
        keys.append(code)
    if not keys:
        raise ValueError("캡처 단축키가 비어 있습니다.")
    return keys


def send_hotkey(value: str) -> None:
    if os.name != "nt":
        raise RuntimeError("PRISM 단축키 캡처는 Windows에서만 지원합니다.")
    keys = parse_hotkey(value)
    user32 = ctypes.windll.user32
    for code in keys:
        user32.keybd_event(code, 0, 0, 0)
        time.sleep(0.025)
    for code in reversed(keys):
        user32.keybd_event(code, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(0.025)


def image_files(directory: Path) -> dict[Path, tuple[int, int]]:
    result: dict[Path, tuple[int, int]] = {}
    if not directory.exists():
        return result
    for pattern in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
        for candidate in directory.rglob(pattern):
            try:
                stat = candidate.stat()
                result[candidate] = (stat.st_mtime_ns, stat.st_size)
            except OSError:
                continue
    return result


def wait_for_screenshot(directory: Path, before: dict[Path, tuple[int, int]], timeout: float) -> Path:
    deadline = time.monotonic() + max(2.0, timeout)
    candidate: Path | None = None
    stable_size = -1
    stable_ticks = 0
    while time.monotonic() < deadline:
        current = image_files(directory)
        changed = [path for path, signature in current.items() if before.get(path) != signature]
        if changed:
            latest = max(changed, key=lambda path: current[path][0])
            size = current[latest][1]
            if latest == candidate and size > 0 and size == stable_size:
                stable_ticks += 1
                if stable_ticks >= 2:
                    return latest
            else:
                candidate = latest
                stable_size = size
                stable_ticks = 0
        time.sleep(0.2)
    raise TimeoutError("PRISM 스크린샷 파일이 생성되지 않았습니다. 단축키와 녹화 저장 경로를 확인하세요.")


def crop_box(size: tuple[int, int], values: Any) -> tuple[int, int, int, int]:
    try:
        x, y, width, height = [float(value) for value in values]
    except (TypeError, ValueError):
        x, y, width, height = 0.0, 0.0, 100.0, 100.0
    x = min(99.0, max(0.0, x))
    y = min(99.0, max(0.0, y))
    width = min(100.0 - x, max(1.0, width))
    height = min(100.0 - y, max(1.0, height))
    image_width, image_height = size
    left = round(image_width * x / 100)
    top = round(image_height * y / 100)
    right = max(left + 1, round(image_width * (x + width) / 100))
    bottom = max(top + 1, round(image_height * (y + height) / 100))
    return left, top, min(image_width, right), min(image_height, bottom)


def compress_capture(path: Path, config: dict[str, Any]) -> tuple[bytes, int, int]:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image = image.crop(crop_box(image.size, config.get("crop_percent")))
        max_width = max(480, min(1920, int(config.get("max_width") or 1280)))
        if image.width > max_width:
            height = max(1, round(image.height * max_width / image.width))
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        quality = max(55, min(92, int(config.get("webp_quality") or 82)))
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=quality, method=4)
        while output.tell() > 2_700_000 and quality > 55:
            quality -= 7
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=quality, method=4)
        return output.getvalue(), image.width, image.height


class CaptureAgent:
    def __init__(self, config: dict[str, Any], logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.session = requests.Session()
        self.stop_event = threading.Event()

    def request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        headers = dict(auth_headers(self.config))
        headers.update(kwargs.pop("headers", {}) or {})
        started = time.monotonic()
        self.logger.debug("HTTP start: %s %s", method, path)
        try:
            response = self.session.request(method, api_url(self.config, path), headers=headers, timeout=20, **kwargs)
        except Exception as error:
            self.logger.error(
                "HTTP transport failed: %s %s elapsed_ms=%s error=%s",
                method,
                path,
                round((time.monotonic() - started) * 1000),
                error,
            )
            raise
        self.logger.debug(
            "HTTP done: %s %s status=%s elapsed_ms=%s",
            method,
            path,
            response.status_code,
            round((time.monotonic() - started) * 1000),
        )
        if response.status_code >= 400:
            try:
                message = response.json().get("error")
            except Exception:
                message = response.text[:200]
            raise RuntimeError(message or f"서버 요청 실패 ({response.status_code})")
        return response

    def connection_test(self) -> str:
        self.logger.info("Connection test started: service=%s", self.config.get("service_url"))
        response = self.request("GET", "/api/capture/agent-check")
        payload = response.json()
        write_diagnostics(
            "connection_ok",
            active_channel=payload.get("activeChannel") or "",
            storage_backend=payload.get("storage", {}).get("backend", ""),
            last_error="",
        )
        return (
            f"연결 성공 · 현재 경매 {payload.get('activeChannel') or '-'} · "
            f"저장소 {payload.get('storage', {}).get('backend', '-')}"
        )

    def activate(self) -> str:
        response = self.request(
            "POST",
            "/api/capture/agents/activate",
            json={
                "channelId": str(self.config.get("channel_id") or "auto"),
                "agentId": str(self.config.get("agent_id") or ""),
                "agentName": str(self.config.get("agent_name") or socket.gethostname()),
            },
        )
        payload = response.json()
        write_diagnostics(
            "agent_activated",
            active_channel=payload.get("channelId") or "",
            agent_id=str(self.config.get("agent_id") or ""),
            agent_name=str(self.config.get("agent_name") or ""),
            last_error="",
        )
        return f"이 PC가 {payload.get('channelId') or '-'} 경매의 활성 캡처 본체입니다."

    def lease_job(self) -> dict[str, Any] | None:
        response = self.request(
            "POST",
            "/api/capture/jobs/next",
            json={
                "channelId": str(self.config.get("channel_id") or "auto"),
                "agentId": str(self.config.get("agent_id") or ""),
                "agentName": str(self.config.get("agent_name") or socket.gethostname()),
            },
        )
        return response.json().get("job")

    def capture_file(self) -> Path:
        directory = Path(str(self.config.get("screenshot_directory") or "")).expanduser()
        if not directory.is_dir():
            raise RuntimeError(f"스크린샷 폴더를 찾을 수 없습니다: {directory}")
        before = image_files(directory)
        self.logger.info(
            "Capture prepare: folder=%s files=%s hotkey=%s delay_ms=%s timeout_sec=%s",
            directory,
            len(before),
            self.config.get("hotkey"),
            self.config.get("capture_delay_ms"),
            self.config.get("screenshot_timeout_sec"),
        )
        write_diagnostics(
            "capture_preparing",
            screenshot_directory=str(directory),
            screenshot_directory_exists=True,
            image_files_before=len(before),
            hotkey=str(self.config.get("hotkey") or ""),
            last_error="",
        )
        delay = max(0, int(self.config.get("capture_delay_ms") or 0)) / 1000
        if delay:
            time.sleep(delay)
        hotkey = str(self.config.get("hotkey") or "f3")
        send_hotkey(hotkey)
        self.logger.info("Hotkey sent: %s", hotkey)
        write_diagnostics("hotkey_sent", hotkey=hotkey)
        screenshot = wait_for_screenshot(directory, before, float(self.config.get("screenshot_timeout_sec") or 12))
        try:
            stat = screenshot.stat()
            screenshot_size = stat.st_size
        except OSError:
            screenshot_size = 0
        self.logger.info("Screenshot detected: path=%s size=%s", screenshot, screenshot_size)
        write_diagnostics(
            "screenshot_detected",
            screenshot_path=str(screenshot),
            screenshot_size=screenshot_size,
            last_error="",
        )
        return screenshot

    def upload(self, job: dict[str, Any], image: bytes, width: int, height: int) -> None:
        self.request(
            "POST",
            f"/api/capture/jobs/{job['id']}/upload",
            json={
                "channelId": str(job.get("channelId") or self.config.get("channel_id") or "auto"),
                "mimeType": "image/webp",
                "imageBase64": base64.b64encode(image).decode("ascii"),
                "width": width,
                "height": height,
                "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            },
        )
        self.logger.info("Upload accepted: job=%s bytes=%s", job.get("id"), len(image))

    def fail(self, job: dict[str, Any], error: Exception) -> None:
        write_diagnostics(
            "capture_failed",
            last_job_id=str(job.get("id") or ""),
            last_item_number=str(job.get("itemNumber") or ""),
            last_error=f"{type(error).__name__}: {error}",
        )
        try:
            self.request(
                "POST",
                f"/api/capture/jobs/{job['id']}/fail",
                json={
                    "channelId": str(job.get("channelId") or self.config.get("channel_id") or "auto"),
                    "error": str(error)[:500],
                },
            )
        except Exception as report_error:
            self.logger.error("Failed to report capture error: %s", report_error)

    def process_job(self, job: dict[str, Any]) -> None:
        self.logger.info("Capture start: %s %s", job.get("itemNumber"), job.get("itemName"))
        write_diagnostics(
            "job_received",
            last_job_id=str(job.get("id") or ""),
            last_item_number=str(job.get("itemNumber") or ""),
            last_item_name=str(job.get("itemName") or ""),
            last_error="",
        )
        try:
            screenshot = self.capture_file()
            image, width, height = compress_capture(screenshot, self.config)
            self.upload(job, image, width, height)
            self.logger.info("Capture complete: %s (%sx%s, %s bytes)", job.get("id"), width, height, len(image))
            write_diagnostics(
                "capture_complete",
                last_job_id=str(job.get("id") or ""),
                last_capture_width=width,
                last_capture_height=height,
                last_upload_bytes=len(image),
                last_success_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                last_error="",
            )
        except Exception as error:
            self.logger.exception("Capture failed: %s", error)
            self.fail(job, error)

    def run(self) -> None:
        directory = Path(str(self.config.get("screenshot_directory") or "")).expanduser()
        self.logger.info(
            "Agent started: version=%s channel=%s agent=%s id=%s enabled=%s hotkey=%s folder=%s folder_exists=%s token_present=%s",
            AGENT_VERSION,
            self.config.get("channel_id"),
            self.config.get("agent_name"),
            self.config.get("agent_id"),
            self.config.get("enabled"),
            self.config.get("hotkey"),
            directory,
            directory.is_dir(),
            bool(str(self.config.get("agent_token") or "").strip()),
        )
        write_diagnostics(
            "agent_started",
            channel_id=str(self.config.get("channel_id") or ""),
            agent_id=str(self.config.get("agent_id") or ""),
            agent_name=str(self.config.get("agent_name") or ""),
            enabled=bool(self.config.get("enabled", True)),
            hotkey=str(self.config.get("hotkey") or ""),
            screenshot_directory=str(directory),
            screenshot_directory_exists=directory.is_dir(),
            token_present=bool(str(self.config.get("agent_token") or "").strip()),
            last_error="",
        )
        failures = 0
        last_heartbeat = 0.0
        while not self.stop_event.is_set():
            if not self.config.get("enabled", True):
                self.stop_event.wait(3)
                continue
            try:
                job = self.lease_job()
                failures = 0
                if time.monotonic() - last_heartbeat >= 60:
                    self.logger.info("Agent heartbeat: polling ok channel=%s", self.config.get("channel_id"))
                    write_diagnostics("polling", last_poll_ok_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"), last_error="")
                    last_heartbeat = time.monotonic()
                if job:
                    self.process_job(job)
                    continue
            except Exception as error:
                failures += 1
                self.logger.warning("Agent poll failed: %s", error)
                write_diagnostics(
                    "poll_failed",
                    poll_failures=failures,
                    last_error=f"{type(error).__name__}: {error}",
                )
            interval = max(0.5, min(10.0, float(self.config.get("poll_interval_sec") or 1.0)))
            if failures:
                interval = min(30.0, interval * (2 ** min(failures, 5)))
            self.stop_event.wait(interval)


def diagnostic_report(config: dict[str, Any], logger: logging.Logger) -> str:
    directory = Path(str(config.get("screenshot_directory") or "")).expanduser()
    lines = [
        f"버전: {AGENT_VERSION}",
        f"에이전트: {config.get('agent_name') or '-'}",
        f"채널: {config.get('channel_id') or '-'}",
        f"단축키: {config.get('hotkey') or '-'}",
        f"저장 폴더: {directory}",
        f"폴더 확인: {'정상' if directory.is_dir() else '찾을 수 없음'}",
        f"인증값: {'입력됨' if str(config.get('agent_token') or '').strip() else '없음'}",
    ]
    errors: list[str] = []
    try:
        parse_hotkey(str(config.get("hotkey") or ""))
        lines.append("단축키 형식: 정상")
    except Exception as error:
        errors.append(f"단축키: {error}")
    if directory.is_dir():
        try:
            files = image_files(directory)
            lines.append(f"현재 이미지 파일: {len(files)}개")
            if files:
                latest = max(files, key=lambda path: files[path][0])
                lines.append(f"최근 이미지: {latest.name}")
        except Exception as error:
            errors.append(f"폴더 읽기: {error}")
    else:
        errors.append("PRISM 저장 폴더를 찾을 수 없습니다.")
    try:
        lines.append(CaptureAgent(config, logger).connection_test())
    except Exception as error:
        errors.append(f"서버 연결: {error}")
    if errors:
        lines.extend(["", "확인할 문제:", *[f"- {error}" for error in errors]])
    else:
        lines.extend(["", "기본 진단 정상 · 다음으로 캡처 테스트를 실행하세요."])
    report = "\n".join(lines)
    logger.info("Diagnostics completed: ok=%s\n%s", not errors, report)
    write_diagnostics(
        "diagnostics_failed" if errors else "diagnostics_ok",
        diagnostic_ok=not errors,
        diagnostic_report=report,
        last_error="; ".join(errors),
    )
    return report


def configure() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    config = load_config()
    configured_directory = _existing_directory(config.get("screenshot_directory"))
    if not configured_directory or config.get("screenshot_directory") == DEFAULT_CONFIG["screenshot_directory"]:
        config["screenshot_directory"] = str(detect_prism_screenshot_directory(config.get("screenshot_directory")))
    root = tk.Tk()
    root.title("CREO 캡처 에이전트 설정")
    root.geometry("640x740")
    root.minsize(570, 620)
    frame = ttk.Frame(root, padding=20)
    frame.pack(fill="both", expand=True)
    variables: dict[str, tk.Variable] = {
        "enabled": tk.BooleanVar(value=bool(config.get("enabled", True))),
        "service_url": tk.StringVar(value=config.get("service_url", "")),
        "channel_id": tk.StringVar(value=config.get("channel_id", "auto")),
        "agent_id": tk.StringVar(value=config.get("agent_id", "")),
        "agent_token": tk.StringVar(value=config.get("agent_token", "")),
        "agent_name": tk.StringVar(value=config.get("agent_name", socket.gethostname())),
        "screenshot_directory": tk.StringVar(value=config.get("screenshot_directory", "")),
        "hotkey": tk.StringVar(value=config.get("hotkey", "f3")),
        "capture_delay_ms": tk.StringVar(value=str(config.get("capture_delay_ms", 250))),
        "screenshot_timeout_sec": tk.StringVar(value=str(config.get("screenshot_timeout_sec", 12))),
        "poll_interval_sec": tk.StringVar(value=str(config.get("poll_interval_sec", 1.0))),
        "max_width": tk.StringVar(value=str(config.get("max_width", 1280))),
        "webp_quality": tk.StringVar(value=str(config.get("webp_quality", 82))),
        "crop_percent": tk.StringVar(value=",".join(str(value) for value in config.get("crop_percent", [0, 0, 100, 100]))),
    }
    ttk.Checkbutton(frame, text="자동 캡처 사용", variable=variables["enabled"]).pack(anchor="w", pady=(0, 12))

    def row(label: str, key: str, secret: bool = False, browse: bool = False) -> None:
        ttk.Label(frame, text=label).pack(anchor="w", pady=(7, 3))
        line = ttk.Frame(frame)
        line.pack(fill="x")
        entry = ttk.Entry(line, textvariable=variables[key], show="*" if secret else "")
        entry.pack(side="left", fill="x", expand=True)
        if browse:
            def browse_directory() -> None:
                initial = _existing_directory(variables[key].get()) or Path.home()
                selected = filedialog.askdirectory(initialdir=str(initial), title="PRISM 스크린샷 저장 폴더 선택")
                if selected:
                    variables[key].set(selected)

            def auto_detect_directory() -> None:
                variables[key].set(str(detect_prism_screenshot_directory(variables[key].get())))

            def open_directory() -> None:
                selected = _existing_directory(variables[key].get())
                if selected:
                    os.startfile(selected)
                else:
                    messagebox.showerror("폴더 오류", "현재 입력된 저장 폴더를 찾을 수 없습니다.")

            ttk.Button(line, text="자동 찾기", command=auto_detect_directory).pack(side="left", padx=(6, 0))
            ttk.Button(line, text="선택", command=browse_directory).pack(side="left", padx=(4, 0))
            ttk.Button(line, text="열기", command=open_directory).pack(side="left", padx=(4, 0))

    row("CREO 서버 주소", "service_url")
    row("경매 채널 (auto = 현재 활성 경매)", "channel_id")
    row("캡처 토큰 또는 관리자 비밀번호", "agent_token", secret=True)
    row("본체 이름", "agent_name")
    row("PRISM 녹화·스크린샷 저장 폴더", "screenshot_directory", browse=True)
    ttk.Label(
        frame,
        text="PRISM이 실제 스크린샷을 저장하는 폴더입니다. 날짜별 하위 폴더도 자동 감지합니다.",
        foreground="#64748b",
    ).pack(anchor="w", pady=(3, 2))
    row("PRISM 출력 스크린샷 단축키 (F3)", "hotkey")
    ttk.Label(
        frame,
        text="PRISM에서 F3을 반드시 '출력 스크린샷'에 지정하세요. 녹화 시작/종료에 지정하면 이미지가 생성되지 않습니다.",
        foreground="#b45309",
    ).pack(anchor="w", pady=(3, 2))
    row("캡처 지연(ms)", "capture_delay_ms")
    row("파일 생성 대기(초)", "screenshot_timeout_sec")
    row("서버 확인 간격(초)", "poll_interval_sec")
    row("사진 최대 가로폭", "max_width")
    row("WebP 품질(55~92)", "webp_quality")
    row("크롭 영역 X,Y,가로,세로(%)", "crop_percent")
    ttk.Label(frame, text="예: 전체 화면 0,0,100,100 · 가운데 영역 20,10,60,80", foreground="#64748b").pack(anchor="w", pady=(3, 10))
    status = ttk.Label(frame, text="")
    status.pack(anchor="w", pady=8)

    def values() -> dict[str, Any]:
        crop = [float(value.strip()) for value in str(variables["crop_percent"].get()).split(",")]
        if len(crop) != 4:
            raise ValueError("크롭 영역은 숫자 4개로 입력해주세요.")
        return {
            "config_version": 2,
            "enabled": bool(variables["enabled"].get()),
            "service_url": str(variables["service_url"].get()).strip().rstrip("/"),
            "channel_id": str(variables["channel_id"].get()).strip(),
            "agent_id": str(variables["agent_id"].get()).strip(),
            "agent_token": str(variables["agent_token"].get()).strip(),
            "agent_name": str(variables["agent_name"].get()).strip() or socket.gethostname(),
            "screenshot_directory": str(variables["screenshot_directory"].get()).strip(),
            "hotkey": str(variables["hotkey"].get()).strip(),
            "capture_delay_ms": int(variables["capture_delay_ms"].get()),
            "screenshot_timeout_sec": float(variables["screenshot_timeout_sec"].get()),
            "poll_interval_sec": float(variables["poll_interval_sec"].get()),
            "max_width": int(variables["max_width"].get()),
            "webp_quality": int(variables["webp_quality"].get()),
            "crop_percent": crop,
        }

    def save(show_message: bool = True) -> dict[str, Any] | None:
        try:
            next_config = values()
            parse_hotkey(next_config["hotkey"])
            if not Path(next_config["screenshot_directory"]).is_dir():
                raise ValueError("PRISM 저장 폴더를 확인해주세요.")
            save_config(next_config)
            if show_message:
                messagebox.showinfo("CREO", "설정을 저장했습니다.")
            return next_config
        except Exception as error:
            messagebox.showerror("설정 오류", str(error))
            return None

    def test_connection() -> None:
        next_config = save(False)
        if not next_config:
            return
        status.configure(text="서버 연결 확인 중...")
        root.update_idletasks()
        try:
            message = CaptureAgent(next_config, setup_logging()).connection_test()
            status.configure(text=message, foreground="#16803c")
        except Exception as error:
            status.configure(text=f"연결 실패: {error}", foreground="#c2410c")

    def activate_this_pc() -> None:
        next_config = save(False)
        if not next_config:
            return
        status.configure(text="활성 캡처 본체로 전환 중...")
        root.update_idletasks()
        try:
            message = CaptureAgent(next_config, setup_logging()).activate()
            status.configure(text=message, foreground="#16803c")
            messagebox.showinfo("CREO", message)
        except Exception as error:
            status.configure(text=f"본체 전환 실패: {error}", foreground="#c2410c")

    def test_capture() -> None:
        next_config = save(False)
        if not next_config:
            return
        status.configure(text="PRISM 캡처 테스트 중...")
        root.update_idletasks()
        try:
            agent = CaptureAgent(next_config, setup_logging())
            screenshot = agent.capture_file()
            image, width, height = compress_capture(screenshot, next_config)
            preview = APP_DIR / "capture-test.webp"
            preview.write_bytes(image)
            status.configure(text=f"캡처 성공 · {width}×{height} · {len(image) // 1024}KB", foreground="#16803c")
            write_diagnostics(
                "capture_test_ok",
                screenshot_path=str(screenshot),
                preview_path=str(preview),
                last_capture_width=width,
                last_capture_height=height,
                last_upload_bytes=len(image),
                last_error="",
            )
            os.startfile(preview)
        except Exception as error:
            setup_logging().exception("Capture test failed: %s", error)
            write_diagnostics("capture_test_failed", last_error=f"{type(error).__name__}: {error}")
            status.configure(text=f"캡처 실패: {error}", foreground="#c2410c")

    def run_diagnostics() -> None:
        next_config = save(False)
        if not next_config:
            return
        status.configure(text="진단 실행 중...")
        root.update_idletasks()
        report = diagnostic_report(next_config, setup_logging())
        ok = "확인할 문제:" not in report
        status.configure(text="진단 정상" if ok else "진단에서 문제 발견", foreground="#16803c" if ok else "#c2410c")
        messagebox.showinfo("CREO 캡처 진단", report)

    def open_logs() -> None:
        APP_DIR.mkdir(parents=True, exist_ok=True)
        LOG_PATH.touch(exist_ok=True)
        os.startfile(APP_DIR)

    actions = ttk.Frame(frame)
    actions.pack(fill="x", pady=(12, 0))
    test_actions = ttk.Frame(actions)
    test_actions.pack(fill="x")
    ttk.Button(test_actions, text="연결 테스트", command=test_connection).pack(side="left")
    ttk.Button(test_actions, text="캡처 테스트", command=test_capture).pack(side="left", padx=6)
    ttk.Button(test_actions, text="진단", command=run_diagnostics).pack(side="left")
    ttk.Button(test_actions, text="로그 폴더", command=open_logs).pack(side="left", padx=6)
    save_actions = ttk.Frame(actions)
    save_actions.pack(fill="x", pady=(8, 0))
    ttk.Button(save_actions, text="이 PC를 활성 본체로", command=activate_this_pc).pack(side="left")
    ttk.Button(save_actions, text="저장", command=lambda: save(True)).pack(side="right")
    root.mainloop()


def single_instance() -> socket.socket:
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", 47821))
    except OSError as error:
        raise RuntimeError("CREO 캡처 에이전트가 이미 실행 중입니다.") from error
    lock.listen(1)
    return lock


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--configure", action="store_true")
    parser.add_argument("--test-connection", action="store_true")
    parser.add_argument("--test-capture", action="store_true")
    parser.add_argument("--diagnose", action="store_true")
    args = parser.parse_args()
    if args.configure:
        configure()
        return 0
    config = load_config()
    agent = CaptureAgent(config, setup_logging())
    if args.diagnose:
        report = diagnostic_report(config, setup_logging())
        print(report)
        if os.name == "nt":
            ctypes.windll.user32.MessageBoxW(0, report, "CREO 캡처 진단", 0x40)
        return 0
    if args.test_connection:
        print(agent.connection_test())
        return 0
    if args.test_capture:
        path = agent.capture_file()
        image, width, height = compress_capture(path, config)
        preview = APP_DIR / "capture-test.webp"
        preview.write_bytes(image)
        print(f"{preview} {width}x{height} {len(image)} bytes")
        return 0
    lock = single_instance()
    try:
        agent.run()
    finally:
        lock.close()
    return 0


def entrypoint() -> int:
    try:
        return main()
    except Exception as error:
        logger = setup_logging()
        logger.exception("Agent fatal error: %s", error)
        write_diagnostics("fatal_error", last_error=f"{type(error).__name__}: {error}")
        if os.name == "nt":
            try:
                ctypes.windll.user32.MessageBoxW(
                    0,
                    f"CREO 캡처 에이전트 오류\n\n{error}\n\n로그: {LOG_PATH}",
                    "CREO 캡처 에이전트",
                    0x10,
                )
            except Exception:
                pass
        return 1


if __name__ == "__main__":
    raise SystemExit(entrypoint())
