# File Integrity Monitoring System

Python API + React dashboard for monitoring file integrity across folders and selected files.

## Download for Windows (.exe)

Windows users can run FIMS without installing Node or Python.

### Recommended: installer

1. Open **[Releases](https://github.com/Collins1233/File-Integrity-Monitoring-System/releases)** (or download the Actions artifact)
2. Run **FIMS-Setup.exe**
3. Choose optional **Desktop icon** (Start Menu shortcut is always added)
4. Launch **FIMS** — the dashboard opens at `http://127.0.0.1:8000`

### Portable

Download **FIMS.exe** and double-click it (no install, no shortcuts).

Keep the app running while you use the dashboard. User data (baselines, logs, reports) is stored in `%LOCALAPPDATA%\FIMS`.

### Publish a new Windows build

From GitHub → **Actions** → **Build Windows EXE** → **Run workflow** (builds an artifact you can download).

Or create a version tag to publish a Release automatically:

```bash
git tag v2.0.1
git push origin v2.0.1
```

### Build the .exe yourself (Windows machine)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

Outputs:

- `dist\FIMS.exe` — portable
- `dist\FIMS-Setup.exe` — installer with Start Menu + optional Desktop icon

## Project layout

```
File-Integrity-Monitoring-System/
├── backend/          # Python API (FastAPI)
├── frontend/         # React + Vite UI
├── demo_files/       # Sample data for testing
├── FIMS.spec         # PyInstaller Windows packaging
├── installer/        # Inno Setup script (FIMS-Setup.exe)
├── package.json      # Root dev scripts (run from here)
└── README.md
```

Runtime data (baseline, logs, reports) is stored at the repository root in development, or in `%LOCALAPPDATA%\FIMS` for the packaged Windows app.

## Quick start (developers)

### 1. Install dependencies (one time)

```bash
# From the project root: installs Node + Python dependencies
npm run install:all
```

On **Windows**, install [Python 3.10+](https://www.python.org/downloads/) and check **“Add Python to PATH”** during setup. If `install:all` fails, run:

```bash
py -3 -m pip install -r backend/requirements.txt
```

### 2. Development

```bash
npm run dev
```

Open **http://localhost:5173**

This starts **both** the Python API (port 8000) and the React UI (port 5173). Do not run only `cd frontend && npm run dev`. That starts the UI without the API.

### 3. Production-style (single server)

Builds the UI and serves everything from the Python server:

```bash
npm start
```

Open **http://127.0.0.1:8000**

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + frontend dev servers together |
| `npm run dev:web` | Frontend only (Vite, port 5173) |
| `npm run dev:api` | Backend only (port 8000) |
| `npm run build` | Build frontend to `frontend/dist` |
| `npm start` | Build + run production server |
| `scripts/build-windows.ps1` | Build `FIMS.exe` + `FIMS-Setup.exe` on Windows |

## Requirements

- Python 3.10+
- Node.js 18+
