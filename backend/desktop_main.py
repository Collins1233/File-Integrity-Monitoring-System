"""
Desktop entry point for the packaged Windows .exe.

Starts the FastAPI server (UI + API) and opens the dashboard in a browser.
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

HOST = "127.0.0.1"
PORT = 8000
DASHBOARD_URL = f"http://{HOST}:{PORT}"


def _write_crash_log(message: str) -> None:
    try:
        from config import PROJECT_ROOT

        path = os.path.join(PROJECT_ROOT, "fim_startup_error.txt")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(message)
    except Exception:
        pass


def _wait_then_open_browser() -> None:
    import urllib.request

    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{DASHBOARD_URL}/api/status", timeout=1.5) as response:
                if response.status == 200:
                    webbrowser.open(DASHBOARD_URL)
                    return
        except Exception:
            time.sleep(0.35)
    webbrowser.open(DASHBOARD_URL)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("FIM_Desktop")

    try:
        import uvicorn
        from server import app
    except Exception:
        _write_crash_log(traceback.format_exc())
        raise

    logger.info("Starting %s at %s", "File Integrity Monitoring System", DASHBOARD_URL)
    threading.Thread(target=_wait_then_open_browser, daemon=True).start()

    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="info")
    except Exception:
        _write_crash_log(traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
