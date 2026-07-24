# File Integrity Monitoring System

Python API + React dashboard for monitoring file integrity across folders and selected files.

## Project layout

```
File-Integrity-Monitoring-System/
├── backend/          # Python API (FastAPI)
├── frontend/         # React + Vite UI
├── demo_files/       # Sample data for testing
├── package.json      # Root dev scripts (run from here)
└── README.md
```

Runtime data (baseline, logs, reports) is stored at the repository root.

## Quick start

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

## Requirements

- Python 3.10+
- Node.js 18+
