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
  X,
  Radio
} from 'lucide-react';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';

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
      new Notification('File Integrity Alert', {
        body: `${alert.total_changes} change(s): ${alert.modified_count} modified, ${alert.deleted_count} deleted, ${alert.new_count} new`,
        icon: '/favicon.svg',
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
          addConsoleLog(
            `Auto-check alert: ${alert.modified_count} modified, ${alert.deleted_count} deleted, ${alert.new_count} new`,
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

  useEffect(() => {
    fetchStatus();
    fetchReports();
    fetchLogs();
    fetchMonitoring();
    requestNotificationPermission();

    const interval = setInterval(fetchMonitoring, 30000);
    return () => clearInterval(interval);
  }, [fetchMonitoring]);

  // Actions
  const handleSelectFolder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/select-folder`, { method: 'POST' });
      const data = await res.json();
      if (data.folder_path) {
        setFolderPathInput(data.folder_path);
        addConsoleLog(`Folder selected: ${data.folder_path}`, 'info');
        
        // Automatically create baseline immediately
        addConsoleLog(`Automatically creating baseline for: ${data.folder_path}...`, 'info');
        const baseRes = await fetch(`${API_BASE}/api/create-baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_path: data.folder_path })
        });
        if (baseRes.ok) {
          const baseData = await baseRes.json();
          addConsoleLog(`Baseline created successfully! Monitored files: ${baseData.file_count}`, 'success');
          addConsoleLog('Background monitoring will check every 20 minutes.', 'info');
          fetchStatus();
          fetchLogs();
          fetchMonitoring();
        } else {
          const errData = await baseRes.json();
          addConsoleLog(`Failed to create baseline: ${errData.detail}`, 'danger');
        }
      } else if (data.info) {
        addConsoleLog(data.info, 'warning');
      } else if (data.error) {
        addConsoleLog(`Native folder picker failed: ${data.error}`, 'warning');
      }
    } catch (err) {
      console.error(err);
      addConsoleLog(`Error using folder picker: ${err.message}`, 'warning');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBaseline = async () => {
    if (!folderPathInput) {
      alert("Please select or enter a folder path.");
      return;
    }
    setLoading(true);
    addConsoleLog(`Creating baseline for: ${folderPathInput}...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/api/create-baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folderPathInput })
      });
      if (res.ok) {
        const data = await res.json();
        addConsoleLog(`Successfully created baseline. Monitored files: ${data.file_count}`, 'success');
        fetchStatus();
        fetchLogs();
      } else {
        const errData = await res.json();
        addConsoleLog(`Error: ${errData.detail}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error creating baseline: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIntegrity = async () => {
    setLoading(true);
    addConsoleLog("Running integrity check...", 'info');
    try {
      const res = await fetch(`${API_BASE}/api/check-integrity`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
        if (data.success) {
          const totalChanges = data.modified_files.length + data.deleted_files.length + data.new_files.length;
          if (totalChanges === 0) {
            addConsoleLog("Integrity check completed: No changes detected. System healthy.", 'success');
          } else {
            addConsoleLog(`Integrity violation! Modified: ${data.modified_files.length}, Deleted: ${data.deleted_files.length}, New: ${data.new_files.length}`, 'danger');
          }
          fetchReports();
          fetchLogs();
        } else {
          addConsoleLog(`Check failed: ${data.message}`, 'danger');
        }
      } else {
        const errData = await res.json();
        addConsoleLog(`Error: ${errData.detail}`, 'danger');
      }
    } catch (err) {
      addConsoleLog(`Error checking integrity: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
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
          <div key={alert.id} className="toast toast-danger">
            <div className="toast-icon">
              <AlertTriangle size={20} />
            </div>
            <div className="toast-body">
              <strong>Integrity change detected</strong>
              <p>
                {alert.modified_count} modified, {alert.deleted_count} deleted, {alert.new_count} new
              </p>
              <span className="toast-time">{alert.timestamp}</span>
            </div>
            <button className="toast-dismiss" onClick={() => dismissToast(alert.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
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
              {activeTab === 'logs' && "Audit Log Registry"}
              {activeTab === 'reports' && "Generated Report Archive"}
            </h1>
            <p className="header-subtitle">
              {activeTab === 'dashboard' && "Real-time monitoring stats, baseline builder, and discrepancy viewer."}
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
              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper" style={{ backgroundColor: 'var(--accent-primary-glow)', color: 'var(--accent-primary)' }}>
                  <HardDrive size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{status.file_count}</span>
                  <span className="stat-label">Files Monitored</span>
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
                      Click to open your file browser, select any folder, and monitoring starts automatically.
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
                        onClick={handleCheckIntegrity} 
                        disabled={loading}
                        style={{ flex: 1 }}
                      >
                        <Activity size={18} />
                        {loading ? 'Scanning…' : 'Check File Integrity'}
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
                    {!status.has_baseline && "Click 'Create Baseline' to take a security snapshot of your selected folder."}
                    {status.has_baseline && !checkResult && "The security snapshot is active. Background checks run every 20 minutes, or click 'Check File Integrity' for an immediate scan."}
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
                      ✏️ Files That Were Changed ({checkResult.modified_files.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {checkResult.modified_files.map((file, fIndex) => {
                        const fileName = file.split('/').pop() || file.split('\\').pop();
                        const diffs = checkResult.text_differences[file];
                        const removedLines = diffs ? diffs.filter(l => l.startsWith('-')) : [];
                        const addedLines = diffs ? diffs.filter(l => l.startsWith('+')) : [];
                        return (
                          <div key={fIndex} className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--color-warning)' }}>
                            {/* File name header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                              <span style={{ fontSize: '1.5rem' }}>📄</span>
                              <div>
                                <p style={{ fontWeight: 700, fontSize: '1rem' }}>{fileName}</p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{file}</p>
                              </div>
                              <span style={{ marginLeft: 'auto', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>MODIFIED</span>
                            </div>

                            {diffs ? (
                              <>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                  This file was edited. Here is what was removed and what was added:
                                </p>
                                {/* Side-by-side Before/After */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                  {/* Before */}
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-danger)', display: 'inline-block' }}></span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-danger)' }}>BEFORE (Removed)</span>
                                    </div>
                                    <div style={{ background: 'var(--color-danger-bg)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.875rem', fontFamily: 'var(--font-mono)', lineHeight: 1.7 }}>
                                      {removedLines.length > 0 ? removedLines.map((l, i) => (
                                        <div key={i} style={{ color: 'var(--color-danger)' }}>{l.substring(1).trim() || <em style={{ opacity: 0.5 }}>(empty line)</em>}</div>
                                      )) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nothing was removed</span>}
                                    </div>
                                  </div>
                                  {/* After */}
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }}></span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-success)' }}>AFTER (Added)</span>
                                    </div>
                                    <div style={{ background: 'var(--color-success-bg)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.875rem', fontFamily: 'var(--font-mono)', lineHeight: 1.7 }}>
                                      {addedLines.length > 0 ? addedLines.map((l, i) => (
                                        <div key={i} style={{ color: 'var(--color-success)' }}>{l.substring(1).trim() || <em style={{ opacity: 0.5 }}>(empty line)</em>}</div>
                                      )) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nothing was added</span>}
                                    </div>
                                  </div>
                                </div>
                                {/* Raw diff collapsible */}
                                <details style={{ marginTop: '1rem' }}>
                                  <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-gold)', fontWeight: 600 }}>Show raw technical diff</summary>
                                  <div style={{ marginTop: '0.5rem', background: '#141210', borderRadius: '6px', padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                                    {diffs.map((l, i) => (
                                      <div key={i} style={{ color: l.startsWith('+') ? '#86efac' : l.startsWith('-') ? '#fda4af' : '#9ca3af' }}>{l}</div>
                                    ))}
                                  </div>
                                </details>
                              </>
                            ) : (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                This file's content was changed but detailed text comparison is not available for this file type. The file's digital fingerprint no longer matches the original.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                        <a 
                          href={`${API_BASE}/api/reports/${report.filename}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <Download size={14} /> Download PDF
                        </a>
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
