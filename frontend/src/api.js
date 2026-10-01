/**
 * API connection for dev, production, and Vercel Cloud Preview / Showcase Mode.
 * Dev: tries Vite proxy first, then direct http://127.0.0.1:8000 (Windows fallback).
 * Prod: same-origin on port 8000 or custom VITE_API_URL.
 * Cloud Showcase (Vercel): automatically switches to interactive demonstration mode
 * with full HMAC-verified baselines, diff viewer, and responsive controls.
 */

import {
  DEMO_STATUS,
  DEMO_MONITORING,
  DEMO_ALERTS,
  DEMO_LOGS,
  DEMO_FILES,
  DEMO_REPORTS,
  DEMO_BROWSE_DIRECTORY,
} from './demoData';

export let API_BASE = '';

let isDemoMode = false;

// Clone demo data for active mutation in preview mode
const demoState = {
  status: JSON.parse(JSON.stringify(DEMO_STATUS)),
  monitoring: JSON.parse(JSON.stringify(DEMO_MONITORING)),
  alerts: JSON.parse(JSON.stringify(DEMO_ALERTS)),
  logs: JSON.parse(JSON.stringify(DEMO_LOGS)),
  files: JSON.parse(JSON.stringify(DEMO_FILES)),
  reports: JSON.parse(JSON.stringify(DEMO_REPORTS)),
  settings: {
    monitoring_interval_seconds: 1200,
    monitoring_enabled: true,
    realtime_kernel_enabled: true,
    report_retention_max: 30,
    report_format: 'pdf',
    excluded_extensions: ['.tmp', '.bak', '.swp', '.log'],
  },
};

export function isDemoActive() {
  return isDemoMode;
}

export function setDemoActive(active) {
  isDemoMode = Boolean(active);
  if (typeof window !== 'undefined') {
    window.__FIM_DEMO_ACTIVE__ = isDemoMode;
  }
}

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
  // If user configured a custom remote backend URL (e.g., Render/Fly.io)
  const customUrl =
    (typeof localStorage !== 'undefined' && localStorage.getItem('fim_backend_url')) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL);

  if (customUrl) {
    API_BASE = customUrl.replace(/\/+$/, '');
    setDemoActive(false);
    return API_BASE;
  }

  // Detect cloud hosting environments (Vercel, Cloudflare Pages, GitHub Pages)
  const isCloudHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('.pages.dev') ||
      window.location.hostname.includes('github.io') ||
      window.location.hostname.includes('surge.sh'));

  // On cloud deployment without custom backend, activate Showcase Mode instantly
  if (isCloudHost) {
    API_BASE = '';
    setDemoActive(true);
    return API_BASE;
  }

  // Local environment: test available candidate ports
  for (const base of devCandidates()) {
    try {
      const res = await fetch(`${base}/api/status`, {
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) {
        const data = await res.clone().json().catch(() => ({}));
        if (data.app_version || data.has_baseline !== undefined) {
          API_BASE = base;
          setDemoActive(false);
          return API_BASE;
        }
      }
    } catch {
      // try next candidate
    }
  }

  // Fallback: If no local backend is online, seamlessly switch to Showcase Mode
  API_BASE = '';
  setDemoActive(true);
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

function mockJsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      'Content-Type': 'application/json',
      'X-FIM-Cloud-Preview': 'true',
    },
  });
}

