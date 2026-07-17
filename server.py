import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

# Import FIM system modules
from scanner import scan_folder
from baseline import BASELINE_FILE, load_baseline
from integrity import run_integrity_check
from monitor import monitor_service
from report import list_reports, delete_report_file, prune_old_reports
from config import MAX_REPORTS_RETAINED

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FIM_Server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    monitor_service.start()
    yield
    await monitor_service.stop()


app = FastAPI(title="File Integrity Monitor API", lifespan=lifespan)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FolderRequest(BaseModel):
    folder_path: str

class MonitoringToggleRequest(BaseModel):
    enabled: bool

class AcknowledgeAlertsRequest(BaseModel):
    alert_ids: Optional[list[int]] = None


def create_baseline_for_folder(folder_path: str) -> dict:
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    files = scan_folder(folder_path)

    baseline = {
        "folder_path": folder_path,
        "created_at": created_at,
        "files": files,
    }

    with open(BASELINE_FILE, "w", encoding="utf-8") as file:
        json.dump(baseline, file, indent=4)

    return {
        "success": True,
        "baseline_created": True,
        "folder_path": folder_path,
        "created_at": created_at,
        "file_count": len(files),
    }

@app.get("/api/status")
def get_status():
    baseline = load_baseline()
    if not baseline:
        return {
            "has_baseline": False,
            "folder_path": "",
            "created_at": "",
            "file_count": 0
        }
    
    return {
        "has_baseline": True,
        "folder_path": baseline.get("folder_path", ""),
        "created_at": baseline.get("created_at", ""),
        "file_count": len(baseline.get("files", {}))
    }

@app.post("/api/select-folder")
def select_folder():
    """Trigger native folder picker. Mac: AppleScript, Windows: PowerShell, Linux: zenity/kdialog."""
    import subprocess
    import platform

    os_name = platform.system()

    try:
        if os_name == "Darwin":  # macOS
            # AppleScript: always works from any thread, no tkinter restriction
            apple_script = (
                'tell application "System Events"\n'
                '    activate\n'
                'end tell\n'
                'set chosen to choose folder with prompt "Select the folder to monitor:"\n'
                'POSIX path of chosen'
            )
            result = subprocess.run(
                ["osascript", "-e", apple_script],
                capture_output=True,
                text=True,
                timeout=120
            )
            folder_path = result.stdout.strip()

        elif os_name == "Windows":
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms; '
                '$d = New-Object System.Windows.Forms.FolderBrowserDialog; '
                '$d.Description = "Select Directory to Monitor"; '
                'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }'
            )
            result = subprocess.run(
                ["powershell", "-NonInteractive", "-Command", ps_script],
                capture_output=True, text=True, timeout=120
            )
            folder_path = result.stdout.strip()

        else:  # Linux
            # Try zenity first, then kdialog
            try:
                result = subprocess.run(
                    ["zenity", "--file-selection", "--directory", "--title=Select Directory to Monitor"],
                    capture_output=True, text=True, timeout=120
                )
                folder_path = result.stdout.strip()
            except FileNotFoundError:
                result = subprocess.run(
                    ["kdialog", "--getexistingdirectory", "/", "--title", "Select Directory to Monitor"],
                    capture_output=True, text=True, timeout=120
                )
                folder_path = result.stdout.strip()

        if folder_path:
            try:
                baseline = create_baseline_for_folder(folder_path)
                return baseline
            except Exception as e:
                logger.error(f"Baseline creation failed after folder pick: {e}")
                raise HTTPException(status_code=500, detail=str(e))
        else:
            return {"folder_path": "", "info": "Folder selection was cancelled."}

    except subprocess.TimeoutExpired:
        return {"folder_path": "", "info": "Folder dialog timed out. Please try again."}
    except Exception as e:
        logger.error(f"Folder picker failed: {e}")
        return {"folder_path": "", "info": f"Could not open folder dialog: {e}"}


@app.post("/api/create-baseline")
def api_create_baseline(request: FolderRequest):
    folder_path = request.folder_path
    if not folder_path or not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail="Invalid folder path provided.")

    try:
        return create_baseline_for_folder(folder_path)
    except Exception as e:
        logger.error(f"Error creating baseline: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/check-integrity")
def api_check_integrity():
    try:
        result = run_integrity_check(generate_report=True)
        return result
    except Exception as e:
        logger.error(f"Error checking integrity: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/monitoring/check-now")
