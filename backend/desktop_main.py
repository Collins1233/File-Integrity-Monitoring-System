"""
Desktop entry point for the packaged Windows .exe.

Starts the FastAPI server (UI + API), opens the dashboard, and keeps a
system-tray icon so users can reopen or quit without a console window.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
import traceback
import webbrowser

# Ensure backend modules resolve when frozen or run from repo root.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# In PyInstaller windowed mode (console=False), sys.stdout, sys.stderr, and sys.stdin are None.
# This causes uvicorn's formatter (sys.stdout.isatty()) to crash with:
#   AttributeError: 'NoneType' object has no attribute 'isatty'
class SafeStream:
    def write(self, s):
        pass
    def flush(self):
        pass
    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = SafeStream()
if sys.stderr is None:
    sys.stderr = SafeStream()
if sys.stdin is None:
    sys.stdin = SafeStream()

HOST = "127.0.0.1"
PORT = 8000
DASHBOARD_URL = f"http://{HOST}:{PORT}"


def _show_error_dialog(message: str) -> None:
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            f"FIMS encountered an error starting up:\n\n{message[:600]}",
            "FIMS Startup Error",
            0x10,
        )
    except Exception:
        pass


def _write_crash_log(message: str) -> None:
    try:
        from config import PROJECT_ROOT

        path = os.path.join(PROJECT_ROOT, "fim_startup_error.txt")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(message)
    except Exception:
        pass
    _show_error_dialog(message)


def _resource_candidates(*relative_parts: str) -> list[str]:
    from config import RESOURCE_ROOT, PROJECT_ROOT

    roots = [RESOURCE_ROOT, PROJECT_ROOT, os.path.dirname(BACKEND_DIR)]
    if getattr(sys, "frozen", False):
        roots.insert(0, getattr(sys, "_MEIPASS", ""))
        roots.insert(0, os.path.dirname(sys.executable))
    paths = []
    for root in roots:
        if not root:
            continue
        paths.append(os.path.join(root, *relative_parts))
    return paths


def _load_tray_image():
    from PIL import Image

    for path in _resource_candidates("frontend", "public", "fim-logo.png"):
        if os.path.isfile(path):
            return Image.open(path).convert("RGBA")
    # Tiny fallback icon if the logo is missing from the bundle.
    return Image.new("RGBA", (64, 64), (37, 99, 235, 255))


def _server_is_up() -> bool:
    import urllib.request

    try:
        with urllib.request.urlopen(f"{DASHBOARD_URL}/api/status", timeout=1.5) as response:
            return response.status == 200
    except Exception:
        return False


def _launch_browser(url: str = DASHBOARD_URL) -> None:
    try:
        os.startfile(url)
    except Exception:
        webbrowser.open(url)


def _wait_then_open_browser() -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        if _server_is_up():
            _launch_browser(DASHBOARD_URL)
            return
        time.sleep(0.3)
    _launch_browser(DASHBOARD_URL)


def _open_dashboard(icon=None, item=None) -> None:
    if _server_is_up():
        _launch_browser(DASHBOARD_URL)
    else:
        threading.Thread(target=_wait_then_open_browser, daemon=True).start()


def _quit_app(icon=None, item=None) -> None:
    try:
        if icon is not None:
            icon.stop()
    finally:
        # Hard-exit so the background uvicorn thread cannot keep the process alive.
        os._exit(0)


def _run_tray(logger: logging.Logger) -> None:
    try:
        import pystray
        from pystray import MenuItem as Item
    except Exception as error:
        logger.warning("System tray unavailable (%s). Running without tray.", error)
        while True:
            time.sleep(3600)

    try:
        image = _load_tray_image()
        menu = pystray.Menu(
            Item("Open FIMS Dashboard", _open_dashboard, default=True),
            Item("Quit FIMS", _quit_app),
        )
        icon = pystray.Icon("FIMS", image, "File Integrity Monitoring System", menu)
        logger.info("System tray ready. Right-click the FIMS icon to open or quit.")
        icon.run()
    except Exception as error:
        logger.warning("System tray failed to run (%s). Keeping server alive.", error)
        while True:
            time.sleep(3600)


def _run_server(app, logger: logging.Logger) -> None:
    import uvicorn

    try:
        config = uvicorn.Config(
            app,
            host=HOST,
            port=PORT,
            log_level="info",
            use_colors=False,
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception:
        _write_crash_log(traceback.format_exc())
        logger.exception("Server crashed")
        os._exit(1)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("FIM_Desktop")

    try:
        from config import APP_VERSION
        print("=" * 64)
        print(f"   FILE INTEGRITY MONITORING SYSTEM (FIMS) v{APP_VERSION}")
        print("=" * 64)
        print(f"[*] Local Dashboard: {DASHBOARD_URL}")
        print("[*] Opening your browser...")
        print("[*] Keep this window open while using FIMS.")
        print("[*] Press Ctrl+C or close this window to stop the server.")
        print("=" * 64)
    except Exception:
        pass

    try:
        from server import app
    except Exception:
        _write_crash_log(traceback.format_exc())
        raise

    logger.info("Starting File Integrity Monitoring System at %s", DASHBOARD_URL)
    threading.Thread(target=_run_server, args=(app, logger), daemon=True).start()
    threading.Thread(target=_wait_then_open_browser, daemon=True).start()
    _run_tray(logger)


if __name__ == "__main__":
    main()
