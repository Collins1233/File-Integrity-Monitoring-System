import os
import csv
import io
import json
import logging
import asyncio
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
    add_files_monitor,
    get_active_monitor,
    get_monitors,
    set_active_monitor,
    remove_monitor,
    accept_monitor_changes,
    restore_file,
    legacy_load_baseline as load_baseline,
    normalize_folder_path,
)
from integrity import run_integrity_check
from monitor import monitor_service
from path_utils import resolve_folder_path, folder_exists
from report import list_reports, delete_report_file, prune_old_reports
from logger import save_log
from settings_manager import load_settings, save_settings
from scan_progress import scan_progress
from config import APP_VERSION, MAX_REPORTS_RETAINED, PROJECT_ROOT
from textdiff import read_text_file
from file_preview import extract_preview_text, resolve_content_path, guess_media_type, is_image_type

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

class FilesRequest(BaseModel):
    file_paths: list[str]

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
    max_reports_retained: Optional[int] = None

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
                "monitor_type": monitor.get("monitor_type", "folder"),
                "folder_path": monitor["folder_path"],
                "created_at": monitor["created_at"],
                "file_count": len(monitor["files"]),
                "watch_paths": monitor.get("watch_paths", []),
            }
            for monitor in monitors
        ],
    }


def create_baseline_for_folder(folder_path: str) -> dict:
    try:
        normalized = normalize_folder_path(folder_path)
        monitor = add_monitor(normalized, set_active=True)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    is_new = monitor.pop("is_new_monitor", True)
    action = "created" if is_new else "refreshed"
    save_log(
        f"[BASELINE {action.upper()}] {monitor['folder_path']} "
        f"({len(monitor['files'])} files, {len(get_monitors())} monitor(s))"
    )

    return {
        "success": True,
        "baseline_created": True,
        "is_new_monitor": is_new,
        "monitor_id": monitor["id"],
        "monitor_type": monitor.get("monitor_type", "folder"),
        "folder_path": monitor["folder_path"],
        "created_at": monitor["created_at"],
        "file_count": len(monitor["files"]),
        "monitor_count": len(get_monitors()),
    }


def create_baseline_for_files(file_paths: list[str]) -> dict:
    monitor = add_files_monitor(file_paths, set_active=True)
    return {
        "success": True,
        "baseline_created": True,
        "monitor_id": monitor["id"],
        "monitor_type": monitor.get("monitor_type", "files"),
        "folder_path": monitor["folder_path"],
        "created_at": monitor["created_at"],
        "file_count": len(monitor["files"]),
        "monitor_count": len(get_monitors()),
        "watch_paths": monitor.get("watch_paths", []),
    }


@app.get("/api/status")
def get_status():
    return _status_payload()


@app.get("/api/settings")
def api_get_settings():
    try:
        settings = load_settings()
        return {"app_version": APP_VERSION, **settings}
    except (OSError, json.JSONDecodeError) as error:
        logger.error("Failed to load settings: %s", error)
        raise HTTPException(status_code=500, detail="Could not read settings file.")


