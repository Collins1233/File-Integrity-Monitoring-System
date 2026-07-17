import os
from datetime import datetime

from hashing import calculate_hash
from config import SUPPORTED_FILE_TYPES
from settings_manager import load_settings
from scan_progress import scan_progress

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".log", ".py", ".js", ".html", ".css", ".json", ".xml", ".yaml", ".yml"}


def read_text_content(file_path):
    """Read file lines for snapshot storage. Returns [] if binary."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.readlines()
    except UnicodeDecodeError:
        try:
            with open(file_path, "r", encoding="latin-1") as f:
                return f.readlines()
        except Exception:
            return []
    except Exception:
        return []


def _should_skip_file(filename: str, excluded_extensions: list[str]) -> bool:
    extension = os.path.splitext(filename)[1].lower()
    if extension in excluded_extensions:
        return True
    if filename in excluded_extensions:
        return True
    return False


def scan_folder_with_options(folder_path, track_progress=False, operation="Scanning files"):
    settings = load_settings()
    excluded = [item.lower() for item in settings.get("excluded_extensions", [])]
    hash_only_enabled = settings.get("hash_only_enabled", True)
    hash_only_size = settings.get("hash_only_size_bytes", 1048576)

    file_data = {}
    pending_paths = []

    for root, _, files in os.walk(folder_path):
        for filename in files:
            if _should_skip_file(filename, excluded):
                continue
            pending_paths.append(os.path.join(root, filename))

    total = len(pending_paths)
    if track_progress:
        scan_progress.start(operation, total)

    for index, file_path in enumerate(pending_paths, start=1):
        if track_progress:
            scan_progress.update(index, total, file_path)

        try:
            print(f"Scanning: {file_path}")
            extension = os.path.splitext(file_path)[1].lower()
            file_size = os.path.getsize(file_path)
            is_text = extension in TEXT_EXTENSIONS

            use_hash_only = hash_only_enabled and file_size >= hash_only_size
            content_snapshot = []
            if is_text and not use_hash_only:
                content_snapshot = read_text_content(file_path)

            file_info = {
                "hash": calculate_hash(file_path),
                "extension": extension,
                "file_type": SUPPORTED_FILE_TYPES.get(extension, "Unsupported File"),
                "size": file_size,
                "last_modified": datetime.fromtimestamp(
                    os.path.getmtime(file_path)
                ).strftime("%Y-%m-%d %H:%M:%S"),
                "is_text_file": is_text,
                "content_snapshot": content_snapshot,
                "hash_only": use_hash_only,
            }

            file_data[file_path] = file_info

        except PermissionError:
            print(f"Permission denied: {file_path}")
        except Exception as error:
            print(f"Could not scan {file_path}: {error}")

    if track_progress:
        scan_progress.finish()

    return file_data


def scan_folder(folder_path):
    return scan_folder_with_options(folder_path)
