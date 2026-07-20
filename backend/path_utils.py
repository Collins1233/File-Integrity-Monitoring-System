import os
import re
import sys
from urllib.parse import unquote, urlparse

from config import PROJECT_ROOT


def _clean_path_input(folder_path: str) -> str:
    if not folder_path:
        return ""
    cleaned = folder_path.strip().strip("\ufeff").strip("\r\n")
    cleaned = cleaned.strip('"').strip("'").strip("`").strip()

    if cleaned.lower().startswith("file:"):
        parsed = urlparse(cleaned)
        cleaned = unquote(parsed.path or "")
        if sys.platform == "win32" and re.match(r"^/[A-Za-z]:/", cleaned):
            cleaned = cleaned[1:]

    return cleaned.strip()


def _wsl_to_windows(path: str) -> str:
    """Convert /mnt/c/Users/... to C:\\Users\\... when running on Windows."""
    if not path.startswith("/mnt/"):
        return path
    parts = path.split("/")
    if len(parts) < 4:
        return path
    drive = parts[2].upper()
    rest = parts[3:]
    return drive + ":\\" + "\\".join(rest)


def _strip_trailing_separator(path: str) -> str:
    if not path:
        return path
    if sys.platform == "win32" and re.match(r"^[A-Za-z]:\\?$", path):
        return path
    return path.rstrip("\\/")


def _windows_extended_path(path: str) -> str:
    """Enable long-path checks on Windows."""
    if sys.platform != "win32":
        return path
    if path.startswith("\\\\?\\"):
        return path
    abs_path = os.path.abspath(path)
    if abs_path.startswith("\\\\"):
        return "\\\\?\\UNC\\" + abs_path[2:]
    return "\\\\?\\" + abs_path


def normalize_folder_path(folder_path: str) -> str:
    cleaned = _clean_path_input(folder_path)
    if not cleaned:
        return ""

    expanded = cleaned
    if sys.platform == "win32" and expanded.startswith("/mnt/"):
        expanded = _wsl_to_windows(expanded)

    expanded = os.path.expanduser(expanded)
    expanded = os.path.expandvars(expanded)

    if not os.path.isabs(expanded):
        expanded = os.path.join(PROJECT_ROOT, expanded)

    expanded = os.path.normpath(expanded)
    expanded = _strip_trailing_separator(expanded)
    return os.path.abspath(expanded)


def folder_exists(folder_path: str) -> bool:
    normalized = normalize_folder_path(folder_path)
    if not normalized:
        return False
    check_path = _windows_extended_path(normalized) if sys.platform == "win32" else normalized
    return os.path.isdir(check_path)


def resolve_folder_path(folder_path: str) -> dict:
    normalized = normalize_folder_path(folder_path)
    if not normalized:
        return {
            "normalized": "",
            "exists": False,
            "message": "Enter a folder path.",
        }

    exists = folder_exists(folder_path)
    message = "Folder found." if exists else f"Folder not found: {normalized}"
    hint = ""
    if not exists and sys.platform == "win32":
        hint = (
            " On Windows use a full path like C:\\Users\\You\\project\\demo_files "
            "or a folder name inside the project (e.g. demo_files)."
        )
        message += hint

    return {
        "normalized": normalized,
        "exists": exists,
        "message": message,
        "platform": sys.platform,
    }
