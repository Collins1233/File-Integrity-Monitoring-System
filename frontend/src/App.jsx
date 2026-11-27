import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AlertTriangle, X } from 'lucide-react';

import BootSequence, { shouldShowBoot } from './BootSequence';
import VersionGate from './VersionGate';
import OnboardingWizard from './OnboardingWizard';
import SettingsPanel from './SettingsPanel';
import ConfirmDialog from './ConfirmDialog';
import DirectoryBrowserModal from './DirectoryBrowserModal';
import ToastNotification from './ToastNotification';
import { formatAlertTitle, getAffectedFiles } from './alertUtils';

import {
  API_BASE,
  resolveApiBase,
  isNetworkError,
  API_CONNECTION_HELP,
  apiFetch,
  getStoredRole,
  setStoredRole,
  setStoredApiKey,
} from './api';

import TopBar from './fims/TopBar';
import DashboardPage from './fims/DashboardPage';
import FoldersPage from './fims/FoldersPage';
import ChangesPage from './fims/ChangesPage';
import AuditPage from './fims/AuditPage';
import FileEditor from './fims/FileEditor';
import HelpDialog from './fims/HelpDialog';
import FlagDialog from './fims/FlagDialog';
import TestingSandbox from './fims/TestingSandbox';
import { buildChangeList, buildStatusLookup } from './fims/changes';

const APP_ICON = `${typeof window !== 'undefined' ? window.location.origin : ''}/fim-logo.png`;
const DEV_SESSION_KEY = 'fim_dev_session';

