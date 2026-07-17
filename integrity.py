import os

from baseline_store import get_monitors, legacy_load_baseline as load_baseline
from scanner import scan_folder_with_options
from logger import save_log
from textdiff import read_text_file, format_text_change
from report import generate_pdf_report
from scan_progress import scan_progress
from config import OFFICE_FILE_TYPES
from comparators import compare_word, compare_excel, compare_powerpoint


def _build_office_diff(file_path, old_info):
    backup_path = old_info.get("baseline_copy")
    extension = old_info.get("extension")
    if not backup_path or not os.path.exists(backup_path):
        return None

    try:
        if extension == ".docx":
            diff_lines = compare_word(backup_path, file_path)
        elif extension == ".xlsx":
            diff_lines = compare_excel(backup_path, file_path)
        elif extension == ".pptx":
            diff_lines = compare_powerpoint(backup_path, file_path)
        else:
            return None

        if not diff_lines:
            return None

        return {
            "before": [line for line in diff_lines if line.startswith("-") or not line.startswith("+")],
            "after": [line for line in diff_lines if line.startswith("+") or not line.startswith("-")],
            "office_diff": diff_lines,
            "summary": {
                "lines_removed": len([line for line in diff_lines if line.startswith("-")]),
                "lines_added": len([line for line in diff_lines if line.startswith("+")]),
                "total_changes": len(diff_lines),
            },
            "preview_type": "office",
        }
    except Exception as error:
        save_log(f"[OFFICE DIFF ERROR] {file_path}: {error}")
        return None


def _compare_monitor(monitor, generate_report=True):
    folder_path = monitor["folder_path"]
    if not os.path.isdir(folder_path):
        return {
            "success": False,
            "monitor_id": monitor["id"],
            "message": f"The monitored folder no longer exists: {folder_path}",
        }

    old_files = monitor["files"]
    current_files = scan_folder_with_options(
        folder_path,
        track_progress=True,
        operation=f"Checking {os.path.basename(folder_path.rstrip('/'))}",
    )

    modified_files = []
    deleted_files = []
    new_files = []
    text_differences = {}

    for file_path in old_files:
        if file_path not in current_files:
            deleted_files.append(file_path)
        elif old_files[file_path]["hash"] != current_files[file_path]["hash"]:
            modified_files.append(file_path)
            old_info = old_files[file_path]

            if old_info.get("is_text_file") and old_info.get("content_snapshot") is not None:
                old_lines = old_info.get("content_snapshot", [])
                new_lines = read_text_file(file_path)
                differences = format_text_change(old_lines, new_lines)
                if differences["summary"]["total_changes"] > 0:
                    text_differences[file_path] = differences
            elif old_info.get("extension") in OFFICE_FILE_TYPES:
                office_diff = _build_office_diff(file_path, old_info)
                if office_diff:
                    text_differences[file_path] = office_diff

    for file_path in current_files:
        if file_path not in old_files:
            new_files.append(file_path)

    for file_path in modified_files:
        save_log(f"[MODIFIED] {file_path}")
    for file_path in deleted_files:
        save_log(f"[DELETED] {file_path}")
    for file_path in new_files:
        save_log(f"[NEW FILE] {file_path}")

    save_log(
        f"[SUMMARY] {folder_path} — Modified: {len(modified_files)}, "
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
    report_paths = []

    for result in results:
        if not result.get("success"):
            continue
        combined_modified.extend(result["modified_files"])
        combined_deleted.extend(result["deleted_files"])
        combined_new.extend(result["new_files"])
        combined_diffs.update(result.get("text_differences", {}))
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
