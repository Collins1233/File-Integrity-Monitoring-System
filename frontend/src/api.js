/**
 * In dev (Vite on port 5173), call the API directly on port 8000.
 * This is more reliable on Windows than relying on the Vite proxy alone.
 * In production (single server on 8000), use same-origin relative URLs.
 */
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8000' : '';
