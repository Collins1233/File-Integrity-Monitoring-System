import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from config import REPORT_FOLDER, MAX_REPORTS_RETAINED


def list_reports():
    if not os.path.exists(REPORT_FOLDER):
        return []

    files = []
    for filename in os.listdir(REPORT_FOLDER):
        if not filename.endswith(".pdf"):
            continue
        full_path = os.path.join(REPORT_FOLDER, filename)
        stat = os.stat(full_path)
        files.append({
            "filename": filename,
            "path": full_path,
            "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "size_bytes": stat.st_size,
            "mtime": stat.st_mtime,
        })

    files.sort(key=lambda item: item["mtime"], reverse=True)
    return files


def prune_old_reports(keep=MAX_REPORTS_RETAINED):
    reports = list_reports()
    removed = []

    for report in reports[keep:]:
        os.remove(report["path"])
        removed.append(report["filename"])

    return removed


def delete_report_file(filename: str) -> bool:
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        raise ValueError("Invalid report filename.")

    if not filename.endswith(".pdf"):
        raise ValueError("Only PDF reports can be deleted.")

    file_path = os.path.join(REPORT_FOLDER, filename)
    if not os.path.exists(file_path):
        return False

    os.remove(file_path)
    return True


def generate_pdf_report(folder_path, modified_files, deleted_files, new_files, text_differences):
    if not os.path.exists(REPORT_FOLDER):
        os.makedirs(REPORT_FOLDER)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(REPORT_FOLDER, f"Integrity_Report_{timestamp}.pdf")

    pdf = canvas.Canvas(report_path, pagesize=A4)
    width, height = A4
    y = height - 50

    def write_line(text, font="Helvetica", size=10, spacing=18):
        nonlocal y

        if y < 60:
            pdf.showPage()
            y = height - 50

        pdf.setFont(font, size)
        pdf.drawString(50, y, str(text)[:110])
        y -= spacing

    write_line("FILE INTEGRITY MONITORING REPORT", "Helvetica-Bold", 16, 30)
    write_line(f"Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    write_line(f"Directory Monitored: {folder_path}", spacing=30)

    write_line("SUMMARY", "Helvetica-Bold", 13)
    write_line(f"Modified Files: {len(modified_files)}")
    write_line(f"Deleted Files : {len(deleted_files)}")
    write_line(f"New Files     : {len(new_files)}", spacing=30)

    total = len(modified_files) + len(deleted_files) + len(new_files)
    status = "No integrity violations detected." if total == 0 else "Integrity violations detected."
    write_line(f"Overall Status: {status}", "Helvetica-Bold", 11, 30)

    write_line("MODIFIED FILES", "Helvetica-Bold", 13)
    if modified_files:
        for file_path in modified_files:
            write_line(file_path)
    else:
        write_line("None")
    y -= 10

    write_line("DELETED FILES", "Helvetica-Bold", 13)
    if deleted_files:
        for file_path in deleted_files:
            write_line(file_path)
    else:
        write_line("None")
    y -= 10

    write_line("NEW FILES", "Helvetica-Bold", 13)
    if new_files:
        for file_path in new_files:
            write_line(file_path)
    else:
        write_line("None")
    y -= 10

    write_line("TEXT FILE DIFFERENCES", "Helvetica-Bold", 13)

    if text_differences:
        for file_path, diff_data in text_differences.items():
            write_line(f"File: {file_path}", "Helvetica-Bold", 10)

            if isinstance(diff_data, dict):
                write_line("Before:", "Helvetica-Bold", 9)
                for line in diff_data.get("before", []):
                    write_line(f"  {line}", "Courier", 8, 12)
                write_line("After:", "Helvetica-Bold", 9)
                for line in diff_data.get("after", []):
                    write_line(f"  {line}", "Courier", 8, 12)
            else:
                for line in diff_data:
                    write_line(line, "Courier", 8, 12)

            y -= 10
    else:
        write_line("No supported text file differences available.")

    pdf.save()
    prune_old_reports()

    return report_path
