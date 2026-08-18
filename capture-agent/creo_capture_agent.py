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
DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": True,
    "service_url": "https://creok.onrender.com",
    "channel_id": "auto",
    "agent_id": "",
    "agent_token": "",
    "agent_name": socket.gethostname(),
    "screenshot_directory": str(Path.home() / "Videos"),
    "hotkey": "ctrl+shift+f12",
    "capture_delay_ms": 250,
    "screenshot_timeout_sec": 12,
    "poll_interval_sec": 1.0,
    "max_width": 1280,
    "webp_quality": 82,
    "crop_percent": [0.0, 0.0, 100.0, 100.0],
}

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
    try:
        stored = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(stored, dict):
            config.update(stored)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
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


def setup_logging() -> logging.Logger:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("creo-capture-agent")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOG_PATH, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    if sys.stdout and not sys.stdout.closed:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(console)
    return logger


def auth_headers(config: dict[str, Any]) -> dict[str, str]:
    token = str(config.get("agent_token") or "").strip()
    headers = {"Content-Type": "application/json", "User-Agent": "CREO-Capture-Agent/1.0"}
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
        for candidate in directory.glob(pattern):
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
        response = self.session.request(method, api_url(self.config, path), headers=headers, timeout=20, **kwargs)
        if response.status_code >= 400:
            try:
                message = response.json().get("error")
            except Exception:
                message = response.text[:200]
            raise RuntimeError(message or f"서버 요청 실패 ({response.status_code})")
        return response

    def connection_test(self) -> str:
        response = self.request("GET", "/api/capture/agent-check")
        payload = response.json()
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
        delay = max(0, int(self.config.get("capture_delay_ms") or 0)) / 1000
        if delay:
            time.sleep(delay)
        send_hotkey(str(self.config.get("hotkey") or "ctrl+shift+f12"))
        return wait_for_screenshot(directory, before, float(self.config.get("screenshot_timeout_sec") or 12))

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

    def fail(self, job: dict[str, Any], error: Exception) -> None:
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
        try:
            screenshot = self.capture_file()
            image, width, height = compress_capture(screenshot, self.config)
            self.upload(job, image, width, height)
            self.logger.info("Capture complete: %s (%sx%s, %s bytes)", job.get("id"), width, height, len(image))
        except Exception as error:
            self.logger.exception("Capture failed: %s", error)
            self.fail(job, error)

    def run(self) -> None:
        self.logger.info("Agent started: channel=%s agent=%s", self.config.get("channel_id"), self.config.get("agent_name"))
        failures = 0
        while not self.stop_event.is_set():
            if not self.config.get("enabled", True):
                self.stop_event.wait(3)
                continue
            try:
                job = self.lease_job()
                failures = 0
                if job:
                    self.process_job(job)
                    continue
            except Exception as error:
                failures += 1
                self.logger.warning("Agent poll failed: %s", error)
            interval = max(0.5, min(10.0, float(self.config.get("poll_interval_sec") or 1.0)))
            if failures:
                interval = min(30.0, interval * (2 ** min(failures, 5)))
            self.stop_event.wait(interval)


def configure() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    config = load_config()
    root = tk.Tk()
    root.title("CREO 캡처 에이전트 설정")
    root.geometry("610x690")
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
        "hotkey": tk.StringVar(value=config.get("hotkey", "ctrl+shift+f12")),
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
            ttk.Button(line, text="찾기", command=lambda: variables[key].set(filedialog.askdirectory(initialdir=variables[key].get()) or variables[key].get())).pack(side="left", padx=(6, 0))

    row("CREO 서버 주소", "service_url")
    row("경매 채널 (auto = 현재 활성 경매)", "channel_id")
    row("캡처 토큰 또는 관리자 비밀번호", "agent_token", secret=True)
    row("본체 이름", "agent_name")
    row("PRISM 녹화·스크린샷 저장 폴더", "screenshot_directory", browse=True)
    row("PRISM 출력 스크린샷 단축키", "hotkey")
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
            os.startfile(preview)
        except Exception as error:
            status.configure(text=f"캡처 실패: {error}", foreground="#c2410c")

    actions = ttk.Frame(frame)
    actions.pack(fill="x", pady=(12, 0))
    ttk.Button(actions, text="연결 테스트", command=test_connection).pack(side="left")
    ttk.Button(actions, text="캡처 테스트", command=test_capture).pack(side="left", padx=6)
    ttk.Button(actions, text="이 PC를 활성 본체로", command=activate_this_pc).pack(side="left")
    ttk.Button(actions, text="저장", command=lambda: save(True)).pack(side="right")
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
    args = parser.parse_args()
    if args.configure:
        configure()
        return 0
    config = load_config()
    agent = CaptureAgent(config, setup_logging())
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


if __name__ == "__main__":
    raise SystemExit(main())
