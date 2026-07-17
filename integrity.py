import os
from baseline import load_baseline
from scanner import scan_folder
from logger import save_log
from textdiff import compare_text, format_text_change
from report import generate_pdf_report


def run_integrity_check(generate_report=True):
    baseline = load_baseline()

    if baseline is None:
        return {
            "success": False,
            "message": "No baseline found. Please create a baseline first."
        }

    folder_path = baseline["folder_path"]

    if not os.path.isdir(folder_path):
        return {
            "success": False,
            "message": f"The original monitored folder no longer exists: {folder_path}"
        }

    old_files = baseline["files"]
    current_files = scan_folder(folder_path)

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

            # If this is a text file and we have the original content snapshot, diff it
            if old_info.get("is_text_file") and old_info.get("content_snapshot") is not None:
                old_lines = old_info.get("content_snapshot", [])

                # Read current file content fresh from disk
                from textdiff import read_text_file
                new_lines = read_text_file(file_path)

                differences = format_text_change(old_lines, new_lines)

                if differences["summary"]["total_changes"] > 0:
                    text_differences[file_path] = differences

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
        f"[SUMMARY] Modified: {len(modified_files)}, "
        f"Deleted: {len(deleted_files)}, "
        f"New: {len(new_files)}"
    )

    report_path = None
    if generate_report:
        report_path = generate_pdf_report(
            folder_path,
            modified_files,
            deleted_files,
            new_files,
            text_differences
        )
        save_log(f"[REPORT GENERATED] {report_path}")
    else:
        save_log("[AUTO CHECK] Background scan completed (no PDF generated).")

    return {
        "success": True,
        "folder_path": folder_path,
        "modified_files": modified_files,
        "deleted_files": deleted_files,
        "new_files": new_files,
        "text_differences": text_differences,
        "report_path": report_path,
        "auto_check": not generate_report,
    }


def check_integrity():
    result = run_integrity_check()

    if not result["success"]:
        print(result["message"])
        return

    print("\n========================================")
    print("Integrity Check Results")
    print("========================================")

    modified_files = result["modified_files"]
    deleted_files = result["deleted_files"]
    new_files = result["new_files"]
    text_differences = result["text_differences"]

    if not modified_files and not deleted_files and not new_files:
        print("[NO CHANGE] All files are intact.")
    else:
        for file_path in modified_files:
            print(f"[MODIFIED] {file_path}")

            if file_path in text_differences:
                print("\nExact Text Changes")
                print("----------------------------------------")
                diff = text_differences[file_path]
                if isinstance(diff, dict):
                    print("Before:")
                    for line in diff.get("before", []):
                        print(f"  {line}")
                    print("After:")
                    for line in diff.get("after", []):
                        print(f"  {line}")
                else:
                    for line in diff:
                        print(line)

        for file_path in deleted_files:
            print(f"[DELETED] {file_path}")

        for file_path in new_files:
            print(f"[NEW FILE] {file_path}")

    total_changes = len(modified_files) + len(deleted_files) + len(new_files)

    print("\nSummary")
    print("----------------------------------------")
    print(f"Modified Files : {len(modified_files)}")
    print(f"Deleted Files  : {len(deleted_files)}")
    print(f"New Files      : {len(new_files)}")
    print(f"Total Changes  : {total_changes}")
    print(f"PDF Report     : {result['report_path']}")
    print("========================================")