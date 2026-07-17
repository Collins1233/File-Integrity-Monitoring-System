import os
import json
import shutil
from datetime import datetime

from scanner import scan_folder_with_options
from baseline_store import add_monitor, legacy_load_baseline
from config import BASELINE_FILE, BASELINE_FOLDER, BACKUP_FILE_TYPES


def load_baseline():
    return legacy_load_baseline()


def backup_file(file_path, monitored_folder):
    relative_path = os.path.relpath(file_path, monitored_folder)
    destination = os.path.join(BASELINE_FOLDER, relative_path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copy2(file_path, destination)
    return destination


def create_baseline():
    folder_path = input("\nEnter the full folder path to monitor: ").strip().strip('"').strip("'")
    if not os.path.isdir(folder_path):
        print("\nFolder does not exist.")
        return

    monitor = add_monitor(folder_path)
    print("\n========================================")
    print("Baseline Created Successfully")
    print("========================================")
    print(f"Folder Monitored : {monitor['folder_path']}")
    print(f"Files Scanned    : {len(monitor['files'])}")
    print(f"Baseline File    : {BASELINE_FILE}")
    print(f"Created On       : {monitor['created_at']}")
    print("========================================")
