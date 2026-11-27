import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import csv
import io
import json
import logging
import asyncio
import subprocess
import re
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

from auth import (
    Role,
    DEFAULT_ADMIN_API_KEY,
    create_access_token,
    get_current_user_and_role,
    require_admin,
    require_analyst,
    require_auditor,
    require_viewer,
)
from scanner import scan_folder_with_options
from baseline_store import (
    add_monitor,
    add_files_monitor,
    get_active_monitor,
    get_monitors,
    set_active_monitor,
    remove_monitor,
    accept_monitor_changes,
    accept_file_changes,
    restore_file,
    count_unique_monitored_files,
    legacy_load_baseline as load_baseline,
    normalize_folder_path,
    verify_store_integrity,
)
from integrity import run_integrity_check
from monitor import monitor_service
from path_utils import resolve_folder_path, folder_exists
from report import list_reports, delete_report_file, prune_old_reports
from logger import save_log
from settings_manager import load_settings, save_settings
from scan_progress import scan_progress
from config import APP_VERSION, DEV_SESSION_FILE, FRONTEND_DIST, LOG_FILE, MAX_REPORTS_RETAINED, PROJECT_ROOT, REPORT_FOLDER, SUPPORTED_FILE_TYPES, TEXT_EXTENSIONS
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
    realtime_kernel_enabled: Optional[bool] = None
    excluded_extensions: Optional[list[str]] = None
    hash_only_enabled: Optional[bool] = None
    hash_only_size_bytes: Optional[int] = None
    max_reports_retained: Optional[int] = None

class ActiveMonitorRequest(BaseModel):
    monitor_id: str

class RestoreFileRequest(BaseModel):
    path: str
    monitor_id: Optional[str] = None

class SaveFileContentRequest(BaseModel):
    path: str
    content: str
    monitor_id: Optional[str] = None

class SimulateScenarioRequest(BaseModel):
    scenario: str  # "modify", "ransomware", "rogue_file", "delete"
    path: Optional[str] = None
    monitor_id: Optional[str] = None

class AcceptBaselineRequest(BaseModel):
    monitor_id: Optional[str] = None
    path: Optional[str] = None  # when set, only this one file is marked safe

class FlagFileRequest(BaseModel):
    path: str
    note: Optional[str] = None
    change: Optional[str] = None  # modified | deleted | added

class TokenRequest(BaseModel):
    api_key: Optional[str] = None
    role: Optional[str] = None


@app.get("/api/auth/me")
def api_auth_me(current_user: dict = Depends(get_current_user_and_role)):
    return {
        "user": current_user.get("user"),
        "role": current_user.get("role"),
        "permissions": current_user.get("permissions"),
        "is_local_fallback": current_user.get("is_local_fallback", False),
        "default_admin_key": DEFAULT_ADMIN_API_KEY,
    }


@app.post("/api/auth/token")
def api_auth_token(request: TokenRequest):
    requested_role = (request.role or "admin").lower()
    if requested_role not in [r.value for r in Role]:
        raise HTTPException(status_code=400, detail=f"Invalid role: {requested_role}")

    if request.api_key and request.api_key != DEFAULT_ADMIN_API_KEY:
        if not request.api_key.startswith("fim_"):
            raise HTTPException(status_code=401, detail="Invalid API Key.")

    token = create_access_token(user_id=f"user_{requested_role}", role=requested_role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": requested_role,
        "expires_in_minutes": 480,
    }



def _read_dev_session() -> str:
    try:
        if os.path.exists(DEV_SESSION_FILE):
            with open(DEV_SESSION_FILE, "r", encoding="utf-8") as file:
                session = file.read().strip()
                if session:
                    return session
    except OSError:
        pass
    return ""