export function handleMockApiRequest(rawUrl, options = {}) {
  let pathname = '';
  let searchParams = new URLSearchParams();
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    pathname = parsed.pathname;
    searchParams = parsed.searchParams;
  } catch {
    pathname = rawUrl;
  }

  const method = (options.method || 'GET').toUpperCase();

  // 1. /api/status
  if (pathname === '/api/status') {
    return mockJsonResponse(demoState.status);
  }

  // 2. /api/baseline/verify
  if (pathname === '/api/baseline/verify') {
    return mockJsonResponse({
      status: 'VALID',
      is_valid: true,
      algorithm: 'HMAC-SHA256',
      tamper_detected: false,
    });
  }

  // 3. /api/monitoring/status
  if (pathname === '/api/monitoring/status') {
    return mockJsonResponse(demoState.monitoring);
  }

  // 4. /api/monitoring/alerts/acknowledge
  if (pathname === '/api/monitoring/alerts/acknowledge') {
    demoState.alerts = [];
    demoState.monitoring.pending_alert_count = 0;
    return mockJsonResponse({ success: true, message: 'Alerts acknowledged' });
  }

  // 5. /api/monitoring/alerts
  if (pathname === '/api/monitoring/alerts') {
    return mockJsonResponse({ alerts: demoState.alerts });
  }

  // 6. /api/monitoring/toggle
  if (pathname === '/api/monitoring/toggle') {
    demoState.monitoring.active = !demoState.monitoring.active;
    demoState.monitoring.enabled = demoState.monitoring.active;
    demoState.logs.unshift({
      timestamp: new Date().toTimeString().slice(0, 8),
      message: `[WATCHDOG] Monitoring state toggled to ${demoState.monitoring.active ? 'ACTIVE' : 'PAUSED'}.`,
      type: demoState.monitoring.active ? 'success' : 'warning',
    });
    return mockJsonResponse({ success: true, active: demoState.monitoring.active });
  }

  // 7. /api/monitoring/check-now
  if (pathname === '/api/monitoring/check-now') {
    demoState.logs.unshift({
      timestamp: new Date().toTimeString().slice(0, 8),
      message: '[MANUAL CHECK] Immediate integrity audit executed. 1 change confirmed.',
      type: 'warning',
    });
    return mockJsonResponse(demoState.monitoring.last_result);
  }

  // 8. /api/reports/:filename/preview or /api/reports/:filename or /api/reports
  if (pathname.startsWith('/api/reports')) {
    if (pathname.endsWith('/preview')) {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>FIMS Audit Report Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; margin: 0; }
    .card { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem; max-width: 720px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { color: #38bdf8; margin-top: 0; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid #4ade80; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; font-size: 13px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    th { color: #94a3b8; }
    code { background: #334155; padding: 2px 6px; border-radius: 4px; color: #f1f5f9; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>🛡️ FIMS Integrity Audit Report</h2>
      <span class="badge">HMAC-SHA256 VERIFIED</span>
    </div>
    <p style="color:#94a3b8; font-size:13px;">Generated automatically by File Integrity Monitoring System Cloud Preview.</p>
    <table>
      <tr><th>Target Scope</th><td><code>/production/secure_configs</code></td></tr>
      <tr><th>Audit Status</th><td><strong style="color:#f59e0b;">1 Modified File Detected</strong></td></tr>
      <tr><th>Monitored Baseline</th><td>24 files cryptographically signed</td></tr>
      <tr><th>Affected File</th><td><code>/production/secure_configs/database.yml</code></td></tr>
      <tr><th>Timestamp</th><td>2026-10-01 15:10:00 UTC</td></tr>
    </table>
  </div>
</body>
</html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (method === 'DELETE') {
      const filename = decodeURIComponent(pathname.replace('/api/reports/', ''));
      demoState.reports = demoState.reports.filter(r => r.filename !== filename);
      return mockJsonResponse({ success: true, message: 'Report deleted' });
    }

    if (pathname === '/api/reports') {
      return mockJsonResponse({ reports: demoState.reports });
    }

    // Direct download
    return new Response('Mock FIMS Report Data', {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="fim_demo_report.pdf"',
      },
    });
  }

  // 9. /api/logs/export
  if (pathname === '/api/logs/export') {
    const format = searchParams.get('format') || 'csv';
    if (format === 'json') {
      return new Response(JSON.stringify(demoState.logs, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const csv = 'Timestamp,Type,Message\n' + demoState.logs.map(l => `"${l.timestamp}","${l.type}","${l.message.replace(/"/g, '""')}"`).join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
  }

  // 10. /api/logs
  if (pathname === '/api/logs') {
    return mockJsonResponse({ logs: demoState.logs });
  }

  // 11. /api/files/restore
  if (pathname === '/api/files/restore') {
    demoState.files = demoState.files.map(f => ({ ...f, status: 'intact' }));
    demoState.alerts = [];
    demoState.monitoring.pending_alert_count = 0;
    demoState.monitoring.last_result = {
      ...demoState.monitoring.last_result,
      modified_files: [],
      text_differences: {},
    };
    demoState.logs.unshift({
      timestamp: new Date().toTimeString().slice(0, 8),
      message: '[RESTORE] /production/secure_configs/database.yml restored to baseline version.',
      type: 'success',
    });
    return mockJsonResponse({ success: true, message: 'File restored to baseline version.' });
  }

  // 12. /api/files/preview
  if (pathname === '/api/files/preview') {
    const version = searchParams.get('version') || 'current';
    const isBaseline = version === 'baseline';
    const content = isBaseline
      ? 'database:\n  adapter: postgresql\n  host: primary-db.internal.bank.net\n  port: 5432\n  pool: 25\n  sslmode: verify-full\n'
      : 'database:\n  adapter: postgresql\n  host: primary-db.internal.bank.net\n  port: 5432\n  pool: 50\n  sslmode: require\n';
    return mockJsonResponse({ text: content, version });
  }

  // 13. /api/files/content
  if (pathname === '/api/files/content') {
    const version = searchParams.get('version') || 'current';
    const isBaseline = version === 'baseline';
    const content = isBaseline
      ? 'database:\n  adapter: postgresql\n  host: primary-db.internal.bank.net\n  port: 5432\n  pool: 25\n  sslmode: verify-full\n'
      : 'database:\n  adapter: postgresql\n  host: primary-db.internal.bank.net\n  port: 5432\n  pool: 50\n  sslmode: require\n';
    return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
  }

  // 14. /api/files
  if (pathname === '/api/files') {
    const q = (searchParams.get('q') || '').toLowerCase();
    const filtered = q
      ? demoState.files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      : demoState.files;
    return mockJsonResponse({ files: filtered, total: filtered.length });
  }

  // 15. /api/scan/progress
  if (pathname === '/api/scan/progress') {
    return mockJsonResponse({ active: false, percent: 100, current: 24, total: 24, current_file: '' });
  }

  // 16. /api/monitors/folder or /api/monitors/files
  if (pathname === '/api/monitors/folder' || pathname === '/api/monitors/files') {
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch {}
    const folderPath = body.folder_path || body.folderPath || (body.file_paths && body.file_paths[0]) || '/production/new_scope';
    const newMon = {
      id: `mon-${Date.now().toString().slice(-4)}`,
      folder_path: folderPath,
      monitor_type: pathname.includes('files') ? 'files' : 'folder',
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      file_count: 5,
    };
    demoState.status.monitors.push(newMon);
    demoState.status.monitor_count = demoState.status.monitors.length;
    demoState.status.file_count += 5;
    demoState.logs.unshift({
      timestamp: new Date().toTimeString().slice(0, 8),
      message: `[MONITOR ADDED] New baseline established for ${folderPath} (5 files).`,
      type: 'success',
    });
    return mockJsonResponse({
      success: true,
      message: 'Monitor created successfully',
      monitor_id: newMon.id,
      file_count: 5,
      monitors: demoState.status.monitors,
    });
  }

  // 17. /api/monitors/active
  if (pathname === '/api/monitors/active') {
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch {}
    if (body.monitor_id) {
      demoState.status.active_monitor_id = body.monitor_id;
    }
    return mockJsonResponse({ success: true, active_monitor_id: demoState.status.active_monitor_id });
  }

  // 18. /api/monitors/:id (DELETE)
  if (pathname.startsWith('/api/monitors/') && method === 'DELETE') {
    const monId = decodeURIComponent(pathname.replace('/api/monitors/', ''));
    demoState.status.monitors = demoState.status.monitors.filter(m => m.id !== monId);
    demoState.status.monitor_count = demoState.status.monitors.length;
    return mockJsonResponse({
      success: true,
      message: 'Monitor deleted',
      monitors: demoState.status.monitors,
      active_monitor_id: demoState.status.monitors[0]?.id || null,
    });
  }

  // 19. /api/baseline/accept
  if (pathname === '/api/baseline/accept') {
    demoState.files = demoState.files.map(f => ({ ...f, status: 'intact' }));
    demoState.alerts = [];
    demoState.monitoring.pending_alert_count = 0;
    demoState.monitoring.last_result = {
      ...demoState.monitoring.last_result,
      modified_files: [],
      text_differences: {},
    };
    demoState.status.baseline_integrity = {
      is_valid: true,
      status: 'VALID',
      tamper_detected: false,
    };
    demoState.logs.unshift({
      timestamp: new Date().toTimeString().slice(0, 8),
      message: '[HMAC-SHA256] Baseline re-calculated and cryptographically signed.',
      type: 'success',
    });
    return mockJsonResponse({
      success: true,
      message: 'Baseline accepted and HMAC signature updated.',
      file_count: demoState.files.length,
    });
  }

  // 20. /api/browse-directory
  if (pathname === '/api/browse-directory') {
    return mockJsonResponse(DEMO_BROWSE_DIRECTORY);
  }

  // 21. /api/settings
  if (pathname === '/api/settings') {
    if (method === 'PUT' || method === 'POST') {
      try {
        const body = JSON.parse(options.body || '{}');
        demoState.settings = { ...demoState.settings, ...body };
      } catch {}
      return mockJsonResponse({
        success: true,
        message: 'Settings saved',
        settings: demoState.settings,
      });
    }
    return mockJsonResponse(demoState.settings);
  }

  // Fallback default response
  return mockJsonResponse({ success: true, message: 'Cloud preview mock response', demo: true });
}

// Global fetch hook to catch direct fetch() calls in components when in preview mode
if (typeof window !== 'undefined' && !window.__FIM_FETCH_HOOKED__) {
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
    if (isDemoActive() && (urlStr.includes('/api/') || urlStr.startsWith('/api/'))) {
      const mockRes = handleMockApiRequest(urlStr, init || {});
      if (mockRes) return mockRes;
    }
    return nativeFetch.apply(this, arguments);
  };
  window.__FIM_FETCH_HOOKED__ = true;
}

export async function apiFetch(url, options = {}) {
  if (isDemoActive() && (url.includes('/api/') || url.startsWith('/api/'))) {
    return handleMockApiRequest(url, options);
  }
  const authHeaders = getAuthHeaders();
  const mergedHeaders = {
    ...authHeaders,
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers: mergedHeaders });
}
