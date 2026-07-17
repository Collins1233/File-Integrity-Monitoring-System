"""
===========================================================
FILE INTEGRITY MONITORING SYSTEM CONFIGURATION
===========================================================

This file contains all project-wide settings.

Every module should import values from here instead
of hardcoding them.

Example:

from config import BASELINE_FILE
from config import SUPPORTED_FILE_TYPES
"""

# =========================================================
# APPLICATION INFORMATION
# =========================================================

APP_NAME = "File Integrity Monitoring System"
APP_VERSION = "1.0.0"

WINDOW_TITLE = "File Integrity Monitoring System"

# =========================================================
# BASELINE SETTINGS
# =========================================================

BASELINE_FILE = "baseline.json"
BASELINE_FOLDER = "baseline_files"

# =========================================================
# REPORT SETTINGS
# =========================================================

REPORT_FOLDER = "reports"
MAX_REPORTS_RETAINED = 5
REPORT_TITLE = "FILE INTEGRITY MONITOR REPORT"

# =========================================================
# LOG SETTINGS
# =========================================================

LOG_FILE = "fim_log.txt"

# =========================================================
# HASH SETTINGS
# =========================================================

HASH_ALGORITHM = "sha256"

# Read files in 4 KB chunks while hashing
BUFFER_SIZE = 4096

# =========================================================
# SUPPORTED FILE TYPES
# =========================================================

SUPPORTED_FILE_TYPES = {

    ".txt": "Text File",

    ".docx": "Microsoft Word Document",

    ".xlsx": "Microsoft Excel Workbook",

    ".pptx": "Microsoft PowerPoint Presentation"

}

# =========================================================
# OFFICE DOCUMENT TYPES
# =========================================================

OFFICE_FILE_TYPES = [

    ".docx",

    ".xlsx",

    ".pptx"

]

# =========================================================
# FILE TYPES THAT SHOULD BE BACKED UP
# =========================================================

# These are the file types whose original copies
# will be stored inside the baseline_files folder.

BACKUP_FILE_TYPES = [

    ".txt",

    ".docx",

    ".xlsx",

    ".pptx"

]

# =========================================================
# PDF REPORT SETTINGS
# =========================================================

PDF_AUTHOR = "File Integrity Monitoring System"

PDF_CREATOR = "Python ReportLab"

# =========================================================
# GUI SETTINGS
# =========================================================

WINDOW_WIDTH = 900
WINDOW_HEIGHT = 650

# =========================================================
# FUTURE FEATURES
# =========================================================

ENABLE_NOTIFICATIONS = True
ENABLE_REALTIME_MONITORING = True

# Background integrity check interval (seconds). 1200 = 20 minutes.
MONITORING_INTERVAL_SECONDS = 1200
ENABLE_SHAREPOINT_MONITORING = False
ENABLE_EMAIL_ALERTS = False

# =========================================================
# END OF CONFIGURATION
# =========================================================