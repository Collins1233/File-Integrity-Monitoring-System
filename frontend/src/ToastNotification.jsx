import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  formatAlertTitle,
  formatAlertMessage,
  formatAlertSummary,
  formatAlertTime,
} from './alertUtils';

export const TOAST_DURATION_MS = 14000;

export default function ToastNotification({
  alert,
  appIcon,
  pageName,
  onDismiss,
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setLeaving(true), TOAST_DURATION_MS - 500);
    const dismissTimer = setTimeout(() => onDismiss(alert.id), TOAST_DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [alert.id, onDismiss]);

  return (
    <div
      className={`toast toast-danger ${leaving ? 'toast-leaving' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className="toast-top">
        <div className="toast-brand">
          <img src={appIcon} alt="" className="toast-app-icon" />
          <div className="toast-brand-text">
            <span className="toast-app-name">FIM Dashboard</span>
            <span className="toast-page-name">{pageName}</span>
          </div>
        </div>
        <button
          type="button"
          className="toast-dismiss"
          onClick={() => onDismiss(alert.id)}
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      </div>

      <div className="toast-content">
        <div className="toast-alert-icon">
          <AlertTriangle size={20} />
        </div>
        <div className="toast-body">
          <strong>{formatAlertTitle(alert)}</strong>
          <p>{formatAlertMessage(alert)}</p>
          <div className="toast-footer">
            <span className="toast-meta">{formatAlertSummary(alert)}</span>
            <span className="toast-time">{formatAlertTime(alert.timestamp)}</span>
          </div>
        </div>
      </div>

      <div
        className="toast-progress"
        style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
      />
    </div>
  );
}
