"""Native folder/file pickers for desktop environments."""

from __future__ import annotations

import os
import platform
import subprocess
import sys

from config import BACKEND_ROOT


def _run_picker_script(script_name: str, timeout: int) -> str:
    script_path = os.path.join(BACKEND_ROOT, script_name)
    result = subprocess.run(
        [sys.executable, script_path],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0 and result.stderr.strip():
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip().strip("\ufeff").strip("\r")


def _pick_folder_windows(timeout: int) -> str:
    ps_script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
        '$d.Description = "Select Directory to Monitor"; '
        "$d.ShowNewFolderButton = $false; "
        'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }'
    )
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Sta",
            "-Command",
            ps_script,
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    folder_path = result.stdout.strip().strip("\ufeff").strip("\r")
    if folder_path:
        return folder_path
    if result.stderr.strip():
        raise RuntimeError(result.stderr.strip())
    return ""


def _pick_files_windows(timeout: int) -> list[str]:
    ps_script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$d = New-Object System.Windows.Forms.OpenFileDialog; "
        "$d.Multiselect = $true; "
        '$d.Title = "Select Files to Monitor"; '
        'if ($d.ShowDialog() -eq "OK") { $d.FileNames -join "`n" }'
    )
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Sta",
            "-Command",
            ps_script,
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    file_paths = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if file_paths:
        return file_paths
    if result.stderr.strip():
        raise RuntimeError(result.stderr.strip())
    return []


def pick_folder(timeout: int = 120) -> str:
    os_name = platform.system()
    if os_name == "Darwin":
        apple_script = (
            'tell application "System Events"\n'
            "    activate\n"
            "end tell\n"
            'set chosen to choose folder with prompt "Select the folder to monitor:"\n'
            "POSIX path of chosen"
        )
        result = subprocess.run(
            ["osascript", "-e", apple_script],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()

    if os_name == "Windows":
        try:
            folder_path = _pick_folder_windows(timeout)
            if folder_path:
                return folder_path
        except Exception:
            pass
        try:
            return _run_picker_script("win_folder_picker.py", timeout)
        except Exception:
            return ""

    try:
        result = subprocess.run(
            ["zenity", "--file-selection", "--directory", "--title=Select Directory to Monitor"],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()
    except FileNotFoundError:
        result = subprocess.run(
            [
                "kdialog",
                "--getexistingdirectory",
                "/",
                "--title",
                "Select Directory to Monitor",
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()


def pick_files(timeout: int = 120) -> list[str]:
    os_name = platform.system()
    if os_name == "Darwin":
        apple_script = (
            'tell application "System Events"\n'
            "    activate\n"
            "end tell\n"
            'set chosen to choose file with prompt "Select files to monitor:" with multiple selections allowed\n'
            'set output to ""\n'
            "repeat with f in chosen\n"
            '    set output to output & (POSIX path of f) & linefeed\n'
            "end repeat\n"
            "return output"
        )
        result = subprocess.run(
            ["osascript", "-e", apple_script],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    if os_name == "Windows":
        try:
            file_paths = _pick_files_windows(timeout)
            if file_paths:
                return file_paths
        except Exception:
            pass
        try:
            output = _run_picker_script("win_file_picker.py", timeout)
            return [line.strip() for line in output.splitlines() if line.strip()]
        except Exception:
            return []

    try:
        result = subprocess.run(
            [
                "zenity",
                "--file-selection",
                "--multiple",
                "--separator=|",
                "--title=Select Files to Monitor",
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return [part.strip() for part in result.stdout.split("|") if part.strip()]
    except FileNotFoundError:
        return []
