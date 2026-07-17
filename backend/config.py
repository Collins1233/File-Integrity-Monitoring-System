"""
===========================================================
FILE INTEGRITY MONITORING SYSTEM CONFIGURATION
===========================================================
"""

import os

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_ROOT)

APP_NAME = "File Integrity Monitoring System"
APP_VERSION = "2.0.0"
WINDOW_TITLE = "File Integrity Monitoring System"

BASELINE_FILE = os.path.join(PROJECT_ROOT, "baseline.json")
BASELINE_FOLDER = os.path.join(PROJECT_ROOT, "baseline_files")
SETTINGS_FILE = os.path.join(PROJECT_ROOT, "settings.json")

REPORT_FOLDER = os.path.join(PROJECT_ROOT, "reports")
MAX_REPORTS_RETAINED = 5
REPORT_TITLE = "FILE INTEGRITY MONITOR REPORT"

LOG_FILE = os.path.join(PROJECT_ROOT, "fim_log.txt")

HASH_ALGORITHM = "sha256"
BUFFER_SIZE = 4096
HASH_ONLY_SIZE_BYTES = 1048576

# Readable text / code files (content snapshot stored at scan time)
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".log",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".htm", ".css", ".scss",
    ".json", ".xml", ".yaml", ".yml", ".ini", ".cfg", ".conf",
    ".sql", ".sh", ".bat", ".ps1", ".env",
}

OFFICE_FILE_TYPES = [".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt"]

PDF_EXTENSIONS = [".pdf"]

IMAGE_EXTENSIONS = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tif", ".tiff",
]

ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"]

SUPPORTED_FILE_TYPES = {
    ".txt": "Text File",
    ".md": "Markdown",
    ".csv": "CSV Spreadsheet",
    ".log": "Log File",
    ".rtf": "Rich Text Document",
    ".py": "Python Script",
    ".js": "JavaScript",
    ".jsx": "React JavaScript",
    ".ts": "TypeScript",
    ".tsx": "React TypeScript",
    ".html": "HTML Document",
    ".htm": "HTML Document",
    ".css": "Stylesheet",
    ".scss": "SCSS Stylesheet",
    ".json": "JSON Data",
    ".xml": "XML Document",
    ".yaml": "YAML Data",
    ".yml": "YAML Data",
    ".ini": "Configuration File",
    ".cfg": "Configuration File",
    ".conf": "Configuration File",
    ".sql": "SQL Script",
    ".sh": "Shell Script",
    ".bat": "Batch Script",
    ".ps1": "PowerShell Script",
    ".env": "Environment File",
    ".docx": "Microsoft Word Document",
    ".doc": "Word Document (Legacy)",
    ".xlsx": "Microsoft Excel Workbook",
    ".xls": "Excel Spreadsheet (Legacy)",
    ".pptx": "Microsoft PowerPoint Presentation",
    ".ppt": "PowerPoint (Legacy)",
    ".pdf": "PDF Document",
    ".png": "PNG Image",
    ".jpg": "JPEG Image",
    ".jpeg": "JPEG Image",
    ".gif": "GIF Image",
    ".webp": "WebP Image",
    ".svg": "SVG Image",
    ".bmp": "Bitmap Image",
    ".ico": "Icon File",
    ".tif": "TIFF Image",
    ".tiff": "TIFF Image",
    ".zip": "ZIP Archive",
    ".rar": "RAR Archive",
    ".7z": "7-Zip Archive",
    ".tar": "TAR Archive",
    ".gz": "GZIP Archive",
    ".bz2": "BZIP2 Archive",
}

# File types whose baseline copies are stored for restore / diff
BACKUP_FILE_TYPES = sorted(set(
    list(TEXT_EXTENSIONS) + OFFICE_FILE_TYPES + PDF_EXTENSIONS + IMAGE_EXTENSIONS + [".rtf"]
))

PDF_AUTHOR = "File Integrity Monitoring System"
PDF_CREATOR = "Python ReportLab"

WINDOW_WIDTH = 900
WINDOW_HEIGHT = 650

ENABLE_NOTIFICATIONS = True
ENABLE_REALTIME_MONITORING = True
MONITORING_INTERVAL_SECONDS = 1200
ENABLE_SHAREPOINT_MONITORING = False
ENABLE_EMAIL_ALERTS = False
