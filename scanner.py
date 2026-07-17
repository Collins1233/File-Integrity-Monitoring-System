import os
from datetime import datetime

from hashing import calculate_hash
from config import SUPPORTED_FILE_TYPES


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
                    ).strftime("%Y-%m-%d %H:%M:%S")

                }

                file_data[file_path] = file_info

            except PermissionError:

                print(f"Permission denied: {file_path}")

            except Exception as error:

                print(f"Could not scan {file_path}: {error}")

    return file_data