def _status_payload():
    monitors = get_monitors()
    active = get_active_monitor()
    is_valid, reason = verify_store_integrity()
    return {
        "app_version": APP_VERSION,
        "dev_session": _read_dev_session(),
        "has_baseline": len(monitors) > 0,
        "baseline_integrity": {
            "is_valid": is_valid,
            "status": reason,
            "tamper_detected": (not is_valid and reason == "SIGNATURE_MISMATCH"),
        },
        "folder_path": active["folder_path"] if active else "",
        "created_at": active["created_at"] if active else "",
        "file_count": count_unique_monitored_files(monitors),
        "active_file_count": len(active["files"]) if active else 0,
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

    monitor_service.sync_monitors()

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
    is_new = monitor.pop("is_new_monitor", True)
    monitor_service.sync_monitors()
    return {
        "success": True,
        "baseline_created": True,
        "is_new_monitor": is_new,
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


@app.get("/api/baseline/verify")
def api_verify_baseline():
    is_valid, reason = verify_store_integrity()
    return {
        "valid": is_valid,
        "status": reason,
        "tamper_detected": (not is_valid and reason == "SIGNATURE_MISMATCH"),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.get("/api/settings")
def api_get_settings():
    try:
        settings = load_settings()
        return {"app_version": APP_VERSION, **settings}
    except (OSError, json.JSONDecodeError) as error:
        logger.error("Failed to load settings: %s", error)
        raise HTTPException(status_code=500, detail="Could not read settings file.")


@app.put("/api/settings", dependencies=[Depends(require_admin)])
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


@app.post("/api/monitors/active", dependencies=[Depends(require_analyst)])
def api_set_active_monitor(request: ActiveMonitorRequest):
    monitor = set_active_monitor(request.monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found.")
    return {"success": True, "active_monitor_id": monitor["id"], "folder_path": monitor["folder_path"]}


@app.delete("/api/monitors/{monitor_id}", dependencies=[Depends(require_admin)])
def api_remove_monitor(monitor_id: str):
    if not remove_monitor(monitor_id):
        raise HTTPException(status_code=404, detail="Monitor not found.")
    monitor_service.sync_monitors()
    return {"success": True, **_status_payload()}


def _drop_path_from_last_result(path: str) -> None:
    """Remove a file from the latest scan result and pending alerts (after restore / mark-as-safe)."""
    target = os.path.normcase(os.path.normpath(path))

    def same(p: str) -> bool:
        return os.path.normcase(os.path.normpath(p)) == target

    last = monitor_service.last_result
    if isinstance(last, dict):
        for key in ("modified_files", "deleted_files", "new_files"):
            last[key] = [p for p in (last.get(key) or []) if not same(p)]
        last["text_differences"] = {k: v for k, v in (last.get("text_differences") or {}).items() if not same(k)}
        last["file_metadata"] = {k: v for k, v in (last.get("file_metadata") or {}).items() if not same(k)}
        last["modified_count"] = len(last.get("modified_files") or [])
        last["deleted_count"] = len(last.get("deleted_files") or [])
        last["new_count"] = len(last.get("new_files") or [])
        monitor_service.last_result = last

    remaining_alerts = []
    for alert in monitor_service.get_alerts():
        affected = alert.get("affected_files") or []
        still_affected = [item for item in affected if not same(item.get("path") or "")]
        if still_affected:
            remaining_alerts.append({**alert, "affected_files": still_affected})
    monitor_service._pending_alerts = remaining_alerts


@app.post("/api/baseline/accept", dependencies=[Depends(require_analyst)])
def api_accept_baseline(request: AcceptBaselineRequest):
    # One file only: "Mark as Safe (Update Baseline)" from the File Changes page.
    if request.path:
        result = accept_file_changes(request.path, request.monitor_id)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Could not update baseline."))
        _drop_path_from_last_result(request.path)
        save_log(f"[MARKED SAFE] {request.path} (baseline updated for this file)")
        return {**result, "last_result": monitor_service.last_result}

    result = accept_monitor_changes(request.monitor_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Could not update baseline."))
    save_log(f"[BASELINE RESET] {result.get('folder_path')} ({result.get('file_count')} files re-saved)")
    return result


@app.post("/api/files/flag", dependencies=[Depends(require_analyst)])
def api_flag_file(request: FlagFileRequest):
    """Record that a reviewer flagged a changed file as a problem (shows up in the audit trail)."""
    note = (request.note or "").strip().replace("\n", " ")[:300]
    change = (request.change or "change").lower()
    suffix = f" - {note}" if note else ""
    save_log(f"[FLAGGED ISSUE] {request.path} ({change}){suffix}")
    return {"success": True, "path": request.path, "flagged_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


@app.post("/api/files/restore", dependencies=[Depends(require_analyst)])
def api_restore_file(request: RestoreFileRequest):
    result = restore_file(request.path, request.monitor_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Restore failed."))

    restored = result.get("restored_path") or request.path
    # Drop this file from the latest check result / alerts so undo is not treated as a new change.
    _drop_path_from_last_result(restored)

    save_log(f"[RESTORED] {restored} (baseline refreshed, not treated as a new change)")
    return {**result, "last_result": monitor_service.last_result}


def _get_available_roots() -> list[str]:
    roots = []
    if os.name == "nt":
        import string
        try:
            from ctypes import windll
            bitmask = windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    drive = f"{letter}:\\"
                    if os.path.exists(drive):
                        roots.append(drive)
                bitmask >>= 1
        except Exception:
            for letter in string.ascii_uppercase:
                drive = f"{letter}:\\"
                if os.path.exists(drive):
                    roots.append(drive)
    else:
        roots.append("/")
    return roots


def _get_directory_presets() -> list[dict]:
    home = os.path.expanduser("~")
    presets = []

    # 1. Demo Files
    demo_path = os.path.join(PROJECT_ROOT, "demo_files")
    if os.path.exists(demo_path):
        presets.append({
            "name": "Demo Test Files",
            "path": os.path.abspath(demo_path),
            "description": "Built-in demo folder for testing integrity checks",
        })

    # 2. Desktop
    desktop = os.path.join(home, "Desktop")
    if os.path.exists(desktop):
        presets.append({
            "name": "Desktop",
            "path": os.path.abspath(desktop),
            "description": "User Desktop directory",
        })

    # 3. Documents
    docs = os.path.join(home, "Documents")
    if os.path.exists(docs):
        presets.append({
            "name": "Documents",
            "path": os.path.abspath(docs),
            "description": "User Documents directory",
        })

    # 4. User Home
    if os.path.exists(home):
        presets.append({
            "name": "Home Directory",
            "path": os.path.abspath(home),
            "description": "Current user profile home",
        })

    # 5. Project Root
    if os.path.exists(PROJECT_ROOT):
        presets.append({
            "name": "Project Workspace",
            "path": os.path.abspath(PROJECT_ROOT),
            "description": "FIMS application root folder",
        })

    return presets


@app.get("/api/browse-directory")
def api_browse_directory(path: Optional[str] = None):
    available_roots = _get_available_roots()
    presets = _get_directory_presets()

    target_path = path.strip() if path and path.strip() else ""
    if not target_path:
        demo_path = os.path.join(PROJECT_ROOT, "demo_files")
        if os.path.exists(demo_path):
            target_path = demo_path
        elif os.path.exists(os.path.expanduser("~")):
            target_path = os.path.expanduser("~")
        elif available_roots:
            target_path = available_roots[0]
        else:
            target_path = PROJECT_ROOT

    target_path = os.path.abspath(target_path)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"Path not found: {target_path}")

    if os.path.isfile(target_path):
        current_dir = os.path.dirname(target_path)
    else:
        current_dir = target_path

    parent_dir = os.path.dirname(current_dir)
    if parent_dir == current_dir:
        parent_dir = None

    items = []
    try:
        with os.scandir(current_dir) as entries:
            for entry in entries:
                if entry.name.startswith((".", "$")):
                    continue
                try:
                    stat_info = entry.stat(follow_symlinks=False)
                    is_dir = entry.is_dir(follow_symlinks=False)
                    items.append({
                        "name": entry.name,
                        "path": os.path.abspath(entry.path),
                        "is_dir": is_dir,
                        "size": stat_info.st_size if not is_dir else 0,
                        "modified": datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    })
                except (PermissionError, OSError):
                    continue
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Access denied to directory: {current_dir}")
    except OSError as err:
        raise HTTPException(status_code=500, detail=f"Error reading directory: {err}")

    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    return {
        "current_path": current_dir,
        "parent_path": parent_dir,
        "roots": available_roots,
        "presets": presets,
        "items": items,
    }


@app.post("/api/select-folder", dependencies=[Depends(require_analyst)])
def select_folder():
    return {
        "folder_path": "",
        "info": "Native OS dialogs have been replaced with the web browser dialog. Please use the in-app folder selector.",
    }


@app.post("/api/create-baseline", dependencies=[Depends(require_analyst)])
def api_create_baseline(request: FolderRequest):
    folder_path = normalize_folder_path(request.folder_path) if request.folder_path else ""
    if not folder_path or not folder_exists(request.folder_path):
        raise HTTPException(status_code=400, detail="Invalid folder path provided.")
    return create_baseline_for_folder(folder_path)


@app.post("/api/monitors/folder/resolve")
def api_resolve_folder_path(request: FolderRequest):
    """Validate and normalize a folder path without creating a monitor."""
    return resolve_folder_path(request.folder_path or "")


@app.post("/api/monitors/folder", dependencies=[Depends(require_analyst)])
def api_add_folder_monitor(request: FolderRequest):
    if not request.folder_path or not request.folder_path.strip():
        raise HTTPException(status_code=400, detail="Enter a folder path.")
    resolved = resolve_folder_path(request.folder_path)
    if not resolved["exists"]:
        raise HTTPException(status_code=400, detail=resolved["message"])
    return create_baseline_for_folder(resolved["normalized"])


@app.post("/api/monitors/files", dependencies=[Depends(require_analyst)])
def api_add_files_monitor(request: FilesRequest):
    if not request.file_paths:
        raise HTTPException(status_code=400, detail="Provide at least one file path.")
    try:
        return create_baseline_for_files(request.file_paths)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.post("/api/monitors/upload", dependencies=[Depends(require_analyst)])
async def api_upload_monitor(
    files: list[UploadFile] = File(...),
    folder_name: Optional[str] = Form(None),
    relative_paths: Optional[str] = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files selected.")

    rel_map = {}
    if relative_paths:
        try:
            rel_map = json.loads(relative_paths)
        except Exception:
            rel_map = {}

    raw_name = (folder_name or "").strip()
    clean_name = re.sub(r'[^a-zA-Z0-9_\- ]', '_', raw_name)
    if not clean_name:
        clean_name = f"Uploaded_Folder_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    uploads_root = os.path.join(PROJECT_ROOT, "uploads")
    target_dir = os.path.join(uploads_root, clean_name)
    os.makedirs(target_dir, exist_ok=True)

    saved_count = 0
    for file in files:
        filename = file.filename or f"file_{saved_count + 1}"
        rel_path = rel_map.get(filename, filename).lstrip("/\\")
        dest_path = os.path.abspath(os.path.join(target_dir, rel_path))

        if not dest_path.startswith(os.path.abspath(target_dir)):
            dest_path = os.path.join(target_dir, os.path.basename(filename))

        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
        saved_count += 1

    return create_baseline_for_folder(target_dir)


@app.post("/api/files/simulate-tamper", dependencies=[Depends(require_analyst)])
async def api_simulate_tamper(request: RestoreFileRequest):
    """Quickly append a tamper marker to test detection, unified diffs, and alerts."""
    path = request.path
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found.")
    ext = os.path.splitext(path)[1].lower()
    timestamp = datetime.now().strftime("%H:%M:%S")
    try:
        if ext == ".docx":
            from docx import Document
            doc = Document(path)
            doc.add_paragraph(f"[TEST MODIFICATION] Modified at {timestamp}")
            doc.save(path)
        else:
            with open(path, "a", encoding="utf-8", errors="ignore") as f:
                f.write(f"\n# [TEST MODIFICATION] Modified at {timestamp}\n")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to modify file: {e}")
    save_log(f"SIMULATED TAMPER: Appended test modification to {os.path.basename(path)}")
    return {"success": True, "message": f"Modified {os.path.basename(path)}. Run 'Check Now' or wait for Watchdog auto-detect."}


@app.get("/api/files/text", dependencies=[Depends(require_analyst)])
def api_get_file_text(path: str, monitor_id: Optional[str] = None):
    """Retrieve readable text of a monitored file (including Word .docx, PDF, text, code) for in-browser viewing and editing."""
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found.")
    
    ext = os.path.splitext(path)[1].lower()

    # Handle Word Document (.docx)
    if ext == ".docx":
        from file_preview import extract_preview_text
        content = extract_preview_text(path, ext)
        return {
            "success": True,
            "path": path,
            "filename": os.path.basename(path),
            "content": content or "(Empty Word Document)",
            "size": os.path.getsize(path),
            "file_type": "docx",
            "is_word": True,
        }

    # Handle other documents (.pdf, .pptx, .xlsx, .rtf)
    if ext in [".pdf", ".pptx", ".xlsx", ".rtf"]:
        from file_preview import extract_preview_text
        content = extract_preview_text(path, ext)
        return {
            "success": True,
            "path": path,
            "filename": os.path.basename(path),
            "content": content or f"(No extractable text found in this {ext} file)",
            "size": os.path.getsize(path),
            "file_type": ext.lstrip("."),
            "read_only": True,
        }

    # Binary images
    if ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]:
        raise HTTPException(
            status_code=400,
            detail=f"'{os.path.basename(path)}' is an image/binary file. Use '⚡ 1-Click Tamper' to test integrity detection on this file.",
        )

    # Standard text/code/config files
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return {
            "success": True,
            "path": path,
            "filename": os.path.basename(path),
            "content": content,
            "size": os.path.getsize(path),
            "file_type": "text",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")


@app.post("/api/files/save", dependencies=[Depends(require_analyst)])
async def api_save_file_content(request: SaveFileContentRequest):
    """Save edited content to a monitored file directly from the browser (supports text & Word .docx)."""
    path = request.path
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found on disk.")

    ext = os.path.splitext(path)[1].lower()

    if ext == ".docx":
        try:
            from docx import Document
            try:
                doc = Document(path)
                for p in list(doc.paragraphs):
                    p._element.getparent().remove(p._element)
            except Exception:
                doc = Document()
            for line in request.content.splitlines():
                doc.add_paragraph(line)
            doc.save(path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save Word document: {e}")
    else:
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(request.content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    save_log(f"IN-BROWSER EDIT: Saved modifications to {os.path.basename(path)}")
    return {
        "success": True,
        "message": f"Saved changes to {os.path.basename(path)}.",
        "path": path,
        "filename": os.path.basename(path),
    }


@app.post("/api/files/simulate-scenario", dependencies=[Depends(require_analyst)])
async def api_simulate_scenario(request: SimulateScenarioRequest):
    """Simulate realistic security scenarios: modify, ransomware, rogue file, delete."""
    monitors = get_monitors()
    if not monitors:
        raise HTTPException(status_code=400, detail="No active baseline or monitor found. Please add a folder or select server presets first.")

    monitor = get_active_monitor() if not request.monitor_id else next((m for m in monitors if m["id"] == request.monitor_id), None)
    if not monitor:
        monitor = monitors[0]

    target_path = request.path
    files_dict = monitor.get("files", {})

    # If no path provided, pick a suitable monitored file
    if not target_path or not os.path.exists(target_path):
        available_files = [p for p in files_dict.keys() if os.path.isfile(p)]
        if not available_files and request.scenario != "rogue_file":
            raise HTTPException(status_code=404, detail="No monitored files found on disk to simulate on.")
        if available_files:
            target_path = available_files[0]

    scenario = (request.scenario or "modify").lower()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if scenario == "modify":
        ext = os.path.splitext(target_path)[1].lower() if target_path else ""
        try:
            if ext == ".docx":
                from docx import Document
                doc = Document(target_path)
                doc.add_paragraph(f"[UNAUTHORIZED EDIT] Tampered at {timestamp}")
                doc.save(target_path)
            else:
                with open(target_path, "a", encoding="utf-8", errors="ignore") as f:
                    f.write(f"\n# [UNAUTHORIZED EDIT] Tampered at {timestamp}\n")
            save_log(f"SIMULATED ATTACK: Injected unauthorized modification into {os.path.basename(target_path)}")
            return {
                "success": True,
                "scenario": "modify",
                "affected_file": os.path.basename(target_path),
                "path": target_path,
                "message": f"Injected unauthorized edit into {os.path.basename(target_path)}. Run 'Check Now' to inspect diff!"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to modify file: {e}")

    elif scenario == "ransomware":
        try:
            with open(target_path, "a", encoding="utf-8", errors="ignore") as f:
                f.write(f"\n=== ENCRYPTED_BY_SIMULATED_RANSOMWARE ===\n[PAYLOAD_CIPHERTEXT::0x8f4d9a3b_{int(datetime.now().timestamp())}]\n")
            save_log(f"SIMULATED ATTACK: Injected ransomware payload into {os.path.basename(target_path)}")
            return {
                "success": True,
                "scenario": "ransomware",
                "affected_file": os.path.basename(target_path),
                "path": target_path,
                "message": f"Simulated ransomware payload appended to {os.path.basename(target_path)}."
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to inject payload: {e}")

    elif scenario == "rogue_file":
        folder_dir = monitor.get("folder_path")
        if not folder_dir or not os.path.isdir(folder_dir):
            if target_path:
                folder_dir = os.path.dirname(target_path)
            elif files_dict:
                folder_dir = os.path.dirname(list(files_dict.keys())[0])
            else:
                folder_dir = "."

        rogue_filename = "unauthorized_backdoor.sh"
        rogue_path = os.path.join(folder_dir, rogue_filename)
        try:
            with open(rogue_path, "w", encoding="utf-8") as f:
                f.write(f"#!/bin/bash\n# Unauthorized Rogue Script created at {timestamp}\necho 'Attacker execution simulation'\n")
            save_log(f"SIMULATED ATTACK: Created unauthorized rogue file {rogue_filename}")
            return {
                "success": True,
                "scenario": "rogue_file",
                "affected_file": rogue_filename,
                "path": rogue_path,
                "message": f"Created unauthorized new file '{rogue_filename}'. Run 'Check Now' to detect new file alert!"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create rogue file: {e}")

    elif scenario == "delete":
        try:
            os.remove(target_path)
            save_log(f"SIMULATED ATTACK: Maliciously deleted file {os.path.basename(target_path)}")
            return {
                "success": True,
                "scenario": "delete",
                "affected_file": os.path.basename(target_path),
                "path": target_path,
                "message": f"Deleted {os.path.basename(target_path)} from disk. Run 'Check Now' to trigger missing file alert!"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

    else:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {scenario}. Available: modify, ransomware, rogue_file, delete")


@app.post("/api/select-files", dependencies=[Depends(require_analyst)])
def select_files():
    return {
        "folder_path": "",
        "info": "Native OS dialogs have been replaced with the web browser dialog. Please use the in-app file selector.",
    }


@app.post("/api/check-integrity", dependencies=[Depends(require_analyst)])
def api_check_integrity():
    result = run_integrity_check(generate_report=True)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Check failed."))
    return result


@app.post("/api/monitoring/check-now", dependencies=[Depends(require_analyst)])
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


def _file_under_monitor(monitor, file_path: str) -> bool:
    file_path = os.path.normpath(file_path)
    monitor_type = monitor.get("monitor_type", "folder")
    if monitor_type == "files":
        watch_paths = monitor.get("watch_paths") or list(monitor.get("files", {}).keys())
        return file_path in {os.path.normpath(p) for p in watch_paths}
    folder_path = monitor.get("folder_path", "")
    if not folder_path:
        return False
    folder_path = os.path.normpath(folder_path)
    try:
        return os.path.commonpath([file_path, folder_path]) == folder_path
    except ValueError:
        return False


def _resolve_file_info(monitor, file_path: str) -> dict | None:
    info = monitor.get("files", {}).get(file_path)
    if info:
        return info
    if not os.path.isfile(file_path) or not _file_under_monitor(monitor, file_path):
        return None
    extension = os.path.splitext(file_path)[1].lower()
    return {
        "extension": extension,
        "file_type": SUPPORTED_FILE_TYPES.get(extension, "File"),
        "is_text_file": extension in TEXT_EXTENSIONS,
        "baseline_copy": None,
        "hash_only": False,
        "size": os.path.getsize(file_path),
        "last_modified": "",
    }


@app.get("/api/files/preview")
def api_preview_file(path: str, monitor_id: Optional[str] = None, version: str = Query("baseline")):
    monitor = get_active_monitor() if not monitor_id else next((m for m in get_monitors() if m["id"] == monitor_id), None)
    if not monitor:
        raise HTTPException(status_code=404, detail="No baseline found.")
    info = _resolve_file_info(monitor, path)
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
                preview = extract_preview_text(path, extension)
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
def api_file_content(
    path: str,
    monitor_id: Optional[str] = None,
    version: str = Query("current"),
    inline: bool = Query(False),
):
    monitor = get_active_monitor() if not monitor_id else next((m for m in get_monitors() if m["id"] == monitor_id), None)
    if not monitor:
        raise HTTPException(status_code=404, detail="No baseline found.")
    info = _resolve_file_info(monitor, path)
    if not info:
        raise HTTPException(status_code=404, detail="File not found in monitored baseline.")

    content_path = resolve_content_path(path, version, info.get("baseline_copy"))
    if not content_path or not os.path.isfile(content_path):
        raise HTTPException(status_code=404, detail="File content not available.")

    media_type = guess_media_type(content_path)
    headers = {}
    filename = os.path.basename(path)
    if inline:
        headers["Content-Disposition"] = f'inline; filename="{filename}"'
        return FileResponse(content_path, media_type=media_type, headers=headers)
    return FileResponse(content_path, media_type=media_type, filename=filename)


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


@app.post("/api/monitoring/toggle", dependencies=[Depends(require_admin)])
def api_monitoring_toggle(request: MonitoringToggleRequest):
    monitor_service.set_enabled(request.enabled)
    return monitor_service.get_status()


@app.get("/api/reports")
def api_get_reports():
    prune_old_reports()
    return [{"filename": r["filename"], "created_at": r["created_at"], "size_bytes": r["size_bytes"]} for r in list_reports()]


@app.get("/api/reports/{filename}/preview")
def api_preview_report(filename: str):
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid report filename.")
    file_path = os.path.join(REPORT_FOLDER, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found.")
    return FileResponse(file_path, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@app.get("/api/reports/{filename}")
def api_download_report(filename: str):
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid report filename.")
    file_path = os.path.join(REPORT_FOLDER, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found.")
    # Explicit attachment so browsers save the PDF instead of handing the URL to download managers.
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=filename,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


@app.delete("/api/reports/{filename}", dependencies=[Depends(require_admin)])
def api_delete_report(filename: str):
    try:
        deleted = delete_report_file(filename)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not deleted:
        raise HTTPException(status_code=404, detail="Report file not found.")
    return {"success": True, "deleted": filename, "remaining": len(list_reports()), "max_retained": MAX_REPORTS_RETAINED}


@app.get("/api/docs/download/{filename}")
def api_download_doc(filename: str):
    allowed_files = {
        "bank_compliance": "FIMS_Bank_Compliance_Roadmap_and_Phases.docx",
        "backend": "FIMS_Backend_Documentation.docx",
        "FIMS_Bank_Compliance_Roadmap_and_Phases.docx": "FIMS_Bank_Compliance_Roadmap_and_Phases.docx",
        "FIMS_Backend_Documentation.docx": "FIMS_Backend_Documentation.docx",
    }
    target_name = allowed_files.get(filename)
    if not target_name:
        raise HTTPException(status_code=400, detail="Invalid document requested.")
    
    file_path = os.path.join(PROJECT_ROOT, target_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Documentation file not found.")
        
    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=target_name,
        headers={
            "Content-Disposition": f'attachment; filename="{target_name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )



def _parse_logs():
    log_paths = [LOG_FILE]
    legacy_log = os.path.join(os.path.dirname(__file__), "fim_log.txt")
    if legacy_log not in log_paths:
        log_paths.append(legacy_log)

    lines = []
    for log_path in log_paths:
        if not os.path.exists(log_path):
            continue
        with open(log_path, "r", encoding="utf-8") as file:
            lines.extend(file.readlines())

    if not lines:
        return []
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


@app.exception_handler(404)
async def custom_404_handler(request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    index_file = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
else:
    logger.warning("Frontend build directory (%s) not found. Serving API only.", FRONTEND_DIST)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
