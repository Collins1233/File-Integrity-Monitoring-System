import asyncio
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from config import ENABLE_REALTIME_MONITORING, MONITORING_INTERVAL_SECONDS
from baseline import load_baseline
from integrity import run_integrity_check

logger = logging.getLogger("FIM_Monitor")


class MonitorService:
    def __init__(self):
        self.enabled = ENABLE_REALTIME_MONITORING
        self.interval = MONITORING_INTERVAL_SECONDS
        self._task: Optional[asyncio.Task] = None
        self.last_check_at: Optional[str] = None
        self.next_check_at: Optional[str] = None
        self.last_result: Optional[dict] = None
        self.is_checking = False
        self._alert_id = 0
        self._pending_alerts: list[dict] = []
        self._last_alert_fingerprint: Optional[str] = None
        self._acknowledged_fingerprints: set[str] = set()

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
        for file_path in result["modified_files"]:
            affected_files.append({
                "name": os.path.basename(file_path),
                "path": file_path,
                "change": "modified",
            })
        for file_path in result["deleted_files"]:
            affected_files.append({
                "name": os.path.basename(file_path),
                "path": file_path,
                "change": "deleted",
            })
        for file_path in result["new_files"]:
            affected_files.append({
                "name": os.path.basename(file_path),
                "path": file_path,
                "change": "new",
            })

        alert = {
            "id": self._alert_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "fingerprint": fingerprint,
            "modified_count": len(result["modified_files"]),
            "deleted_count": len(result["deleted_files"]),
            "new_count": len(result["new_files"]),
            "total_changes": (
                len(result["modified_files"])
                + len(result["deleted_files"])
                + len(result["new_files"])
            ),
            "modified_files": result["modified_files"],
            "deleted_files": result["deleted_files"],
            "new_files": result["new_files"],
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

    async def run_check(self, generate_report: bool = False) -> Optional[dict]:
        if self.is_checking:
            return self.last_result
        if not load_baseline():
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
            logger.error("Background integrity check failed: %s", error)
            return None
        finally:
            self.is_checking = False
            self._set_next_check()

    async def _monitor_loop(self) -> None:
        logger.info(
            "Background monitoring started (interval: %ss / %s min)",
            self.interval,
            self.interval // 60,
        )
        self._set_next_check()

        while True:
            try:
                if self.enabled and load_baseline():
                    await self.run_check(generate_report=False)
                else:
                    self._set_next_check()
            except asyncio.CancelledError:
                logger.info("Background monitoring stopped.")
                raise
            except Exception as error:
                logger.error("Monitor loop error: %s", error)
                self._set_next_check()

            await asyncio.sleep(self.interval)

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    def get_status(self) -> dict:
        baseline = load_baseline()
        return {
            "enabled": self.enabled,
            "active": baseline is not None and self.enabled,
            "interval_seconds": self.interval,
            "interval_minutes": self.interval // 60,
            "is_checking": self.is_checking,
            "last_check_at": self.last_check_at,
            "next_check_at": self.next_check_at,
            "has_baseline": baseline is not None,
            "pending_alert_count": len(self._pending_alerts),
            "last_result": self.last_result,
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


monitor_service = MonitorService()
