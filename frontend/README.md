# Frontend

React + Vite UI for the File Integrity Monitoring System.

## Development

From the **repository root**:

```bash
npm run dev
```

Or frontend only:

```bash
npm run dev:web
```

The Vite dev server proxies `/api` requests to the Python backend at `http://127.0.0.1:8000`.

## Build

```bash
npm run build
```

Output goes to `frontend/dist` and is served by `backend/server.py` in production.
