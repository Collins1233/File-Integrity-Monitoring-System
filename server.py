import os
import csv
import io
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

from scanner import scan_folder_with_options
from baseline_store import (
    add_monitor,
    get_active_monitor,
    get_monitors,
    set_active_monitor,
    remove_monitor,
    accept_monitor_changes,
    restore_file,
    legacy_load_baseline as load_baseline,
)
from integrity import run_integrity_check
from monitor import monitor_service
from report import list_reports, delete_report_file, prune_old_reports
from settings_manager import load_settings, save_settings
from scan_progress import scan_progress
from config import APP_VERSION, MAX_REPORTS_RETAINED

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FIM_Server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    monitor_service.reload_settings()
    monitor_service.start()
    yield
    await monitor_service.stop()


app = FastAPI(title="File Integrity Monitor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FolderRequest(BaseModel):
    folder_path: str

class MonitoringToggleRequest(BaseModel):
    enabled: bool

class AcknowledgeAlertsRequest(BaseModel):
    alert_ids: Optional[list[int]] = None

class SettingsUpdateRequest(BaseModel):
    monitoring_interval_seconds: Optional[int] = None
    monitoring_enabled: Optional[bool] = None
    excluded_extensions: Optional[list[str]] = None
    hash_only_enabled: Optional[bool] = None
    hash_only_size_bytes: Optional[int] = None

class ActiveMonitorRequest(BaseModel):
    monitor_id: str

class RestoreFileRequest(BaseModel):
    path: str
    monitor_id: Optional[str] = None

class AcceptBaselineRequest(BaseModel):
    monitor_id: Optional[str] = None


def _status_payload():
    monitors = get_monitors()
    active = get_active_monitor()
    return {
        "app_version": APP_VERSION,
        "has_baseline": len(monitors) > 0,
        "folder_path": active["folder_path"] if active else "",
        "created_at": active["created_at"] if active else "",
        "file_count": len(active["files"]) if active else 0,
        "monitor_count": len(monitors),
        "active_monitor_id": active["id"] if active else None,
        "monitors": [
            {
                "id": monitor["id"],
                "folder_path": monitor["folder_path"],
                "created_at": monitor["created_at"],
                "file_count": len(monitor["files"]),
            }
            for monitor in monitors
        ],
    }


def create_baseline_for_folder(folder_path: str) -> dict:
    monitor = add_monitor(folder_path, set_active=True)
    return {
        "success": True,
        "baseline_created": True,
        "monitor_id": monitor["id"],
        "folder_path": monitor["folder_path"],
        "created_at": monitor["created_at"],
        "file_count": len(monitor["files"]),
    }


@app.get("/api/status")
def get_status():
    return _status_payload()


@app.get("/api/settings")
def api_get_settings():
    settings = load_settings()
    return {"app_version": APP_VERSION, **settings}


@app.put("/api/settings")
def api_update_settings(request: SettingsUpdateRequest):
    payload = {key: value for key, value in request.model_dump().items() if value is not None}
    settings = save_settings(payload)
    monitor_service.reload_settings()
    return {"success": True, "settings": settings, "app_version": APP_VERSION}


@app.get("/api/scan/progress")
def api_scan_progress():
    return scan_progress.as_dict()


@app.get("/api/monitors")
def api_list_monitors():
    return {"monitors": _status_payload()["monitors"], "active_monitor_id": _status_payload()["active_monitor_id"]}


@app.post("/api/monitors/active")
def api_set_active_monitor(request: ActiveMonitorRequest):
    monitor = set_active_monitor(request.monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found.")
    return {"success": True, "active_monitor_id": monitor["id"], "folder_path": monitor["folder_path"]}


@app.delete("/api/monitors/{monitor_id}")
def api_remove_monitor(monitor_id: str):
    if not remove_monitor(monitor_id):
        raise HTTPException(status_code=404, detail="Monitor not found.")
    return {"success": True, **_status_payload()}


@app.post("/api/baseline/accept")
def api_accept_baseline(request: AcceptBaselineRequest):
    result = accept_monitor_changes(request.monitor_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Could not update baseline."))
    return result


@app.post("/api/files/restore")
def api_restore_file(request: RestoreFileRequest):
    result = restore_file(request.path, request.monitor_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Restore failed."))
    return result


@app.post("/api/select-folder")
def select_folder():
    import subprocess
    import platform

    os_name = platform.system()

    try:
        if os_name == "Darwin":
            apple_script = (
                'tell application "System Events"\n'
                '    activate\n'
                'end tell\n'
                'set chosen to choose folder with prompt "Select the folder to monitor:"\n'
                'POSIX path of chosen'
            )
            result = subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True, timeout=120)
            folder_path = result.stdout.strip()
        elif os_name == "Windows":
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms; '
                '$d = New-Object System.Windows.Forms.FolderBrowserDialog; '
                '$d.Description = "Select Directory to Monitor"; '
                'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }'
            )
            result = subprocess.run(["powershell", "-NonInteractive", "-Command", ps_script], capture_output=True, text=True, timeout=120)
            folder_path = result.stdout.strip()
        else:
            try:
                result = subprocess.run(["zenity", "--file-selection", "--directory", "--title=Select Directory to Monitor"], capture_output=True, text=True, timeout=120)
                folder_path = result.stdout.strip()
            except FileNotFoundError:
                result = subprocess.run(["kdialog", "--getexistingdirectory", "/", "--title", "Select Directory to Monitor"], capture_output=True, text=True, timeout=120)
                folder_path = result.stdout.strip()

        if folder_path:
            return create_baseline_for_folder(folder_path)
        return {"folder_path": "", "info": "Folder selection was cancelled."}
    except subprocess.TimeoutExpired:
        return {"folder_path": "", "info": "Folder dialog timed out. Please try again."}
    except Exception as error:
        logger.error("Folder picker failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/create-baseline")
def api_create_baseline(request: FolderRequest):
    folder_path = request.folder_path
    if not folder_path or not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail="Invalid folder path provided.")
    return create_baseline_for_folder(folder_path)


@app.post("/api/check-integrity")
def api_check_integrity():
    result = run_integrity_check(generate_report=True)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Check failed."))
    return result


@app.post("/api/monitoring/check-now")
async def api_check_now():
    if not get_monitors():
        raise HTTPException(status_code=400, detail="No baseline found. Select a folder first.")
    result = await monitor_service.run_check(generate_report=True)
    if result is None:
        raise HTTPException(status_code=409, detail="A check is already running. Please wait.")
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Check failed."))
    return result


@app.get("/api/files")
def api_get_files(monitor_id: Optional[str] = None):
    monitor = get_active_monitor() if not monitor_id else next((m for m in get_monitors() if m["id"] == monitor_id), None)
    if not monitor:
        return {"folder_path": "", "monitor_id": None, "files": []}

    folder_path = monitor["folder_path"]
    files = []
    for path, info in monitor.get("files", {}).items():
        try:
            relative_path = os.path.relpath(path, folder_path)
        except ValueError:
            relative_path = path
        files.append({
            "name": os.path.basename(path),
            "path": path,
            "relative_path": relative_path,
            "size": info.get("size", 0),
            "extension": info.get("extension", ""),
            "file_type": info.get("file_type", "Unknown"),
            "last_modified": info.get("last_modified", ""),
            "is_text_file": info.get("is_text_file", False),
            "hash_only": info.get("hash_only", False),
            "has_backup": bool(info.get("baseline_copy")),
        })
    files.sort(key=lambda item: item["relative_path"].lower())
    return {"folder_path": folder_path, "monitor_id": monitor["id"], "files": files}


@app.get("/api/files/preview")
def api_preview_file(path: str, monitor_id: Optional[str] = None):
    monitor = get_active_monitor() if not monitor_id else next((m for m in get_monitors() if m["id"] == monitor_id), None)
    if not monitor:
        raise HTTPException(status_code=404, detail="No baseline found.")
    info = monitor.get("files", {}).get(path)
    if not info:
        raise HTTPException(status_code=404, detail="File not found in monitored baseline.")

    preview = None
    previewable = False
    if info.get("is_text_file") and info.get("content_snapshot") is not None:
        preview = "".join(info["content_snapshot"])
        previewable = True

    return {
        "path": path,
        "name": os.path.basename(path),
        "preview": preview,
        "previewable": previewable,
        "file_type": info.get("file_type", "Unknown"),
        "size": info.get("size", 0),
        "last_modified": info.get("last_modified", ""),
        "hash_only": info.get("hash_only", False),
        "has_backup": bool(info.get("baseline_copy")),
    }


@app.get("/api/monitoring/status")
def api_monitoring_status():
    return monitor_service.get_status()


@app.get("/api/monitoring/alerts")
def api_monitoring_alerts():
    return {"alerts": monitor_service.get_alerts()}


@app.post("/api/monitoring/alerts/acknowledge")
def api_acknowledge_alerts(request: AcknowledgeAlertsRequest):
    cleared = monitor_service.acknowledge_alerts(request.alert_ids)
    return {"cleared": cleared}


@app.post("/api/monitoring/toggle")
def api_monitoring_toggle(request: MonitoringToggleRequest):
    monitor_service.set_enabled(request.enabled)
    return monitor_service.get_status()


@app.get("/api/reports")
def api_get_reports():
    prune_old_reports()
    return [{"filename": r["filename"], "created_at": r["created_at"], "size_bytes": r["size_bytes"]} for r in list_reports()]


@app.get("/api/reports/{filename}/preview")
def api_preview_report(filename: str):
    file_path = os.path.join("reports", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found.")
    return FileResponse(file_path, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@app.get("/api/reports/{filename}")
def api_download_report(filename: str):
    file_path = os.path.join("reports", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found.")
    return FileResponse(file_path, media_type="application/pdf", filename=filename)


@app.delete("/api/reports/{filename}")
def api_delete_report(filename: str):
    try:
        deleted = delete_report_file(filename)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not deleted:
        raise HTTPException(status_code=404, detail="Report file not found.")
    return {"success": True, "deleted": filename, "remaining": len(list_reports()), "max_retained": MAX_REPORTS_RETAINED}


def _parse_logs():
    log_file = "fim_log.txt"
    if not os.path.exists(log_file):
        return []
    with open(log_file, "r", encoding="utf-8") as file:
        lines = file.readlines()
    parsed = []
    for line in lines:
        parts = line.strip().split(" - ", 1)
        if len(parts) == 2:
            parsed.append({"timestamp": parts[0], "message": parts[1]})
        else:
            parsed.append({"timestamp": "", "message": line.strip()})
    return parsed[-500:]


@app.get("/api/logs")
def api_get_logs():
    return {"logs": _parse_logs()[-200:]}


@app.get("/api/logs/export")
def api_export_logs(format: str = Query("json", pattern="^(json|csv)$")):
    logs = _parse_logs()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if format == "csv":
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=["timestamp", "message"])
        writer.writeheader()
        writer.writerows(logs)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="fim_audit_{timestamp}.csv"'},
        )

    payload = json.dumps({"exported_at": timestamp, "logs": logs}, indent=2)
    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="fim_audit_{timestamp}.json"'},
    )


frontend_dist = os.path.abspath("frontend/dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:
    logger.warning("Frontend build directory ('frontend/dist') not found. Serving API only.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
