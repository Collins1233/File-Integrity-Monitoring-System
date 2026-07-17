import json
import os
import shutil
import uuid
from datetime import datetime

from scanner import scan_folder_with_options
from config import BASELINE_FILE, BASELINE_FOLDER, BACKUP_FILE_TYPES


def _empty_store():
    return {"version": 2, "monitors": [], "active_monitor_id": None}


def _save_store(store: dict) -> None:
    with open(BASELINE_FILE, "w", encoding="utf-8") as file:
        json.dump(store, file, indent=4)


def _migrate_v1(raw: dict) -> dict:
    if raw.get("version") == 2 and "monitors" in raw:
        return raw

    if "folder_path" in raw and "files" in raw:
        monitor_id = str(uuid.uuid4())[:8]
        return {
            "version": 2,
            "monitors": [{
                "id": monitor_id,
                "folder_path": raw["folder_path"],
                "created_at": raw.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                "files": raw["files"],
            }],
            "active_monitor_id": monitor_id,
        }

    return _empty_store()


def load_store() -> dict:
    if not os.path.exists(BASELINE_FILE):
        return _empty_store()

    with open(BASELINE_FILE, "r", encoding="utf-8") as file:
        raw = json.load(file)

    store = _migrate_v1(raw)
    if store != raw:
        _save_store(store)
    return store


def get_monitors() -> list[dict]:
    return load_store().get("monitors", [])


def get_monitor(monitor_id: str | None = None) -> dict | None:
    store = load_store()
    monitors = store.get("monitors", [])
    if not monitors:
        return None

    target_id = monitor_id or store.get("active_monitor_id")
    for monitor in monitors:
        if monitor["id"] == target_id:
            return monitor

    return monitors[0]


def get_active_monitor() -> dict | None:
    return get_monitor(None)


def set_active_monitor(monitor_id: str) -> dict | None:
    store = load_store()
    if not any(m["id"] == monitor_id for m in store["monitors"]):
        return None

    store["active_monitor_id"] = monitor_id
    _save_store(store)
    return get_monitor(monitor_id)


def _backup_supported_files(files: dict, folder_path: str) -> None:
    os.makedirs(BASELINE_FOLDER, exist_ok=True)
    for file_path, info in files.items():
        extension = info.get("extension")
        if extension in BACKUP_FILE_TYPES:
            relative_path = os.path.relpath(file_path, folder_path)
            destination = os.path.join(BASELINE_FOLDER, relative_path)
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)
            info["baseline_copy"] = destination


def add_monitor(folder_path: str, set_active: bool = True) -> dict:
    files = scan_folder_with_options(folder_path)
    _backup_supported_files(files, folder_path)

    monitor_id = str(uuid.uuid4())[:8]
    monitor = {
        "id": monitor_id,
        "folder_path": folder_path,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "files": files,
    }

    store = load_store()
    existing = next((m for m in store["monitors"] if m["folder_path"] == folder_path), None)
    if existing:
        existing["files"] = files
        existing["created_at"] = monitor["created_at"]
        if set_active:
            store["active_monitor_id"] = existing["id"]
        _save_store(store)
        return existing

    store["monitors"].append(monitor)
    if set_active or not store.get("active_monitor_id"):
        store["active_monitor_id"] = monitor_id
    _save_store(store)
    return monitor


def accept_monitor_changes(monitor_id: str | None = None) -> dict:
    monitor = get_monitor(monitor_id)
    if not monitor:
        return {"success": False, "message": "No monitor found."}

    folder_path = monitor["folder_path"]
    if not os.path.isdir(folder_path):
        return {"success": False, "message": f"Folder no longer exists: {folder_path}"}

    files = scan_folder_with_options(folder_path)
    _backup_supported_files(files, folder_path)
    monitor["files"] = files
    monitor["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    store = load_store()
    for index, item in enumerate(store["monitors"]):
        if item["id"] == monitor["id"]:
            store["monitors"][index] = monitor
            break
    _save_store(store)

    return {
        "success": True,
        "monitor_id": monitor["id"],
        "folder_path": folder_path,
        "file_count": len(files),
        "created_at": monitor["created_at"],
    }


def restore_file(file_path: str, monitor_id: str | None = None) -> dict:
    monitor = get_monitor(monitor_id)
    if not monitor:
        return {"success": False, "message": "No monitor found."}

    info = monitor["files"].get(file_path)
    if not info:
        return {"success": False, "message": "File not found in baseline."}

    backup_path = info.get("baseline_copy")
    if not backup_path or not os.path.exists(backup_path):
        return {"success": False, "message": "No backup copy available for this file."}

    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    shutil.copy2(backup_path, file_path)

    return {"success": True, "restored_path": file_path}


def remove_monitor(monitor_id: str) -> bool:
    store = load_store()
    monitors = [m for m in store["monitors"] if m["id"] != monitor_id]
    if len(monitors) == len(store["monitors"]):
        return False

    store["monitors"] = monitors
    if store.get("active_monitor_id") == monitor_id:
        store["active_monitor_id"] = monitors[0]["id"] if monitors else None
    _save_store(store)
    return True


def legacy_load_baseline() -> dict | None:
    monitor = get_active_monitor()
    if not monitor:
        return None
    return {
        "folder_path": monitor["folder_path"],
        "created_at": monitor["created_at"],
        "files": monitor["files"],
        "monitor_id": monitor["id"],
    }
