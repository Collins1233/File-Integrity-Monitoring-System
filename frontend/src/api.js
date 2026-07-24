/**
 * API connection for dev and production.
 * Dev: tries Vite proxy first, then direct http://127.0.0.1:8000 (Windows fallback).
 * Prod: same-origin on port 8000.
 */
export let API_BASE = '';

export const API_CONNECTION_HELP =
  'API not reachable. From the project root run: npm run install:all then npm run dev. Keep that terminal open (you must see both [api] and [web]). Do not run only the frontend folder.';

function devCandidates() {
  return [
    '',
    'http://127.0.0.1:8000',
    `http://${window.location.hostname}:8000`,
  ];
}

export async function resolveApiBase() {
  if (!import.meta.env.DEV) {
    API_BASE = '';
    return API_BASE;
  }

  for (const base of devCandidates()) {
    try {
      const res = await fetch(`${base}/api/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        API_BASE = base;
        return API_BASE;
      }
    } catch {
      // try next candidate
    }
  }

  API_BASE = '';
  return API_BASE;
}

export function isNetworkError(err) {
  return err instanceof TypeError && /failed to fetch|network|load failed/i.test(String(err.message));
}
