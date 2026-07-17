import os
from datetime import datetime

from hashing import calculate_hash
from config import SUPPORTED_FILE_TYPES

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


def scan_folder(folder_path):
    """
    Scans a folder and collects metadata for every file.

    The scanner only gathers information.
    It does NOT compare files or create reports.
    """

    file_data = {}

    for root, folders, files in os.walk(folder_path):

        for filename in files:

            file_path = os.path.join(root, filename)

            try:

                print(f"Scanning: {file_path}")

                extension = os.path.splitext(file_path)[1].lower()

                is_text = extension in TEXT_EXTENSIONS
                content_snapshot = read_text_content(file_path) if is_text else []

                file_info = {

                    "hash": calculate_hash(file_path),

                    "extension": extension,

                    "file_type": SUPPORTED_FILE_TYPES.get(
                        extension,
                        "Unsupported File"
                    ),

                    "size": os.path.getsize(file_path),

                    "last_modified": datetime.fromtimestamp(
                        os.path.getmtime(file_path)
                    ).strftime("%Y-%m-%d %H:%M:%S"),

                    "is_text_file": is_text,

                    "content_snapshot": content_snapshot

                }

                file_data[file_path] = file_info

            except PermissionError:

                print(f"Permission denied: {file_path}")

            except Exception as error:

                print(f"Could not scan {file_path}: {error}")

    return file_data