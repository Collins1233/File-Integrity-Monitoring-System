import { useEffect, useRef } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}) {
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    confirmButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === 'danger';
  const Icon = isDanger ? AlertTriangle : Info;

  return (
    <div
      className="confirm-overlay"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className={`confirm-card ${isDanger ? 'confirm-card-danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`confirm-icon ${isDanger ? 'confirm-icon-danger' : 'confirm-icon-default'}`}>
          <Icon size={22} />
        </div>

        <h2 id="confirm-dialog-title" className="confirm-title">{title}</h2>
        <p id="confirm-dialog-message" className="confirm-message">{message}</p>

        {detail && (
          <div className="confirm-detail" title={detail}>
            {detail}
          </div>
        )}

        <div className="confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
