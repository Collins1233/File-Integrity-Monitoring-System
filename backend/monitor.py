import asyncio
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Optional

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from config import (
    ENABLE_REALTIME_MONITORING,
    MONITORING_INTERVAL_SECONDS,
    ENABLE_REALTIME_KERNEL_EVENTS,
    EVENT_DEBOUNCE_DELAY_SECONDS,
    MAX_EVENT_DEBOUNCE_CEILING_SECONDS,
)
from baseline_store import get_monitors
from integrity import run_integrity_check
from settings_manager import load_settings

logger = logging.getLogger("FIM_Monitor")

# Ignore internal backup, VCS, and transient temporary files
IGNORED_DIR_NAMES = {".fim_backups", ".git", ".vscode", "__pycache__", "node_modules", "reports"}
IGNORED_FILE_PREFIXES = ("~$", ".tmp", ".swp", ".lock")


class FIMFileSystemEventHandler(FileSystemEventHandler):
    """Subclasses watchdog FileSystemEventHandler to filter events before debouncing."""

    def __init__(self, callback):
        super().__init__()
        self.callback = callback

    def _should_ignore(self, src_path: str) -> bool:
        norm_path = os.path.normpath(src_path)
        parts = norm_path.split(os.sep)

        # Ignore internal directory paths
        if any(part in IGNORED_DIR_NAMES for part in parts):
            return True

        filename = os.path.basename(norm_path)
        # Ignore temporary lock files or OS temporary files
        if any(filename.startswith(prefix) for prefix in IGNORED_FILE_PREFIXES):
            return True
        if filename.endswith((".tmp", ".swp", ".DS_Store")):
            return True

        return False

    def on_any_event(self, event):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        self.callback(event.src_path)


class RealtimeObserverManager:
    """Manages watchdog Observer lifecycle and dynamic folder/file watches."""

    def __init__(self, event_callback):
        self.event_callback = event_callback
        self.observer: Optional[Observer] = None
        self.handler = FIMFileSystemEventHandler(self.event_callback)
        self.active_watches: set[str] = set()

    def start(self, monitors: list[dict]):
        if self.observer and self.observer.is_alive():
            self.stop()

        self.observer = Observer()
        self.active_watches.clear()

        for monitor in monitors:
            monitor_type = monitor.get("monitor_type", "folder")
            if monitor_type == "folder":
                folder_path = monitor.get("folder_path")
                if folder_path and os.path.isdir(folder_path):
                    try:
                        self.observer.schedule(self.handler, folder_path, recursive=True)
                        self.active_watches.add(folder_path)
                        logger.info("Watchdog kernel watch started on folder: %s", folder_path)
                    except Exception as err:
                        logger.error("Failed to schedule watchdog for %s: %s", folder_path, err)
            elif monitor_type == "files":
                watch_paths = monitor.get("watch_paths") or list(monitor.get("files", {}).keys())
                parent_dirs = {os.path.dirname(p) for p in watch_paths if os.path.isfile(p)}
                for pdir in parent_dirs:
                    if os.path.isdir(pdir):
                        try:
                            self.observer.schedule(self.handler, pdir, recursive=False)
                            self.active_watches.add(pdir)
                            logger.info("Watchdog kernel watch started on file directory: %s", pdir)
                        except Exception as err:
                            logger.error("Failed to schedule watchdog for %s: %s", pdir, err)

        try:
            self.observer.start()
            logger.info("Watchdog Observer engine running (%d active watches).", len(self.active_watches))
        except Exception as err:
            logger.error("Failed to start watchdog Observer: %s", err)

    def stop(self):
        if self.observer:
            try:
                if self.observer.is_alive():
                    self.observer.stop()
                    self.observer.join(timeout=2.0)
            except Exception as err:
                logger.error("Error stopping watchdog Observer: %s", err)
            finally:
                self.observer = None
                self.active_watches.clear()
                logger.info("Watchdog Observer stopped.")

    def sync_monitors(self, monitors: list[dict]):
        self.start(monitors)


