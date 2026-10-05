/**
 * API connection for development, local production, and cloud hosting.
 * Dev: probes Vite proxy and direct http://127.0.0.1:8000.
 * Prod / Cloud: same-origin on port 8000 or custom VITE_API_URL.
 */
export let API_BASE = '';

export const API_CONNECTION_HELP =
  'API not reachable. Ensure the FIMS backend server is running (e.g. npm run dev locally, or check your cloud service logs).';

function devCandidates() {
  return [
    '',
    'http://127.0.0.1:8000',
    `http://${window.location.hostname}:8000`,
  ];
}

export async function resolveApiBase() {
  const customUrl =
    (typeof localStorage !== 'undefined' && localStorage.getItem('fim_backend_url')) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL);

  if (customUrl) {
    API_BASE = customUrl.replace(/\/+$/, '');
    return API_BASE;
  }

  if (!import.meta.env.DEV) {
    API_BASE = '';
    return API_BASE;
  }

  for (const base of devCandidates()) {
    try {
      const res = await fetch(`${base}/api/status`, {
        signal: AbortSignal.timeout(3000),
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

export function getStoredRole() {
  return localStorage.getItem('fim_user_role') || 'admin';
}

export function setStoredRole(role) {
  localStorage.setItem('fim_user_role', role);
}

export function getStoredApiKey() {
  return localStorage.getItem('fim_api_key') || '';
}

export function setStoredApiKey(key) {
  localStorage.setItem('fim_api_key', key);
}

export function getAuthHeaders() {
  const apiKey = getStoredApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

export async function apiFetch(url, options = {}) {
  const apiKey = getStoredApiKey();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const baseHeaders = {};
  if (!isFormData) {
    baseHeaders['Content-Type'] = 'application/json';
  }
  if (apiKey) {
    baseHeaders['X-API-Key'] = apiKey;
  }
  const mergedHeaders = {
    ...baseHeaders,
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers: mergedHeaders });
}