function sanitizeFolderPath(rawPath) {
  return rawPath
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/[\r\n]+/g, '')
    .replace(/^file:\/\/\/?/i, '')
    .replace(/^["'`]|["'`]$/g, '');
}

const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
const FOLDER_PATH_PLACEHOLDER = IS_WINDOWS
  ? 'Or paste a path, e.g. C:\\Users\\You\\demo_files'
  : 'Or paste a path, e.g. /full/path/to/folder';

const FOLDER_HELP_TEXT = IS_WINDOWS
  ? 'Use Choose Folder to browse in File Explorer, or Choose Files to pick specific files. You can also paste a full path below.'
  : 'Use Choose Folder / Choose Files to browse, or paste a folder path below.';

function formatApiError(detail, fallback = 'Request failed') {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || item.message || JSON.stringify(item)).join(', ');
  }
  return fallback;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [status, setStatus] = useState({
    has_baseline: false,
    folder_path: '',
    created_at: '',
    file_count: 0,
  });

  const [folderPathInput, setFolderPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [folderLoading, setFolderLoading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [restoringPath, setRestoringPath] = useState(null);
  const [busyPath, setBusyPath] = useState(null);
  const [selectedChangePath, setSelectedChangePath] = useState(null);
  const [flaggedPaths, setFlaggedPaths] = useState(() => new Set());
  const [flagTarget, setFlagTarget] = useState(null);
  const [flagBusy, setFlagBusy] = useState(false);

  const [reports, setReports] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [monitoring, setMonitoring] = useState({
    enabled: true,
    active: false,
    interval_minutes: 20,
    is_checking: false,
    last_check_at: null,
    next_check_at: null,
    pending_alert_count: 0,
  });
  const [toasts, setToasts] = useState([]);
  const [monitoredFiles, setMonitoredFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [monitors, setMonitors] = useState([]);
  const [activeMonitorId, setActiveMonitorId] = useState(null);
  const [serverOnline, setServerOnline] = useState(true);
  const [scanProgress, setScanProgress] = useState({ active: false, percent: 0, current_file: '' });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('fim_dark_mode') === 'true');
  const [currentRole, setCurrentRole] = useState(() => getStoredRole());
  const [showBoot, setShowBoot] = useState(() => shouldShowBoot());
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('fim_onboarding_done'));
  const [previewReport, setPreviewReport] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'default')
  );

  const seenAlertIds = useRef(new Set());
  const devSessionRef = useRef(typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DEV_SESSION_KEY) || '' : '');
  const healthFailures = useRef(0);
  const folderPickerRef = useRef(null);
  const filesPickerRef = useRef(null);
  const busyRef = useRef(false);
  const confirmResolver = useRef(null);
  const [confirmState, setConfirmState] = useState(null);
  const [browserModalOpen, setBrowserModalOpen] = useState(false);
  const [browserModalMode, setBrowserModalMode] = useState('folder');
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editorFilePath, setEditorFilePath] = useState(null);

  const canAct = currentRole !== 'viewer';
  const isAdmin = currentRole === 'admin';

  // Flat changes list & lookup for fast status badge rendering
  const changes = useMemo(() => buildChangeList(checkResult), [checkResult]);
  const statusLookup = useMemo(() => buildStatusLookup(changes), [changes]);

  // Keep selected change valid
  useEffect(() => {
    if (changes.length > 0) {
      if (!selectedChangePath || !changes.some((c) => c.path === selectedChangePath)) {
        setSelectedChangePath(changes[0].path);
      }
    } else {
      setSelectedChangePath(null);
    }
  }, [changes, selectedChangePath]);

  const requestConfirm = useCallback((options) => new Promise((resolve) => {
    confirmResolver.current = resolve;
    setConfirmState({ ...options, open: true });
  }), []);

  const closeConfirm = useCallback((result) => {
    confirmResolver.current?.(result);
    confirmResolver.current = null;
    setConfirmState(null);
  }, []);

  const markServerOnline = useCallback(() => {
    healthFailures.current = 0;
    setServerOnline(true);
  }, []);

  const markServerFailure = useCallback(() => {
    if (busyRef.current) return;
    healthFailures.current += 1;
    if (healthFailures.current >= 2) {
      setServerOnline(false);
    }
  }, []);

  useEffect(() => {
    busyRef.current = Boolean(monitoring.is_checking || scanProgress.active || loading);
  }, [monitoring.is_checking, scanProgress.active, loading]);

  const addConsoleLog = useCallback((message, type = 'info') => {
    // Also prepend to systemLogs if appropriate
    const timestamp = new Date().toLocaleTimeString();
    setSystemLogs((prev) => [{ timestamp, message, type }, ...prev]);
  }, []);

  const addToast = useCallback((alert) => {
    setToasts((prev) => {
      if (prev.some((t) => t.id === alert.id)) return prev;
      return [...prev, alert];
    });

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const affected = getAffectedFiles(alert);
      const fileLine = affected.length
        ? affected.map((file) => file.name).join(', ')
        : 'Unknown file';

      new Notification('FIMS Alert', {
        body: `${formatAlertTitle(alert)}\n${fileLine}`,
        icon: APP_ICON,
        badge: APP_ICON,
        tag: `fim-alert-${alert.id}`,
      });
    }
  }, []);

  const dismissToast = async (alertId) => {
    setToasts((prev) => prev.filter((t) => t.id !== alertId));
    try {
      await apiFetch(`${API_BASE}/api/monitoring/alerts/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: [alertId] }),
      });
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  const dismissAllToasts = async () => {
    const ids = toasts.map((t) => t.id);
    setToasts([]);
    if (ids.length) {
      try {
        await apiFetch(`${API_BASE}/api/monitoring/alerts/acknowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alert_ids: ids }),
        });
      } catch (err) {
        console.error('Error acknowledging alerts:', err);
      }
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  };

  const handleRoleChange = (newRole) => {
    setStoredRole(newRole);
    setCurrentRole(newRole);
    if (newRole === 'viewer') {
      setStoredApiKey('fim_viewer_demo');
    } else if (newRole === 'analyst') {
      setStoredApiKey('fim_analyst_demo');
    } else if (newRole === 'auditor') {
      setStoredApiKey('fim_auditor_demo');
    } else {
      setStoredApiKey('');
    }
    window.location.reload();
  };

  // Fetch functions
  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      markServerOnline();

      const devSession = data.dev_session || '';
      if (devSession && devSessionRef.current && devSessionRef.current !== devSession) {
        setCheckResult(null);
        setToasts([]);
        setMonitoredFiles([]);
        setPreviewReport(null);
        setSystemLogs([]);
        seenAlertIds.current = new Set();
      }
      if (devSession) {
        devSessionRef.current = devSession;
        sessionStorage.setItem(DEV_SESSION_KEY, devSession);
      }

      setStatus(data);
      setMonitors(data.monitors || []);
      setActiveMonitorId(data.active_monitor_id || null);
    } catch (err) {
      markServerFailure();
      console.error('Error fetching status:', err);
    }
  }, [markServerOnline, markServerFailure]);

  const fetchReports = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/reports`);
      const data = await res.json();
      setReports(data || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/logs`);
      const data = await res.json();
      setSystemLogs(data.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchMonitoredFiles = async (monitorId = activeMonitorId) => {
    setFilesLoading(true);
    try {
      const query = monitorId ? `?monitor_id=${encodeURIComponent(monitorId)}` : '';
      const res = await apiFetch(`${API_BASE}/api/files${query}`);
      const data = await res.json();
      setMonitoredFiles(data.files || []);
    } catch (err) {
      console.error('Error fetching monitored files:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  const fetchMonitoring = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/monitoring/status`);
      if (!res.ok) throw new Error('offline');
      markServerOnline();
      const data = await res.json();
      setMonitoring(data);

      if (data.last_result?.success) {
        setCheckResult(data.last_result);
      }

      const alertsRes = await apiFetch(`${API_BASE}/api/monitoring/alerts`);
      const alertsData = await alertsRes.json();
      const alerts = alertsData.alerts || [];

      for (const alert of alerts) {
        if (!seenAlertIds.current.has(alert.id)) {
          seenAlertIds.current.add(alert.id);
          addToast(alert);
        }
      }
    } catch (err) {
      markServerFailure();
      console.error('Error fetching monitoring status:', err);
    }
  }, [addToast, markServerOnline, markServerFailure]);

  const fetchScanProgress = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/scan/progress`);
      if (res.ok) {
        markServerOnline();
        setScanProgress(await res.json());
      }
    } catch {
      // ignore transient poll errors
    }
  };

  const refreshMonitorState = async (monitorId) => {
    try {
      const res = await apiFetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      markServerOnline();
      setStatus(data);
      setMonitors(data.monitors || []);
      const nextActiveId = monitorId || data.active_monitor_id || null;
      setActiveMonitorId(nextActiveId);
      await fetchMonitoredFiles(nextActiveId);
    } catch (err) {
      markServerFailure();
      console.error('Error refreshing monitor state:', err);
    }
  };

  // Initial boot
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await resolveApiBase();
      if (cancelled) return;
      await fetchStatus();
      if (cancelled) return;
      fetchReports();
      fetchLogs();
      fetchMonitoring();
      fetchMonitoredFiles();
    }
    boot();

    const monitoringInterval = setInterval(fetchMonitoring, 2500);
    const healthInterval = setInterval(async () => {
      if (cancelled) return;
      await resolveApiBase();
      fetchStatus();
    }, 10000);
    const progressInterval = setInterval(fetchScanProgress, 1500);

    return () => {
      cancelled = true;
      clearInterval(monitoringInterval);
      clearInterval(healthInterval);
      clearInterval(progressInterval);
    };
  }, [fetchMonitoring, fetchStatus]);

  // Actions
  const handleCheckNow = async () => {
    setLoading(true);
    addConsoleLog('Running integrity scan…', 'info');
    try {
      const res = await apiFetch(`${API_BASE}/api/monitoring/check-now`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setCheckResult(data);
        const total = (data.modified_files || []).length + (data.deleted_files || []).length + (data.new_files || []).length;
        if (total === 0) {
          addConsoleLog('Scan complete: all files match the baseline.', 'success');
        } else {
          addConsoleLog(`Scan complete: ${total} change${total === 1 ? '' : 's'} detected.`, 'warning');
        }
        fetchReports();
        fetchLogs();
        fetchMonitoring();
      } else {
        if (data.tamper_detected) {
          setCheckResult(data);
          addConsoleLog(`Baseline tampering detected! ${data.message}`, 'danger');
        } else {
          addConsoleLog(`Scan failed: ${data.detail || data.message || 'Unknown error'}`, 'danger');
        }
      }
    } catch (err) {
      addConsoleLog(`Error running scan: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMonitoring = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/monitoring/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !monitoring.enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        addConsoleLog(`Access denied: ${data.detail || 'Insufficient permissions.'}`, 'danger');
        return;
      }
      setMonitoring(data);
      addConsoleLog(
        data.enabled ? 'Background monitoring enabled.' : 'Background monitoring paused.',
        data.enabled ? 'success' : 'warning'
      );
    } catch (err) {
      addConsoleLog(`Failed to toggle monitoring: ${err.message}`, 'danger');
    }
  };

  // Mark single file as safe (update baseline for this file only)
  const handleMarkFileSafe = async (change) => {
    const confirmed = await requestConfirm({
      title: 'Mark this change as safe?',
      message: `Accept the new version of "${change.name}" into the baseline? Future scans will compare against this snapshot.`,
      confirmLabel: 'Mark as Safe (Update Baseline)',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    setBusyPath(change.path);
    try {
      const res = await apiFetch(`${API_BASE}/api/baseline/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: change.path,
          monitor_id: activeMonitorId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`Marked safe & updated baseline for ${change.name}`, 'success');
        addToast({
          id: Date.now(),
          type: 'success',
          title: 'Baseline Updated',
          message: `${change.name} is now marked safe in the baseline.`,
        });
        if (data.last_result) {
          setCheckResult(data.last_result);
        } else if (checkResult) {
          const same = (p) => String(p).toLowerCase() === String(change.path).toLowerCase();
          setCheckResult({
            ...checkResult,
            modified_files: (checkResult.modified_files || []).filter((p) => !same(p)),
            deleted_files: (checkResult.deleted_files || []).filter((p) => !same(p)),
            new_files: (checkResult.new_files || []).filter((p) => !same(p)),
            text_differences: Object.fromEntries(
              Object.entries(checkResult.text_differences || {}).filter(([p]) => !same(p))
            ),
            file_metadata: Object.fromEntries(
              Object.entries(checkResult.file_metadata || {}).filter(([p]) => !same(p))
            ),
          });
        }
        fetchStatus();
        fetchMonitoredFiles();
        fetchLogs();
      } else {
        addConsoleLog(`Could not mark safe: ${data.detail || 'Request failed'}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error updating baseline: ${err.message}`, 'danger');
    } finally {
      setBusyPath(null);
    }
  };

  // Mark all changed files as safe (full baseline reset)
  const handleAcceptBaseline = async () => {
    const confirmed = await requestConfirm({
      title: 'Accept new baseline?',
      message: 'Accept all current files as the new baseline? Future scans will compare against this snapshot.',
      confirmLabel: 'Accept new baseline',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/baseline/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitor_id: activeMonitorId }),
      });
      const data = await res.json();
      if (res.ok) {
        addConsoleLog(`Baseline updated: ${data.file_count} files snapshotted.`, 'success');
        setCheckResult(null);
        fetchStatus();
        fetchMonitoredFiles();
        fetchLogs();
      } else {
        addConsoleLog(`Could not update baseline: ${data.detail}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error updating baseline: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Flag issue
  const handleFlagFile = async (note) => {
    if (!flagTarget) return;
    setFlagBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/files/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: flagTarget.path,
          note: note || '',
          status: flagTarget.status,
        }),
      });
      if (res.ok) {
        setFlaggedPaths((prev) => new Set([...prev, flagTarget.path]));
        addConsoleLog(`Flagged issue for ${flagTarget.name}: ${note || 'Recorded in audit log'}`, 'warning');
        addToast({
          id: Date.now(),
          type: 'warning',
          title: 'Issue Flagged',
          message: `${flagTarget.name} has been recorded in the audit log for review.`,
        });
        fetchLogs();
      }
    } catch (err) {
      addConsoleLog(`Error flagging file: ${err.message}`, 'danger');
    } finally {
      setFlagBusy(false);
      setFlagTarget(null);
    }
  };

  // Restore file
  const handleRestoreFile = async (path) => {
    const confirmed = await requestConfirm({
      title: 'Restore original file?',
      message: 'This will undo the changes and replace the current file with the baseline backup.',
      detail: path,
      confirmLabel: 'Restore original',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    setRestoringPath(path);
    try {
      const res = await apiFetch(`${API_BASE}/api/files/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, monitor_id: activeMonitorId }),
      });
      const data = await res.json();
      if (res.ok) {
        addConsoleLog(`Restored file from backup: ${path}`, 'success');
        fetchMonitoredFiles();
        if (data.last_result) {
          setCheckResult(data.last_result);
        } else if (checkResult) {
          const same = (p) => String(p).toLowerCase() === String(path).toLowerCase();
          setCheckResult({
            ...checkResult,
            modified_files: (checkResult.modified_files || []).filter((p) => !same(p)),
            deleted_files: (checkResult.deleted_files || []).filter((p) => !same(p)),
            new_files: (checkResult.new_files || []).filter((p) => !same(p)),
          });
        }
        fetchMonitoring();
      } else {
        addConsoleLog(`Restore failed: ${data.detail}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Restore error: ${err.message}`, 'danger');
    } finally {
      setRestoringPath(null);
    }
  };

  // Adding folders & files
  const handleSelectFolder = () => {
    folderPickerRef.current?.click();
  };

  const handleSelectFiles = () => {
    filesPickerRef.current?.click();
  };

  const handleOpenServerBrowser = (mode = 'folder') => {
    setBrowserModalMode(mode);
    setBrowserModalOpen(true);
  };

  const handleDeviceFolderSelected = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const folderName = files[0]?.webkitRelativePath?.split('/')[0] || 'MyDeviceFolder';

    setFolderLoading(true);
    addConsoleLog(`Uploading folder "${folderName}" (${files.length} file(s)) from your device…`, 'info');

    try {
      const formData = new FormData();
      formData.append('folder_name', folderName);
      const relMap = {};
      files.forEach((file) => {
        formData.append('files', file);
        relMap[file.name] = file.webkitRelativePath || file.name;
      });
      formData.append('relative_paths', JSON.stringify(relMap));

      const res = await apiFetch(`${API_BASE}/api/monitors/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`Folder baseline established: ${data.folder_path}`, 'success');
        await refreshMonitorState(data.monitor_id);
        fetchLogs();
        fetchMonitoring();
      } else {
        const msg = formatApiError(data.detail, 'Failed to upload folder');
        addConsoleLog(`Could not upload folder: ${msg}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error uploading folder: ${err.message}`, 'danger');
    } finally {
      setFolderLoading(false);
      if (folderPickerRef.current) folderPickerRef.current.value = '';
    }
  };

  const handleDeviceFilesSelected = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setFolderLoading(true);
    addConsoleLog(`Uploading ${files.length} file(s) from your device…`, 'info');

    try {
      const formData = new FormData();
      formData.append('folder_name', 'Device_Files');
      files.forEach((file) => {
        formData.append('files', file);
      });

      const res = await apiFetch(`${API_BASE}/api/monitors/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`Files baseline established: ${data.folder_path}`, 'success');
        await refreshMonitorState(data.monitor_id);
        fetchLogs();
        fetchMonitoring();
      } else {
        const msg = formatApiError(data.detail, 'Failed to upload files');
        addConsoleLog(`Could not upload files: ${msg}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error uploading files: ${err.message}`, 'danger');
    } finally {
      setFolderLoading(false);
      if (filesPickerRef.current) filesPickerRef.current.value = '';
    }
  };

  const handleAddFolderPath = async (e) => {
    e?.preventDefault?.();
    const path = sanitizeFolderPath(folderPathInput);
    if (!path) return;
    setFolderLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/monitors/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: path }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`Folder monitored: ${data.folder_path}`, 'success');
        setFolderPathInput('');
        await refreshMonitorState(data.monitor_id);
        fetchLogs();
        fetchMonitoring();
      } else {
        addConsoleLog(`Could not add folder: ${formatApiError(data.detail)}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error adding folder: ${err.message}`, 'danger');
    } finally {
      setFolderLoading(false);
    }
  };

  const handleFolderBrowserSelect = async (folderPath) => {
    if (!folderPath) return;
    setFolderLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/monitors/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folderPath }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`Folder preset monitored: ${data.folder_path}`, 'success');
        await refreshMonitorState(data.monitor_id);
        fetchLogs();
        fetchMonitoring();
      }
    } catch (err) {
      addConsoleLog(`Error adding preset folder: ${err.message}`, 'danger');
    } finally {
      setFolderLoading(false);
    }
  };

  const handleFilesBrowserSelect = async (filePaths) => {
    if (!filePaths || filePaths.length === 0) return;
    setFolderLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/monitors/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_paths: filePaths }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`Added ${data.file_count} preset files to monitor.`, 'success');
        await refreshMonitorState(data.monitor_id);
        fetchLogs();
        fetchMonitoring();
      }
    } catch (err) {
      addConsoleLog(`Error adding preset files: ${err.message}`, 'danger');
    } finally {
      setFolderLoading(false);
    }
  };

  const handleRemoveMonitor = async (monitorId, label) => {
    const confirmed = await requestConfirm({
      title: 'Remove monitor?',
      message: 'Stop monitoring and remove this target from FIMS?',
      detail: label,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep monitoring',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/monitors/${encodeURIComponent(monitorId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        addConsoleLog(`Removed monitor: ${label}`, 'warning');
        setCheckResult(null);
        setMonitors(data.monitors || []);
        setActiveMonitorId(data.active_monitor_id || null);
        setStatus((prev) => ({
          ...prev,
          has_baseline: (data.monitors || []).length > 0,
          monitor_count: data.monitor_count,
          active_monitor_id: data.active_monitor_id,
          folder_path: data.folder_path || '',
          file_count: data.file_count || 0,
          created_at: data.created_at || '',
        }));
        await fetchMonitoredFiles(data.active_monitor_id);
      }
    } catch (err) {
      addConsoleLog(`Error removing monitor: ${err.message}`, 'danger');
    }
  };

  // In-browser editor
  const handleOpenEditor = (filePath) => {
    if (!filePath) {
      if (monitoredFiles.length > 0) filePath = monitoredFiles[0].path;
      else return;
    }
    setEditorFilePath(filePath);
    setEditorModalOpen(true);
  };

  const handleEditorSaved = async (filePath, checkImmediately, message) => {
    const fname = filePath.split(/[\\/]/).pop();
    addConsoleLog(`Saved changes to ${fname}`, 'warning');
    addToast({
      id: Date.now(),
      type: 'success',
      title: 'File Saved',
      message: message || `Saved changes to ${fname}.`,
    });
    await fetchMonitoredFiles(activeMonitorId);
    if (checkImmediately) {
      setTimeout(handleCheckNow, 400);
    }
  };

  // Report downloads & deletions
  const handleDownloadReport = async (filename) => {
    try {
      const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(filename)}`);
      if (!res.ok) {
        addConsoleLog(`Could not download report: ${res.statusText}`, 'danger');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      addConsoleLog(`Downloaded report: ${filename}`, 'success');
    } catch (err) {
      addConsoleLog(`Download failed: ${err.message}`, 'danger');
    }
  };

  const handleDeleteReport = async (filename) => {
    const confirmed = await requestConfirm({
      title: 'Delete report?',
      message: `Delete report "${filename}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/reports/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        addConsoleLog(`Deleted report: ${filename}`, 'warning');
        fetchReports();
      }
    } catch (err) {
      addConsoleLog(`Error deleting report: ${err.message}`, 'danger');
    }
  };

  const tamperDetected = Boolean(
    status?.baseline_integrity?.tamper_detected || checkResult?.tamper_detected
  );

  return (
    <div className="fx-app">
      <BootSequence open={showBoot} onComplete={() => setShowBoot(false)} />
      <VersionGate />
      <OnboardingWizard
        open={!showBoot && showOnboarding}
        onClose={() => {
          localStorage.setItem('fim_onboarding_done', 'true');
          setShowOnboarding(false);
        }}
        onStart={() => {
          localStorage.setItem('fim_onboarding_done', 'true');
          setShowOnboarding(false);
          handleSelectFolder();
        }}
      />

      <TopBar
        tab={activeTab}
        onTab={setActiveTab}
        changeCount={changes.length}
        serverOnline={serverOnline}
        pendingAlertCount={toasts.length || monitoring.pending_alert_count}
        notificationPermission={notificationPermission}
        onEnableNotifications={requestNotificationPermission}
        onDismissAlerts={dismissAllToasts}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        currentRole={currentRole}
        onSelectRole={handleRoleChange}
      />

      {/* Global Alerts / Banners */}
      {!serverOnline && (
        <div className="fx-shell-alert fx-shell-alert--danger" role="alert">
          <strong>Monitoring server offline.</strong> {API_CONNECTION_HELP} Reconnecting…
        </div>
      )}

      {tamperDetected && (
        <div className="fx-shell-alert fx-shell-alert--critical" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>CRITICAL SECURITY WARNING: Baseline Tampering Detected!</strong>
            <p>
              The cryptographic HMAC-SHA256 signature for <code>baseline.json</code> is invalid.
              The baseline was altered outside of FIMS. Please re-verify or reset the baseline immediately.
            </p>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((alert) => (
          <ToastNotification
            key={alert.id}
            alert={alert}
            appIcon={APP_ICON}
            pageName="FIMS"
            onDismiss={dismissToast}
          />
        ))}
      </div>

      {/* Main 4 Sections */}
      <main className="fx-main" id="main-content">
        {activeTab === 'dashboard' && (
          <DashboardPage
            status={status}
            monitoring={monitoring}
            scanProgress={scanProgress}
            checkResult={checkResult}
            changes={changes}
            files={monitoredFiles}
            filesLoading={filesLoading}
            scanning={loading || monitoring.is_checking}
            tamperDetected={tamperDetected}
            canAct={canAct}
            folderLoading={folderLoading}
            onScan={handleCheckNow}
            onToggleMonitoring={handleToggleMonitoring}
            onViewChange={(path) => {
              setSelectedChangePath(path);
              setActiveTab('changes');
            }}
            onGoChanges={() => setActiveTab('changes')}
            onGoFolders={() => setActiveTab('folders')}
            onAddFolder={handleSelectFolder}
            onAddFiles={handleSelectFiles}
          />
        )}

        {activeTab === 'folders' && (
          <FoldersPage
            monitors={monitors}
            files={monitoredFiles}
            statusLookup={statusLookup}
            canAct={canAct}
            isAdmin={isAdmin}
            folderLoading={folderLoading}
            scanning={loading || monitoring.is_checking}
            folderPathInput={folderPathInput}
            onFolderPathInput={setFolderPathInput}
            onSubmitPath={handleAddFolderPath}
            pathPlaceholder={FOLDER_PATH_PLACEHOLDER}
            helpText={FOLDER_HELP_TEXT}
            onAddFolder={handleSelectFolder}
            onAddFiles={handleSelectFiles}
            onOpenServerBrowser={handleOpenServerBrowser}
            onScan={handleCheckNow}
            onResetBaseline={handleAcceptBaseline}
            onRemoveMonitor={handleRemoveMonitor}
            onEdit={handleOpenEditor}
            onRestore={handleRestoreFile}
            restoringPath={restoringPath}
            sandbox={(
              <TestingSandbox
                files={monitoredFiles}
                apiBase={API_BASE}
                apiFetch={apiFetch}
                canAct={canAct}
                onEdit={handleOpenEditor}
                onSimulated={() => {
                  fetchMonitoredFiles();
                  setTimeout(handleCheckNow, 400);
                }}
                addConsoleLog={addConsoleLog}
                addToast={addToast}
              />
            )}
          />
        )}

        {activeTab === 'changes' && (
          <ChangesPage
            changes={changes}
            hasScanned={Boolean(checkResult)}
            selectedPath={selectedChangePath}
            onSelect={setSelectedChangePath}
            flagged={flaggedPaths.has(selectedChangePath)}
            canAct={canAct}
            scanning={loading || monitoring.is_checking}
            busyPath={busyPath}
            restoringPath={restoringPath}
            onScan={handleCheckNow}
            onMarkSafe={handleMarkFileSafe}
            onMarkAllSafe={handleAcceptBaseline}
            onFlag={(change) => setFlagTarget(change)}
            onRestore={handleRestoreFile}
            onGoFolders={() => setActiveTab('folders')}
            hasBaseline={status.has_baseline}
          />
        )}

        {activeTab === 'audit' && (
          <AuditPage
            logs={systemLogs}
            reports={reports}
            previewReport={previewReport}
            onPreview={(filename) => setPreviewReport(filename)}
            onClosePreview={() => setPreviewReport(null)}
            onDownload={handleDownloadReport}
            onDelete={handleDeleteReport}
            isAdmin={isAdmin}
            canAct={canAct}
            scanning={loading || monitoring.is_checking}
            onScan={handleCheckNow}
            apiBase={API_BASE}
          />
        )}
      </main>

      {/* Hidden File Pickers */}
      <input
        type="file"
        ref={folderPickerRef}
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: 'none' }}
        onChange={handleDeviceFolderSelected}
      />
      <input
        type="file"
        ref={filesPickerRef}
        multiple
        style={{ display: 'none' }}
        onChange={handleDeviceFilesSelected}
      />

      {/* Flag Issue Dialog */}
      <FlagDialog
        open={Boolean(flagTarget)}
        fileName={flagTarget?.name || ''}
        busy={flagBusy}
        onCancel={() => setFlagTarget(null)}
        onConfirm={handleFlagFile}
      />

      {/* In-Browser File Editor Modal */}
      <FileEditor
        open={editorModalOpen}
        filePath={editorFilePath}
        apiBase={API_BASE}
        apiFetch={apiFetch}
        onClose={() => {
          setEditorModalOpen(false);
          setEditorFilePath(null);
        }}
        onSaved={handleEditorSaved}
      />

      {/* Help Dialog */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fx-modal-overlay" role="presentation" onClick={() => setSettingsOpen(false)}>
          <div
            className="fx-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fx-modal-head">
              <h2 id="settings-dialog-title">Settings</h2>
              <button
                type="button"
                className="fx-icon-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>
            <div className="fx-modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <SettingsPanel
                darkMode={darkMode}
                onToggleDarkMode={() => setDarkMode((v) => !v)}
                onSaved={() => {
                  addConsoleLog('Settings saved.', 'success');
                  fetchMonitoring();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmState?.open)}
        title={confirmState?.title}
        message={confirmState?.message}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        variant={confirmState?.variant}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />

      {/* Server Presets Modal */}
      <DirectoryBrowserModal
        open={browserModalOpen}
        mode={browserModalMode}
        apiBase={API_BASE}
        onClose={() => setBrowserModalOpen(false)}
        onSelectFolder={handleFolderBrowserSelect}
        onSelectFiles={handleFilesBrowserSelect}
      />
    </div>
  );
}