class MonitorService:
    """Core FIMS Background Monitoring Service with hybrid Real-time OS Kernel + Polling Sweep."""

    def __init__(self):
        settings = load_settings()
        self.enabled = settings.get("monitoring_enabled", ENABLE_REALTIME_MONITORING)
        self.interval = settings.get("monitoring_interval_seconds", MONITORING_INTERVAL_SECONDS)
        self.realtime_kernel_enabled = settings.get("realtime_kernel_enabled", ENABLE_REALTIME_KERNEL_EVENTS)

        self._task: Optional[asyncio.Task] = None
        self._debounce_task: Optional[asyncio.Task] = None
        self._first_event_time: Optional[float] = None

        self.last_check_at: Optional[str] = None
        self.next_check_at: Optional[str] = None
        self.last_result: Optional[dict] = None
        self.is_checking = False
        self.events_processed_count = 0

        self._alert_id = 0
        self._pending_alerts: list[dict] = []
        self._last_alert_fingerprint: Optional[str] = None
        self._acknowledged_fingerprints: set[str] = set()

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self.observer_manager = RealtimeObserverManager(self._on_kernel_event_sync)

    def _fingerprint(self, result: dict) -> Optional[str]:
        if not result.get("success"):
            return None

        modified = tuple(sorted(result.get("modified_files", [])))
        deleted = tuple(sorted(result.get("deleted_files", [])))
        new = tuple(sorted(result.get("new_files", [])))
        if not modified and not deleted and not new:
            return "clean"

        return f"{modified}|{deleted}|{new}"

    def _maybe_create_alert(self, result: dict) -> None:
        fingerprint = self._fingerprint(result)
        if fingerprint is None or fingerprint == "clean":
            return
        if fingerprint in self._acknowledged_fingerprints:
            return
        if fingerprint == self._last_alert_fingerprint:
            return

        self._last_alert_fingerprint = fingerprint
        self._alert_id += 1

        affected_files = []
        for file_path in result.get("modified_files", []):
            affected_files.append({
                "name": os.path.basename(file_path),
                "path": file_path,
                "change": "modified",
            })
        for file_path in result.get("deleted_files", []):
            affected_files.append({
                "name": os.path.basename(file_path),
                "path": file_path,
                "change": "deleted",
            })
        for file_path in result.get("new_files", []):
            affected_files.append({
                "name": os.path.basename(file_path),
                "path": file_path,
                "change": "new",
            })

        alert = {
            "id": self._alert_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "fingerprint": fingerprint,
            "modified_count": len(result.get("modified_files", [])),
            "deleted_count": len(result.get("deleted_files", [])),
            "new_count": len(result.get("new_files", [])),
            "total_changes": (
                len(result.get("modified_files", []))
                + len(result.get("deleted_files", []))
                + len(result.get("new_files", []))
            ),
            "modified_files": result.get("modified_files", []),
            "deleted_files": result.get("deleted_files", []),
            "new_files": result.get("new_files", []),
            "affected_files": affected_files,
            "text_differences": result.get("text_differences", {}),
        }
        self._pending_alerts.append(alert)
        if len(self._pending_alerts) > 50:
            self._pending_alerts = self._pending_alerts[-50:]

    def _set_next_check(self) -> None:
        self.next_check_at = (
            datetime.now() + timedelta(seconds=self.interval)
        ).strftime("%Y-%m-%d %H:%M:%S")

    def _on_kernel_event_sync(self, src_path: str):
        """Watchdog callback executed from thread pool -> dispatches into asyncio event loop."""
        self.events_processed_count += 1
        loop = self._loop
        if not loop or not loop.is_running():
            try:
                loop = asyncio.get_running_loop()
                self._loop = loop
            except RuntimeError:
                loop = None

        if loop and loop.is_running():
            loop.call_soon_threadsafe(self.handle_kernel_event, src_path)
        else:
            logger.warning("Kernel event received for %s, but no active asyncio loop was found to dispatch check.", src_path)

    def handle_kernel_event(self, src_path: str):
        """Sliding window debouncer for real-time kernel filesystem events."""
        if not self.enabled or not self.realtime_kernel_enabled:
            return

        now = time.time()
        if self._first_event_time is None:
            self._first_event_time = now

        # Enforce maximum latency ceiling (2.5s)
        time_since_first = now - self._first_event_time
        if time_since_first >= MAX_EVENT_DEBOUNCE_CEILING_SECONDS:
            if self._debounce_task and not self._debounce_task.done():
                self._debounce_task.cancel()
            self._first_event_time = None
            asyncio.create_task(self.run_check(generate_report=False))
            return

        # Sliding window timer reset (0.75s)
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()

        async def _delayed_check():
            try:
                await asyncio.sleep(EVENT_DEBOUNCE_DELAY_SECONDS)
                self._first_event_time = None
                logger.info("Kernel event debounced -> Triggering immediate integrity check.")
                await self.run_check(generate_report=False)
            except asyncio.CancelledError:
                pass

        self._debounce_task = asyncio.create_task(_delayed_check())

    async def run_check(self, generate_report: bool = False) -> Optional[dict]:
        if self.is_checking:
            return self.last_result
        if not get_monitors():
            return None

        self.is_checking = True
        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                lambda: run_integrity_check(generate_report=generate_report),
            )
            self.last_check_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.last_result = result
            if result.get("success"):
                self._maybe_create_alert(result)
            return result
        except Exception as error:
            logger.error("Integrity check failed: %s", error)
            return None
        finally:
            self.is_checking = False
            self._set_next_check()

    async def _monitor_loop(self) -> None:
        logger.info(
            "Background monitoring started (interval: %ss / %s min, kernel realtime: %s)",
            self.interval,
            self.interval // 60,
            self.realtime_kernel_enabled,
        )
        self._set_next_check()

        # Initial baseline verification & observer sync
        monitors = get_monitors()
        if self.enabled and self.realtime_kernel_enabled and monitors:
            self.observer_manager.sync_monitors(monitors)

        while True:
            try:
                if self.enabled and get_monitors():
                    await self.run_check(generate_report=False)
                else:
                    self._set_next_check()
            except asyncio.CancelledError:
                logger.info("Background monitoring loop stopped.")
                raise
            except Exception as error:
                logger.error("Monitor loop error: %s", error)
                self._set_next_check()

            await asyncio.sleep(self.interval)

    def start(self) -> None:
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()

        self.observer_manager.stop()

        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    def get_status(self) -> dict:
        baseline = get_monitors()
        settings = load_settings()
        self.interval = settings.get("monitoring_interval_seconds", self.interval)
        self.enabled = settings.get("monitoring_enabled", self.enabled)
        self.realtime_kernel_enabled = settings.get("realtime_kernel_enabled", self.realtime_kernel_enabled)

        is_observer_active = bool(
            self.observer_manager.observer
            and self.observer_manager.observer.is_alive()
        )

        return {
            "enabled": self.enabled,
            "realtime_kernel_enabled": self.realtime_kernel_enabled,
            "active": len(baseline) > 0 and self.enabled,
            "interval_seconds": self.interval,
            "interval_minutes": self.interval // 60,
            "is_checking": self.is_checking,
            "last_check_at": self.last_check_at,
            "next_check_at": self.next_check_at,
            "has_baseline": len(baseline) > 0,
            "pending_alert_count": len(self._pending_alerts),
            "last_result": self.last_result,
            "watchdog_active": is_observer_active,
            "active_watches_count": len(self.observer_manager.active_watches),
            "events_processed_count": self.events_processed_count,
            "engine_type": "watchdog_kernel" if is_observer_active else "polling",
        }

    def get_alerts(self) -> list[dict]:
        return list(self._pending_alerts)

    def acknowledge_alerts(self, alert_ids: Optional[list[int]] = None) -> int:
        if alert_ids is None:
            alerts_to_clear = self._pending_alerts
        else:
            alert_ids_set = set(alert_ids)
            alerts_to_clear = [
                alert for alert in self._pending_alerts if alert["id"] in alert_ids_set
            ]

        for alert in alerts_to_clear:
            self._acknowledged_fingerprints.add(alert["fingerprint"])

        if alert_ids is None:
            cleared = len(self._pending_alerts)
            self._pending_alerts = []
            return cleared

        self._pending_alerts = [
            alert for alert in self._pending_alerts if alert["id"] not in set(alert_ids)
        ]
        return len(alerts_to_clear)

    def set_enabled(self, enabled: bool) -> None:
        self.enabled = enabled
        from settings_manager import save_settings
        save_settings({"monitoring_enabled": enabled})
        if not enabled:
            self.observer_manager.stop()
        else:
            monitors = get_monitors()
            if monitors and self.realtime_kernel_enabled:
                self.observer_manager.sync_monitors(monitors)

    def sync_monitors(self) -> None:
        monitors = get_monitors()
        if self.enabled and self.realtime_kernel_enabled and monitors:
            self.observer_manager.sync_monitors(monitors)
        else:
            self.observer_manager.stop()

    def reload_settings(self) -> None:
        settings = load_settings()
        self.interval = settings.get("monitoring_interval_seconds", MONITORING_INTERVAL_SECONDS)
        self.enabled = settings.get("monitoring_enabled", ENABLE_REALTIME_MONITORING)
        self.realtime_kernel_enabled = settings.get("realtime_kernel_enabled", self.realtime_kernel_enabled)
        self._set_next_check()
        self.sync_monitors()

    async def restart_loop(self) -> None:
        await self.stop()
        await asyncio.sleep(0.5)
        self.start()


monitor_service = MonitorService()
