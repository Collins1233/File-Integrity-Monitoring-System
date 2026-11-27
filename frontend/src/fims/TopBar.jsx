import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  ClipboardList,
  FileDiff,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Settings,
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'folders', label: 'Folders & Files', icon: FolderOpen },
  { id: 'changes', label: 'File Changes', icon: FileDiff },
  { id: 'audit', label: 'Audit & Reports', icon: ClipboardList },
];

const ROLE_LABELS = {
  admin: 'Admin',
  analyst: 'Analyst',
  auditor: 'Auditor',
  viewer: 'Viewer',
};

export default function TopBar({
  tab,
  onTab,
  changeCount = 0,
  serverOnline = true,
  pendingAlertCount = 0,
  notificationPermission = 'default',
  onEnableNotifications,
  onDismissAlerts,
  onOpenSettings,
  onOpenHelp,
  currentRole = 'admin',
  onSelectRole,
}) {
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  // Close the notifications popover when clicking elsewhere.
  useEffect(() => {
    if (!bellOpen) return undefined;
    const close = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bellOpen]);

  return (
    <header className="fx-topbar">
      <div className="fx-topbar-inner">
        <button type="button" className="fx-brand" onClick={() => onTab('dashboard')} aria-label="FIMS home">
          <img src="/fim-logo.png" alt="" width={28} height={28} />
          <span className="fx-brand-text">
            <strong>FIMS</strong>
            <small>File Integrity Monitor</small>
          </span>
        </button>

        <nav className="fx-nav" aria-label="Main sections">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`fx-nav-item ${tab === id ? 'is-active' : ''}`}
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              {id === 'changes' && changeCount > 0 && (
                <span className="fx-nav-badge" aria-label={`${changeCount} changed files`}>{changeCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="fx-topbar-tools">
          <span
            className={`fx-conn ${serverOnline ? 'is-online' : 'is-offline'}`}
            title={serverOnline ? 'Connected to the monitoring server' : 'Cannot reach the monitoring server'}
          >
            <span className="fx-conn-dot" aria-hidden="true" />
            <span className="fx-conn-text">{serverOnline ? 'Connected' : 'Offline'}</span>
          </span>

          <div className="fx-popover-wrap" ref={bellRef}>
            <button
              type="button"
              className="fx-icon-btn"
              onClick={() => setBellOpen((open) => !open)}
              aria-label="Notifications"
              aria-expanded={bellOpen}
            >
              <Bell size={18} aria-hidden="true" />
              {pendingAlertCount > 0 && <span className="fx-icon-badge">{pendingAlertCount > 9 ? '9+' : pendingAlertCount}</span>}
            </button>
            {bellOpen && (
              <div className="fx-popover" role="dialog" aria-label="Notifications">
                <div className="fx-popover-head">
                  <strong>Notifications</strong>
                  {pendingAlertCount > 0 && (
                    <button type="button" className="fx-link-btn" onClick={onDismissAlerts}>Clear all</button>
                  )}
                </div>
                <p className="fx-popover-text">
                  {pendingAlertCount > 0
                    ? `${pendingAlertCount} unread alert${pendingAlertCount === 1 ? '' : 's'} about changed files.`
                    : 'No new alerts. You will see one here if a file changes.'}
                </p>
                <button
                  type="button"
                  className="fx-btn fx-btn--secondary fx-btn--sm"
                  onClick={onEnableNotifications}
                  disabled={notificationPermission === 'granted'}
                >
                  {notificationPermission === 'granted' ? <Bell size={14} /> : <BellOff size={14} />}
                  <span>
                    {notificationPermission === 'granted'
                      ? 'Browser notifications are on'
                      : notificationPermission === 'denied'
                        ? 'Notifications are blocked in your browser'
                        : 'Turn on browser notifications'}
                  </span>
                </button>
              </div>
            )}
          </div>

          <button type="button" className="fx-icon-btn" onClick={onOpenHelp} aria-label="Help: how FIMS works" title="Help">
            <HelpCircle size={18} aria-hidden="true" />
          </button>
          <button type="button" className="fx-icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            <Settings size={18} aria-hidden="true" />
          </button>

          <label className="fx-role">
            <span className="fx-sr-only">Signed in as</span>
            <select value={currentRole} onChange={(event) => onSelectRole?.(event.target.value)} title="Your access level">
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
