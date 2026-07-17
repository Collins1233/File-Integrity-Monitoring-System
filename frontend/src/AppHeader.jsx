import { useState } from 'react';
import {
  Bell,
  BellOff,
  HelpCircle,
  Moon,
  Shield,
  Sun,
} from 'lucide-react';

export default function AppHeader({
  pageTitle,
  version = '2.0.0',
  darkMode,
  onToggleDarkMode,
  onStartTour,
  serverOnline = true,
  pendingAlertCount = 0,
  notificationPermission = 'default',
  onEnableNotifications,
  onDismissAlerts,
}) {
  const [showNotifications, setShowNotifications] = useState(false);

  const notificationLabel = notificationPermission === 'granted'
    ? 'Browser notifications on'
    : notificationPermission === 'denied'
      ? 'Browser notifications blocked'
      : 'Enable browser notifications';

  return (
    <header className="top-bar shell-chrome">
      <div className="top-bar-left">
        <div className="top-bar-brand">
          <Shield size={20} className="top-bar-logo" />
          <span className="top-bar-app-name">FIM</span>
        </div>
        <div className="top-bar-divider" />
        <h1 className="top-bar-page-title">{pageTitle}</h1>
      </div>

      <div className="top-bar-right">
        <span
          className={`top-bar-status-dot ${serverOnline ? 'online' : 'offline'}`}
          title={serverOnline ? 'Server online' : 'Server offline'}
        />

        <div className="top-bar-notifications">
          <button
            type="button"
            className="top-bar-icon-btn"
            onClick={() => setShowNotifications((open) => !open)}
            aria-label="Notifications"
          >
            <Bell size={17} />
            {pendingAlertCount > 0 && (
              <span className="top-bar-badge">{pendingAlertCount > 9 ? '9+' : pendingAlertCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="top-bar-notifications-panel">
              <div className="top-bar-notifications-header">
                <strong>Notifications</strong>
                {pendingAlertCount > 0 && (
                  <button type="button" className="top-bar-link" onClick={onDismissAlerts}>
                    Clear all
                  </button>
                )}
              </div>
              {pendingAlertCount > 0 ? (
                <p>{pendingAlertCount} unread integrity alert{pendingAlertCount === 1 ? '' : 's'}.</p>
              ) : (
                <p>No pending alerts right now.</p>
              )}
              <button
                type="button"
                className="btn btn-secondary top-bar-notify-enable"
                onClick={onEnableNotifications}
                disabled={notificationPermission === 'granted'}
              >
                {notificationPermission === 'granted' ? <Bell size={14} /> : <BellOff size={14} />}
                {notificationLabel}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="top-bar-icon-btn"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {onStartTour && (
          <button
            type="button"
            className="top-bar-icon-btn"
            onClick={onStartTour}
            aria-label="Start tour"
            title="Tour"
          >
            <HelpCircle size={17} />
          </button>
        )}

        <span className="top-bar-version">v{version}</span>
      </div>
    </header>
  );
}
