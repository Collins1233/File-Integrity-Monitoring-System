import os
import json
import shutil
from datetime import datetime

from scanner import scan_folder
from config import (
    BASELINE_FILE,
    BASELINE_FOLDER,
    BACKUP_FILE_TYPES
)


def backup_file(file_path, monitored_folder):
    """
    Copies a supported file into the baseline folder
    while preserving the original folder structure.
    """

    # Example:
    # monitored_folder = C:\FIM Test
    # file_path        = C:\FIM Test\Finance\Payroll.xlsx
    #
    # relative_path becomes:
    # Finance\Payroll.xlsx

    relative_path = os.path.relpath(
        file_path,
        monitored_folder
    )

    destination = os.path.join(
        BASELINE_FOLDER,
        relative_path
    )

    # Create any missing folders
    os.makedirs(
        os.path.dirname(destination),
        exist_ok=True
    )

    shutil.copy2(
        file_path,
        destination
    )

    return destination


def create_baseline():

    folder_path = input(
        "\nEnter the full folder path to monitor: "
    ).strip().strip('"').strip("'")

    if not os.path.isdir(folder_path):
        print("\nFolder does not exist.")
        return

    created_at = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    print("\nCreating baseline...")

    # -----------------------------------
    # Scan the monitored folder
    # -----------------------------------

    files = scan_folder(folder_path)

    # -----------------------------------
    # Remove old baseline copies
    # -----------------------------------

    if os.path.exists(BASELINE_FOLDER):
        shutil.rmtree(BASELINE_FOLDER)

    os.makedirs(BASELINE_FOLDER)

    # -----------------------------------
    # Backup supported files
    # -----------------------------------

    for file_path in files:

        extension = files[file_path]["extension"]

        if extension in BACKUP_FILE_TYPES:

            backup_location = backup_file(
                file_path,
                folder_path
            )

            files[file_path]["baseline_copy"] = backup_location

    # -----------------------------------
    # Build the baseline dictionary
    # -----------------------------------

    baseline = {

        "folder_path": folder_path,

        "created_at": created_at,

        "files": files

    }

    # -----------------------------------
    # Save baseline.json
    # -----------------------------------

    with open(
        BASELINE_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            baseline,
            file,
            indent=4
        )

    print("\n========================================")
    print("Baseline Created Successfully")
    print("========================================")
    print(f"Folder Monitored : {folder_path}")
    print(f"Files Scanned    : {len(files)}")
    print(f"Baseline File    : {BASELINE_FILE}")
    print(f"Backup Folder    : {BASELINE_FOLDER}")
    print(f"Created On       : {created_at}")
    print("========================================")


def load_baseline():

    if not os.path.exists(BASELINE_FILE):
        return None

    with open(
        BASELINE_FILE,
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)