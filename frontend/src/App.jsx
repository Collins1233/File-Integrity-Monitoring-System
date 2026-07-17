import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, 
  Folder, 
  FileText, 
  RefreshCw, 
  Activity, 
  AlertTriangle, 
  FilePlus, 
  FileMinus, 
  Clock, 
  ChevronRight,
  Download,
  Terminal,
  Settings,
  HardDrive,
  Bell,
  BellOff,
  Radio,
  Files,
  Zap,
  Trash2
} from 'lucide-react';

import FileChangeViewer from './FileChangeViewer';
import ToastNotification from './ToastNotification';
import MonitoredFilesPanel from './MonitoredFilesPanel';
import {
  formatAlertTitle,
  getAffectedFiles,
} from './alertUtils';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';
const APP_ICON = `${API_BASE || window.location.origin}/favicon.svg`;

const PAGE_LABELS = {
  dashboard: 'Overview',
  files: 'Monitored Files',
  logs: 'System Logs',
  reports: 'Reports Archive',
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [status, setStatus] = useState({
    has_baseline: false,
    folder_path: '',
    created_at: '',
    file_count: 0
  });
  
  const [folderPathInput, setFolderPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [logs, setLogs] = useState([]);
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
  const seenAlertIds = useRef(new Set());

  const addConsoleLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  }, []);

  const addToast = useCallback((alert) => {
    setToasts(prev => {
      if (prev.some(t => t.id === alert.id)) return prev;
      return [...prev, alert];
    });

    if ('Notification' in window && Notification.permission === 'granted') {
      const affected = getAffectedFiles(alert);
      const fileLine = affected.length
        ? affected.map((file) => file.name).join(', ')
        : 'Unknown file';

      new Notification('FIM Dashboard', {
        body: `${formatAlertTitle(alert)}\n${fileLine}`,
        icon: APP_ICON,
        badge: APP_ICON,
        tag: `fim-alert-${alert.id}`,
      });
    }
  }, []);

  const dismissToast = async (alertId) => {
    setToasts(prev => prev.filter(t => t.id !== alertId));
    try {
      await fetch(`${API_BASE}/api/monitoring/alerts/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: [alertId] }),
      });
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  const fetchMonitoring = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/status`);
      const data = await res.json();
      setMonitoring(data);

      if (data.last_result?.success) {
        setCheckResult(data.last_result);
      }

      const alertsRes = await fetch(`${API_BASE}/api/monitoring/alerts`);
      const alertsData = await alertsRes.json();
      const alerts = alertsData.alerts || [];

      for (const alert of alerts) {
        if (!seenAlertIds.current.has(alert.id)) {
          seenAlertIds.current.add(alert.id);
          addToast(alert);
          const affectedNames = getAffectedFiles(alert).map((file) => file.name).join(', ');
          addConsoleLog(
            `Auto-check alert: ${formatAlertTitle(alert)} (${affectedNames || 'no file names'})`,
            'danger'
          );
        }
      }
    } catch (err) {
      console.error('Error fetching monitoring status:', err);
    }
  }, [addToast, addConsoleLog]);

  const handleToggleMonitoring = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !monitoring.enabled }),
      });
      const data = await res.json();
      setMonitoring(data);
      addConsoleLog(
        data.enabled ? 'Background monitoring enabled (every 20 min).' : 'Background monitoring paused.',
        data.enabled ? 'success' : 'warning'
      );
    } catch (err) {
      addConsoleLog(`Failed to toggle monitoring: ${err.message}`, 'danger');
    }
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  // Fetch status, reports, and logs
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      setStatus(data);
      if (data.folder_path) {
        setFolderPathInput(data.folder_path);
      }
    } catch (err) {
      console.error("Error fetching status:", err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reports`);
      const data = await res.json();
      setReports(data);
    } catch (err) {
      console.error("Error fetching reports:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/logs`);
      const data = await res.json();
      setSystemLogs(data.logs || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const fetchMonitoredFiles = async () => {
    setFilesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/files`);
      const data = await res.json();
      setMonitoredFiles(data.files || []);
    } catch (err) {
      console.error('Error fetching monitored files:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchReports();
    fetchLogs();
    fetchMonitoring();
    fetchMonitoredFiles();
    requestNotificationPermission();

    const interval = setInterval(fetchMonitoring, 30000);
    return () => clearInterval(interval);
  }, [fetchMonitoring]);

  useEffect(() => {
    if (activeTab === 'files' && status.has_baseline) {
      fetchMonitoredFiles();
    }
  }, [activeTab, status.has_baseline]);

  // Actions
  const handleSelectFolder = async () => {
    setLoading(true);
    try {
      addConsoleLog('Opening folder picker…', 'info');
      const res = await fetch(`${API_BASE}/api/select-folder`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.baseline_created) {
        setFolderPathInput(data.folder_path);
        addConsoleLog(`Monitoring started for: ${data.folder_path}`, 'success');
        addConsoleLog(`Baseline created automatically — ${data.file_count} files snapshotted.`, 'success');
        addConsoleLog('Background checks run every 20 minutes. Use Check Now anytime.', 'info');
        await fetchStatus();
        fetchLogs();
        fetchMonitoring();
        fetchMonitoredFiles();
      } else if (data.info) {
        addConsoleLog(data.info, 'warning');
      } else if (data.error) {
        addConsoleLog(`Native folder picker failed: ${data.error}`, 'warning');
      } else if (!res.ok) {
        addConsoleLog(`Failed to start monitoring: ${data.detail || 'Unknown error'}`, 'danger');
      }
    } catch (err) {
      console.error(err);
      addConsoleLog(`Error using folder picker: ${err.message}`, 'warning');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNow = async () => {
    setLoading(true);
    addConsoleLog('Running immediate integrity check…', 'info');
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/check-now`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setCheckResult(data);
        const totalChanges = data.modified_files.length + data.deleted_files.length + data.new_files.length;
        if (totalChanges === 0) {
          addConsoleLog('Check complete — all files match the baseline.', 'success');
        } else {
          addConsoleLog(`Check complete — ${data.modified_files.length} modified, ${data.deleted_files.length} deleted, ${data.new_files.length} new.`, 'danger');
        }
        fetchReports();
        fetchLogs();
        fetchMonitoring();
      } else {
        addConsoleLog(`Check failed: ${data.detail || data.message || 'Unknown error'}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error running check: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (filename) => {
    if (!window.confirm(`Delete report "${filename}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        addConsoleLog(`Deleted report: ${filename}`, 'warning');
        fetchReports();
      } else {
        const data = await res.json();
        addConsoleLog(`Could not delete report: ${data.detail || 'Unknown error'}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error deleting report: ${err.message}`, 'danger');
    }
  };

  const formatCheckTime = (value) => {
    if (!value) return 'Not yet';
    const date = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  return (
    <div className="app-container">
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(alert => (
          <ToastNotification
            key={alert.id}
            alert={alert}
            appIcon={APP_ICON}
            pageName={PAGE_LABELS[activeTab] || 'Overview'}
            onDismiss={dismissToast}
          />
        ))}
      </div>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand-section">
          <Shield size={32} className="brand-logo" />
          <span className="brand-name">FIM Dashboard</span>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            Overview
          </button>
          <button 
            className={`nav-item ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <Files size={18} />
            Monitored Files
          </button>
          <button 
            className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={18} />
            System Logs
          </button>
          <button 
            className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <FileText size={18} />
            Reports Archive
          </button>
        </nav>

        <div style={{ marginTop: 'auto', padding: '1rem 0', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Settings size={16} className="text-muted" />
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>FIM System v1.0.0</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="header-container">
          <div>
            <h1 className="header-title">
              {activeTab === 'dashboard' && "File Integrity Dashboard"}
              {activeTab === 'files' && "Monitored Files"}
              {activeTab === 'logs' && "Audit Log Registry"}
              {activeTab === 'reports' && "Generated Report Archive"}
            </h1>
            <p className="header-subtitle">
              {activeTab === 'dashboard' && "Real-time monitoring stats, baseline builder, and discrepancy viewer."}
              {activeTab === 'files' && "Browse every file included in your monitoring baseline and preview text content."}
              {activeTab === 'logs' && "Historical log registry capturing monitoring activities and integrity events."}
              {activeTab === 'reports' && "Download and inspect detailed PDF integrity reports generated by FIM."}
            </p>

            {status.has_baseline && activeTab === 'dashboard' && (
              <div className="monitoring-status-bar">
                <div className={`monitoring-pill ${monitoring.active ? 'active' : 'paused'}`}>
                  <Radio size={14} className={monitoring.is_checking ? 'animate-spin' : ''} />
                  {monitoring.is_checking
                    ? 'Scanning now…'
                    : monitoring.active
                      ? `Auto-check every ${monitoring.interval_minutes} min`
                      : 'Monitoring paused'}
                </div>
                <div className="monitoring-times">
                  <span>Last: {formatCheckTime(monitoring.last_check_at)}</span>
                  <span>Next: {monitoring.active ? formatCheckTime(monitoring.next_check_at) : '—'}</span>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleCheckNow}
                  disabled={loading || monitoring.is_checking}
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                >
                  <Zap size={14} />
                  {monitoring.is_checking ? 'Checking…' : 'Check Now'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleToggleMonitoring}
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                >
                  {monitoring.enabled ? <BellOff size={14} /> : <Bell size={14} />}
                  {monitoring.enabled ? 'Pause' : 'Resume'}
                </button>
              </div>
            )}
          </div>
          
          {loading && (
            <div className="glass-panel" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
              <RefreshCw className="animate-spin" size={16} />
              <span>Processing...</span>
            </div>
          )}
        </header>

        {activeTab === 'dashboard' && (
          <>
            {/* Stats Grid */}
            <section className="stats-grid">
              <div className="glass-panel stat-card stat-card-clickable" onClick={() => setActiveTab('files')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveTab('files')}>
                <div className="stat-icon-wrapper" style={{ backgroundColor: 'var(--accent-primary-glow)', color: 'var(--accent-primary)' }}>
                  <HardDrive size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{status.file_count}</span>
                  <span className="stat-label">Files Monitored · View</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                  <AlertTriangle size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{checkResult ? checkResult.modified_files.length : 0}</span>
                  <span className="stat-label">Modified Files</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper" style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                  <FileMinus size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{checkResult ? checkResult.deleted_files.length : 0}</span>
                  <span className="stat-label">Deleted Files</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                  <FilePlus size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{checkResult ? checkResult.new_files.length : 0}</span>
                  <span className="stat-label">New Files</span>
                </div>
              </div>
            </section>

            {/* Actions Panel */}
            <section className="dashboard-actions">
              <div className="glass-panel action-card">
                <h3 className="card-title"><Folder size={18} className="text-info" /> Monitored Workspace</h3>

                {/* Big Browse Button */}
                {!status.has_baseline ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1.5rem 0' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleSelectFolder} 
                      disabled={loading}
                      style={{ fontSize: '1.05rem', padding: '1.1rem 2.5rem', gap: '0.75rem' }}
                    >
                      <Folder size={22} />
                      {loading ? 'Opening folder picker…' : 'Browse & Start Monitoring'}
                    </button>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
                      Pick a folder — monitoring and baseline snapshot start automatically.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Currently Monitored Folder pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '0.85rem 1.1rem', border: '1px solid var(--border-color)' }}>
                      <Folder size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{status.folder_path}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button 
                        className="btn btn-primary" 
                        onClick={handleCheckNow} 
                        disabled={loading || monitoring.is_checking}
                        style={{ flex: 1 }}
                      >
                        <Zap size={18} />
                        {loading || monitoring.is_checking ? 'Checking…' : 'Check Now'}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setActiveTab('files')}
                      >
                        <Files size={16} />
                        View Files
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={handleSelectFolder} 
                        disabled={loading}
                      >
                        <Folder size={16} />
                        Change Folder
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-panel action-card">
                <h3 className="card-title"><Clock size={18} className="text-warning" /> Baseline Info</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
                  <div>
                    <span className="text-muted">Status: </span>
                    <span className={status.has_baseline ? "text-success" : "text-danger"}>
                      {status.has_baseline ? "Active" : "No Baseline"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Created: </span>
                    <span className="text-primary">{status.created_at || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-muted">Location: </span>
                    <span className="text-primary" style={{ wordBreak: 'break-all' }}>{status.folder_path || 'None'}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* User Friendly Status Card */}
            <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div 
                  className="stat-icon-wrapper" 
                  style={{ 
                    backgroundColor: !status.has_baseline ? 'var(--color-danger-bg)' : checkResult && (checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length > 0) ? 'var(--color-warning-bg)' : 'var(--color-success-bg)', 
                    color: !status.has_baseline ? 'var(--color-danger)' : checkResult && (checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length > 0) ? 'var(--color-warning)' : 'var(--color-success)',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%'
                  }}
                >
                  <Shield size={32} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {!status.has_baseline && "First Step: Set up your monitor"}
                    {status.has_baseline && !checkResult && "Folder is Monitored & Protected"}
                    {status.has_baseline && checkResult && (checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length === 0) && "System Safe & Secure"}
                    {status.has_baseline && checkResult && (checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length > 0) && "Action Required: File Changes Detected"}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    {!status.has_baseline && "Pick a folder above — a baseline snapshot is created automatically."}
                    {status.has_baseline && !checkResult && "Monitoring is active. Checks run every 20 minutes, or click Check Now for an immediate scan."}
                    {status.has_baseline && checkResult && (checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length === 0) && "All monitored files are intact. No unauthorized changes or modifications were found."}
                    {status.has_baseline && checkResult && (checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length > 0) && `We found ${checkResult.modified_files.length} modified, ${checkResult.deleted_files.length} deleted, and ${checkResult.new_files.length} new files. See details below.`}
                  </p>
                </div>
              </div>
            </section>

            {/* Simple Activity Feed */}
            <section className="glass-panel" style={{ padding: '1.5rem 2rem' }}>
              <h3 className="card-title" style={{ fontSize: '1.05rem', margin: 0, paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                <Clock size={16} className="text-info" /> Recent Activity Feed
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {logs.length === 0 ? (
                  <span className="text-secondary" style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>Ready. Start by monitoring a folder above.</span>
                ) : (
                  [...logs].reverse().slice(0, 5).map((log, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.925rem' }}>
                      <span style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        backgroundColor: log.type === 'success' ? 'var(--color-success)' : log.type === 'danger' ? 'var(--color-danger)' : log.type === 'warning' ? 'var(--color-warning)' : 'var(--accent-primary)',
                        flexShrink: 0
                      }}></span>
                      <span className="text-secondary" style={{ fontSize: '0.8rem', minWidth: '65px' }}>{log.timestamp}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.message}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Collapsible Technical Console for IT/Support */}
              {logs.length > 0 && (
                <details style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-gold)', fontWeight: 700 }}>
                    Show Technical Details (Console logs)
                  </summary>
                  <div className="terminal-body" style={{ marginTop: '1rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {logs.map((log, index) => (
                      <div key={index} className="log-line" style={{ fontSize: '0.8rem' }}>
                        <span className="log-time">[{log.timestamp}]</span>
                        <span className={`log-msg text-${log.type}`}>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>

            {/* Friendly "What Changed?" Viewer */}
            {checkResult && (
              <section style={{ marginTop: '2rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {(checkResult.modified_files.length + checkResult.deleted_files.length + checkResult.new_files.length) === 0
                    ? <><span style={{ color: 'var(--color-success)' }}>✓</span> Everything Looks Good</>
                    : <><span style={{ color: 'var(--color-warning)' }}>⚠</span> What Changed in Your Files?</>
                  }
                </h2>

                {/* All Clear */}
                {checkResult.modified_files.length === 0 && checkResult.deleted_files.length === 0 && checkResult.new_files.length === 0 && (
                  <div className="glass-panel" style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: '4px solid var(--color-success)' }}>
                    <span style={{ fontSize: '2.5rem' }}>🛡️</span>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>No changes detected</p>
                      <p style={{ color: 'var(--text-secondary)' }}>All your monitored files are exactly as they were when you set up monitoring. Nothing has been added, removed, or altered.</p>
                    </div>
                  </div>
                )}

                {/* Modified Files */}
                {checkResult.modified_files.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-warning)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Changed Files ({checkResult.modified_files.length})
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                      Tap a file to see what it looked like before and what it looks like now.
                    </p>
                    <FileChangeViewer
                      modifiedFiles={checkResult.modified_files}
                      textDifferences={checkResult.text_differences}
                    />
                  </div>
                )}

                {/* Deleted Files */}
                {checkResult.deleted_files.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-danger)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      🗑️ Files That Were Deleted ({checkResult.deleted_files.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {checkResult.deleted_files.map((file, fIndex) => {
                        const fileName = file.split('/').pop() || file.split('\\').pop();
                        return (
                          <div key={fIndex} className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--color-danger)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🗑️</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700 }}>{fileName}</p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{file}</p>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>This file existed when monitoring was set up but can no longer be found. It may have been deleted or moved.</p>
                            </div>
                            <span style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>DELETED</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* New Files */}
                {checkResult.new_files.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      📥 New Files Found ({checkResult.new_files.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {checkResult.new_files.map((file, fIndex) => {
                        const fileName = file.split('/').pop() || file.split('\\').pop();
                        return (
                          <div key={fIndex} className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--color-success)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>📄</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700 }}>{fileName}</p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{file}</p>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>This file was not present when monitoring was set up. It was added after the security snapshot was taken.</p>
                            </div>
                            <span style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>NEW</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {activeTab === 'files' && (
          <MonitoredFilesPanel
            files={monitoredFiles}
            folderPath={status.folder_path}
            loading={filesLoading}
          />
        )}

        {activeTab === 'logs' && (
          <section className="glass-panel" style={{ padding: '1.5rem', minHeight: '500px' }}>
            <h3 className="card-title"><Terminal size={18} /> System Audit Trail (fim_log.txt)</h3>
            <div className="terminal-body" style={{ height: '450px' }}>
              {systemLogs.length === 0 ? (
                <span className="text-muted">No logs recorded yet.</span>
              ) : (
                systemLogs.map((log, index) => (
                  <div key={index} className="log-line">
                    {log.timestamp && <span className="log-time">[{log.timestamp}]</span>}
                    <span className="log-msg">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'reports' && (
          <section className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 className="card-title"><FileText size={18} /> Available PDF Reports</h3>
            <p className="text-secondary" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              Only the 5 most recent reports are kept. Older reports are removed automatically.
            </p>
            {reports.length === 0 ? (
              <p className="text-muted">No integrity check reports found.</p>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Report Filename</th>
                    <th>Generated Date</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{report.filename}</td>
                      <td>{report.created_at}</td>
                      <td>{(report.size_bytes / 1024).toFixed(2)} KB</td>
                      <td>
                        <div className="report-actions">
                          <a 
                            href={`${API_BASE}/api/reports/${report.filename}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-secondary" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Download size={14} /> Download
                          </a>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleDeleteReport(report.filename)}
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