@app.put("/api/settings")
async def api_update_settings(request: SettingsUpdateRequest):
    try:
        payload = {key: value for key, value in request.model_dump().items() if value is not None}
        settings = save_settings(payload)
        monitor_service.reload_settings()
        asyncio.create_task(monitor_service.restart_loop())
        removed = prune_old_reports(settings.get("max_reports_retained"))
        return {
            "success": True,
            "settings": settings,
            "app_version": APP_VERSION,
            "reports_pruned": len(removed),
        }
    except OSError as error:
        logger.error("Failed to save settings: %s", error)
        raise HTTPException(status_code=500, detail="Could not save settings file.")


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
    picker_timeout = 120 if os_name == "Windows" else 60

    try:
        if os_name == "Darwin":
            apple_script = (
                'tell application "System Events"\n'
                '    activate\n'
                'end tell\n'
                'set chosen to choose folder with prompt "Select the folder to monitor:"\n'
                'POSIX path of chosen'
            )
            result = subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True, timeout=picker_timeout)
            folder_path = result.stdout.strip()
        elif os_name == "Windows":
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms; '
                '$d = New-Object System.Windows.Forms.FolderBrowserDialog; '
                '$d.Description = "Select Directory to Monitor"; '
                '$d.ShowNewFolderButton = $false; '
                'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }'
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Sta", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=picker_timeout,
            )
            folder_path = result.stdout.strip().strip("\ufeff").strip("\r")
            if not folder_path and result.stderr:
                logger.warning("Windows folder picker stderr: %s", result.stderr.strip())
        else:
            try:
                result = subprocess.run(["zenity", "--file-selection", "--directory", "--title=Select Directory to Monitor"], capture_output=True, text=True, timeout=picker_timeout)
                folder_path = result.stdout.strip()
            except FileNotFoundError:
                result = subprocess.run(["kdialog", "--getexistingdirectory", "/", "--title", "Select Directory to Monitor"], capture_output=True, text=True, timeout=picker_timeout)
                folder_path = result.stdout.strip()

        if folder_path:
            return create_baseline_for_folder(folder_path)
        return {"folder_path": "", "info": "Folder selection was cancelled."}
    except subprocess.TimeoutExpired:
        logger.warning("Folder picker timed out; falling back to manual path entry.")
        return {
            "folder_path": "",
            "info": "Folder picker could not open in this environment. Please paste the folder path manually in the text box and click Add.",
        }
    except FileNotFoundError:
        return {"folder_path": "", "info": "Native folder picker is not available on this system. Please paste the folder path manually."}
    except Exception as error:
        logger.error("Folder picker failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/create-baseline")
def api_create_baseline(request: FolderRequest):
    folder_path = normalize_folder_path(request.folder_path) if request.folder_path else ""
    if not folder_path or not folder_exists(request.folder_path):
        raise HTTPException(status_code=400, detail="Invalid folder path provided.")
    return create_baseline_for_folder(folder_path)


@app.post("/api/monitors/folder/resolve")
def api_resolve_folder_path(request: FolderRequest):
    """Validate and normalize a folder path without creating a monitor."""
    return resolve_folder_path(request.folder_path or "")


@app.post("/api/monitors/folder")
def api_add_folder_monitor(request: FolderRequest):
    if not request.folder_path or not request.folder_path.strip():
        raise HTTPException(status_code=400, detail="Enter a folder path.")
    resolved = resolve_folder_path(request.folder_path)
    if not resolved["exists"]:
        raise HTTPException(status_code=400, detail=resolved["message"])
    return create_baseline_for_folder(resolved["normalized"])


@app.post("/api/monitors/files")
def api_add_files_monitor(request: FilesRequest):
    if not request.file_paths:
        raise HTTPException(status_code=400, detail="Provide at least one file path.")
    try:
        return create_baseline_for_files(request.file_paths)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.post("/api/select-files")
