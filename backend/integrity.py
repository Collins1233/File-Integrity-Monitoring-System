import os

from baseline_store import get_monitors, legacy_load_baseline as load_baseline
from scanner import scan_folder_with_options, scan_files_with_options
from logger import save_log
from textdiff import read_text_file, format_text_change
from report import generate_pdf_report
from scan_progress import scan_progress
from config import BACKUP_FILE_TYPES
from file_preview import format_backup_diff


def _build_backup_diff(file_path, old_info):
    backup_path = old_info.get("baseline_copy")
    extension = (old_info.get("extension") or "").lower()
    if not backup_path or not os.path.exists(backup_path):
        return None

    try:
        diff = format_backup_diff(backup_path, file_path, extension)
        if not diff:
            return None

        # Always keep a structured original/current compare when we can extract text,
        # even if total_changes is 0 (e.g. formatting-only Word edits).
        diff["can_restore"] = True
        diff["file_type"] = old_info.get("file_type", "File")
        diff["extension"] = extension
        return diff
    except Exception as error:
        save_log(f"[DIFF ERROR] {file_path}: {error}")
        return None


def _build_file_metadata(old_info):
    backup_path = old_info.get("baseline_copy")
    return {
        "can_restore": bool(backup_path and os.path.exists(backup_path)),
        "file_type": old_info.get("file_type", "Unknown"),
        "extension": old_info.get("extension", ""),
        "has_backup": bool(backup_path),
    }


def _build_binary_diff(old_info):
    return {
        "preview_type": "binary",
        "can_restore": bool(old_info.get("baseline_copy") and os.path.exists(old_info["baseline_copy"])),
        "file_type": old_info.get("file_type", "Unknown"),
        "extension": old_info.get("extension", ""),
        "summary": {
            "lines_removed": 0,
            "lines_added": 0,
            "total_changes": 1,
        },
        "message": "This file changed. Preview is limited for this format, but you can restore the original if a backup exists.",
    }


def _compare_monitor(monitor, generate_report=True):
    monitor_type = monitor.get("monitor_type", "folder")
    folder_path = monitor["folder_path"]
    old_files = monitor["files"]

    if monitor_type == "files":
        watch_paths = monitor.get("watch_paths") or list(old_files.keys())
        missing = [path for path in watch_paths if not os.path.isfile(path)]
        if missing:
            return {
                "success": False,
                "monitor_id": monitor["id"],
                "message": f"Monitored file no longer exists: {missing[0]}",
            }

        current_files = scan_files_with_options(
            watch_paths,
            track_progress=True,
            operation=f"Checking {len(watch_paths)} selected files",
        )
    else:
        if not os.path.isdir(folder_path):
            return {
                "success": False,
                "monitor_id": monitor["id"],
                "message": f"The monitored folder no longer exists: {folder_path}",
            }

        current_files = scan_folder_with_options(
            folder_path,
            track_progress=True,
            operation=f"Checking {os.path.basename(folder_path.rstrip('/'))}",
        )

    modified_files = []
    deleted_files = []
    new_files = []
    text_differences = {}
    file_metadata = {}

    for file_path in old_files:
        if file_path not in current_files:
            deleted_files.append(file_path)
            file_metadata[file_path] = _build_file_metadata(old_files[file_path])
        elif old_files[file_path]["hash"] != current_files[file_path]["hash"]:
            modified_files.append(file_path)
            old_info = old_files[file_path]
            file_metadata[file_path] = _build_file_metadata(old_info)

            if old_info.get("is_text_file") and old_info.get("content_snapshot") and not old_info.get("hash_only"):
                old_lines = old_info.get("content_snapshot", [])
                new_lines = read_text_file(file_path)
                differences = format_text_change(old_lines, new_lines)
                differences["preview_type"] = "text"
                differences["can_restore"] = file_metadata[file_path]["can_restore"]
                differences["file_type"] = old_info.get("file_type", "Text file")
                differences["extension"] = old_info.get("extension", "")
                text_differences[file_path] = differences
            elif (old_info.get("extension") or "").lower() in BACKUP_FILE_TYPES:
                backup_diff = _build_backup_diff(file_path, old_info)
                if backup_diff:
                    text_differences[file_path] = backup_diff
                else:
                    text_differences[file_path] = _build_binary_diff(old_info)
            else:
                text_differences[file_path] = _build_binary_diff(old_info)

    for file_path in current_files:
        if file_path not in old_files:
            new_files.append(file_path)

    if monitor_type == "files":
        new_files = []

    for file_path in modified_files:
        save_log(f"[MODIFIED] {file_path}")
    for file_path in deleted_files:
        save_log(f"[DELETED] {file_path}")
    for file_path in new_files:
        save_log(f"[NEW FILE] {file_path}")

    save_log(
        f"[SUMMARY] {folder_path}: Modified: {len(modified_files)}, "
        f"Deleted: {len(deleted_files)}, New: {len(new_files)}"
    )

    report_path = None
    if generate_report:
        report_path = generate_pdf_report(
            folder_path,
            modified_files,
            deleted_files,
            new_files,
            text_differences,
        )
        save_log(f"[REPORT GENERATED] {report_path}")
    else:
        save_log(f"[AUTO CHECK] {folder_path} completed (no PDF generated).")

    return {
        "success": True,
        "monitor_id": monitor["id"],
        "folder_path": folder_path,
        "modified_files": modified_files,
        "deleted_files": deleted_files,
        "new_files": new_files,
        "text_differences": text_differences,
        "file_metadata": file_metadata,
        "report_path": report_path,
        "auto_check": not generate_report,
    }


def run_integrity_check(generate_report=True, monitor_id=None):
    monitors = get_monitors()
    if not monitors:
        return {"success": False, "message": "No baseline found. Please create a baseline first."}

    if monitor_id:
        monitors = [monitor for monitor in monitors if monitor["id"] == monitor_id]
        if not monitors:
            return {"success": False, "message": "Monitor not found."}

    scan_progress.start("Running integrity check", len(monitors))
    results = []
    for index, monitor in enumerate(monitors, start=1):
        scan_progress.update(index, len(monitors), monitor["folder_path"])
        results.append(_compare_monitor(monitor, generate_report=generate_report))
    scan_progress.finish()

    combined_modified = []
    combined_deleted = []
    combined_new = []
    combined_diffs = {}
    combined_metadata = {}
    report_paths = []

    for result in results:
        if not result.get("success"):
            continue
        combined_modified.extend(result["modified_files"])
        combined_deleted.extend(result["deleted_files"])
        combined_new.extend(result["new_files"])
        combined_diffs.update(result.get("text_differences", {}))
        combined_metadata.update(result.get("file_metadata", {}))
        if result.get("report_path"):
            report_paths.append(result["report_path"])

    if monitor_id and len(results) == 1:
        return results[0]

    primary = results[0] if results else {"success": False, "message": "Check failed."}
    return {
        "success": any(result.get("success") for result in results),
        "folder_path": primary.get("folder_path", ""),
        "monitors_checked": len(results),
        "modified_files": combined_modified,
        "deleted_files": combined_deleted,
        "new_files": combined_new,
        "text_differences": combined_diffs,
        "file_metadata": combined_metadata,
        "report_path": report_paths[-1] if report_paths else None,
        "report_paths": report_paths,
        "monitor_results": results,
        "auto_check": not generate_report,
    }


def check_integrity():
    result = run_integrity_check()
    if not result["success"]:
        print(result["message"])
        return
    print(result)
