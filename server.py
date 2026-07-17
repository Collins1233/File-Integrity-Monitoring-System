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
            return {"folder_path": folder_path}
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
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        files = scan_folder(folder_path)
        
        baseline = {
            "folder_path": folder_path,
            "created_at": created_at,
            "files": files
        }
        
        with open(BASELINE_FILE, "w", encoding="utf-8") as file:
            json.dump(baseline, file, indent=4)
            
        return {
            "success": True,
            "folder_path": folder_path,
            "created_at": created_at,
            "file_count": len(files)
        }
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
    reports_dir = "reports"
    if not os.path.exists(reports_dir):
        return []
    
    files = []
    for f in os.listdir(reports_dir):
        if f.endswith(".pdf"):
            full_path = os.path.join(reports_dir, f)
            stat = os.stat(full_path)
            files.append({
                "filename": f,
                "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "size_bytes": stat.st_size
            })
    # Sort by created time descending
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files

@app.get("/api/reports/{filename}")
def api_download_report(filename: str):
    reports_dir = "reports"
    file_path = os.path.join(reports_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found.")
    return FileResponse(file_path, media_type="application/pdf", filename=filename)

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