def select_files():
    import subprocess
    import platform

    os_name = platform.system()
    picker_timeout = 120 if os_name == "Windows" else 60

    try:
        if os_name == "Darwin":
            apple_script = (
                'tell application "System Events"\n'
                '    activate\n'
                'end tell\n'
                'set chosen to choose file with prompt "Select files to monitor:" with multiple selections allowed\n'
                'set output to ""\n'
                'repeat with f in chosen\n'
                '    set output to output & (POSIX path of f) & linefeed\n'
                'end repeat\n'
                'return output'
            )
            result = subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True, timeout=picker_timeout)
            file_paths = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        elif os_name == "Windows":
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms; '
                '$d = New-Object System.Windows.Forms.OpenFileDialog; '
                '$d.Multiselect = $true; '
                '$d.Title = "Select Files to Monitor"; '
                'if ($d.ShowDialog() -eq "OK") { $d.FileNames -join "`n" }'
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Sta", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=picker_timeout,
            )
            file_paths = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        else:
            result = subprocess.run(
                ["zenity", "--file-selection", "--multiple", "--separator=|", "--title=Select Files to Monitor"],
                capture_output=True,
                text=True,
                timeout=picker_timeout,
            )
            file_paths = [part.strip() for part in result.stdout.split("|") if part.strip()]

        if file_paths:
            return create_baseline_for_files(file_paths)
        return {"folder_path": "", "info": "File selection was cancelled."}
    except subprocess.TimeoutExpired:
        logger.warning("File picker timed out; falling back to manual path entry.")
        return {"folder_path": "", "info": "File picker could not open in this environment. Please use the manual path entry instead."}
    except FileNotFoundError:
        return {"folder_path": "", "info": "Native file picker is not available on this system."}
    except Exception as error:
        logger.error("File picker failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error))


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
    monitor_type = monitor.get("monitor_type", "folder")
    files = []
    for path, info in monitor.get("files", {}).items():
        if monitor_type == "files":
            relative_path = path
        else:
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
    return {
        "folder_path": folder_path,
        "monitor_id": monitor["id"],
        "monitor_type": monitor_type,
        "files": files,
    }


@app.get("/api/files/preview")
def api_preview_file(path: str, monitor_id: Optional[str] = None, version: str = Query("baseline")):
    monitor = get_active_monitor() if not monitor_id else next((m for m in get_monitors() if m["id"] == monitor_id), None)
    if not monitor:
        raise HTTPException(status_code=404, detail="No baseline found.")
    info = monitor.get("files", {}).get(path)
    if not info:
        raise HTTPException(status_code=404, detail="File not found in monitored baseline.")

    extension = info.get("extension", "")
    backup_path = info.get("baseline_copy")
    preview = None
    previewable = False
    preview_mode = "text"

    if is_image_type(extension):
        content_path = resolve_content_path(path, version, backup_path)
        previewable = content_path is not None
        preview_mode = "image"
    elif version == "current":
        if os.path.isfile(path):
            if info.get("is_text_file") and info.get("content_snapshot") is not None and not info.get("hash_only"):
                preview = "".join(read_text_file(path))
                previewable = True
            else:
                content_path = path if os.path.isfile(path) else None
                if content_path:
                    preview = extract_preview_text(content_path, extension)
                    previewable = preview is not None
    else:
        if info.get("is_text_file") and info.get("content_snapshot") is not None and not info.get("hash_only"):
            preview = "".join(info["content_snapshot"])
            previewable = True
        elif backup_path and os.path.exists(backup_path):
            preview = extract_preview_text(backup_path, extension)
            previewable = preview is not None

    return {
        "path": path,
        "name": os.path.basename(path),
        "preview": preview,
        "previewable": previewable,
        "preview_mode": preview_mode,
        "version": version,
        "file_type": info.get("file_type", "Unknown"),
        "size": info.get("size", 0),
        "last_modified": info.get("last_modified", ""),
        "hash_only": info.get("hash_only", False),
        "has_backup": bool(info.get("baseline_copy")),
        "extension": extension,
    }


@app.get("/api/files/content")
def api_file_content(path: str, monitor_id: Optional[str] = None, version: str = Query("current")):
    monitor = get_active_monitor() if not monitor_id else next((m for m in get_monitors() if m["id"] == monitor_id), None)
    if not monitor:
        raise HTTPException(status_code=404, detail="No baseline found.")
    info = monitor.get("files", {}).get(path)
    if not info:
        raise HTTPException(status_code=404, detail="File not found in monitored baseline.")

    content_path = resolve_content_path(path, version, info.get("baseline_copy"))
    if not content_path or not os.path.isfile(content_path):
        raise HTTPException(status_code=404, detail="File content not available.")

    return FileResponse(content_path, media_type=guess_media_type(content_path), filename=os.path.basename(path))


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


frontend_dist = os.path.join(PROJECT_ROOT, "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:
    logger.warning("Frontend build directory ('frontend/dist') not found. Serving API only.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