async def api_check_now():
    if not load_baseline():
        raise HTTPException(status_code=400, detail="No baseline found. Select a folder first.")

    result = await monitor_service.run_check(generate_report=True)
    if result is None:
        raise HTTPException(status_code=409, detail="A check is already running. Please wait.")
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Check failed."))
    return result


@app.get("/api/files")
def api_get_files():
    baseline = load_baseline()
    if not baseline:
        return {"folder_path": "", "files": []}

    folder_path = baseline.get("folder_path", "")
    files = []

    for path, info in baseline.get("files", {}).items():
        try:
            relative_path = os.path.relpath(path, folder_path)
        except ValueError:
            relative_path = path

        files.append({
            "name": os.path.basename(path),
            "path": path,
            "relative_path": relative_path,
            "size": info.get("size", 0),
            "extension": info.get("extension", ""),
            "file_type": info.get("file_type", "Unknown"),
            "last_modified": info.get("last_modified", ""),
            "is_text_file": info.get("is_text_file", False),
        })

    files.sort(key=lambda item: item["relative_path"].lower())
    return {"folder_path": folder_path, "files": files}


@app.get("/api/files/preview")
def api_preview_file(path: str):
    baseline = load_baseline()
    if not baseline:
        raise HTTPException(status_code=404, detail="No baseline found.")

    files = baseline.get("files", {})
    if path not in files:
        raise HTTPException(status_code=404, detail="File not found in monitored baseline.")

    info = files[path]
    preview = None
    previewable = False

    if info.get("is_text_file") and info.get("content_snapshot") is not None:
        preview = "".join(info["content_snapshot"])
        previewable = True

    return {
        "path": path,
        "name": os.path.basename(path),
        "preview": preview,
        "previewable": previewable,
        "file_type": info.get("file_type", "Unknown"),
        "size": info.get("size", 0),
        "last_modified": info.get("last_modified", ""),
    }


@app.get("/api/monitoring/status")
def api_monitoring_status():
    return monitor_service.get_status()

@app.get("/api/monitoring/alerts")
def api_monitoring_alerts():
    return {"alerts": monitor_service.get_alerts()}

@app.post("/api/monitoring/alerts/acknowledge")
def api_acknowledge_alerts(request: AcknowledgeAlertsRequest):
    cleared = monitor_service.acknowledge_alerts(request.alert_ids)
    return {"cleared": cleared}

@app.post("/api/monitoring/toggle")
def api_monitoring_toggle(request: MonitoringToggleRequest):
    monitor_service.set_enabled(request.enabled)
    return monitor_service.get_status()

@app.get("/api/reports")
def api_get_reports():
    prune_old_reports()
    reports = list_reports()
    return [
        {
            "filename": report["filename"],
            "created_at": report["created_at"],
            "size_bytes": report["size_bytes"],
        }
        for report in reports
    ]


@app.get("/api/reports/{filename}")
def api_download_report(filename: str):
    file_path = os.path.join("reports", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found.")
    return FileResponse(file_path, media_type="application/pdf", filename=filename)


@app.delete("/api/reports/{filename}")
def api_delete_report(filename: str):
    try:
        deleted = delete_report_file(filename)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    if not deleted:
        raise HTTPException(status_code=404, detail="Report file not found.")

    return {
        "success": True,
        "deleted": filename,
        "remaining": len(list_reports()),
        "max_retained": MAX_REPORTS_RETAINED,
    }

@app.get("/api/logs")
def api_get_logs():
    log_file = "fim_log.txt"
    if not os.path.exists(log_file):
        return {"logs": []}
    
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        # Parse log lines
        parsed_logs = []
        for line in lines:
            parts = line.strip().split(" - ", 1)
            if len(parts) == 2:
                parsed_logs.append({
                    "timestamp": parts[0],
                    "message": parts[1]
                })
            else:
                parsed_logs.append({
                    "timestamp": "",
                    "message": line.strip()
                })
        
        # Return last 200 logs
        return {"logs": parsed_logs[-200:]}
    except Exception as e:
        logger.error(f"Error reading logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Mount frontend build static directory
frontend_dist = os.path.abspath("frontend/dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:
    logger.warning("Frontend build directory ('frontend/dist') not found. Serving API only.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
