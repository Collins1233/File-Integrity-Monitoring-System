import React, { useEffect, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { Button } from './ui';

/** Small dialog that asks for an optional note before flagging a file. */
export default function FlagDialog({ open, fileName, busy, onCancel, onConfirm }) {
  const [note, setNote] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setNote('');
    textareaRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fx-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="fx-modal fx-modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fx-modal-head">
          <h2 id="flag-title"><Flag size={18} aria-hidden="true" /> Flag an issue</h2>
          <button type="button" className="fx-icon-btn" onClick={onCancel} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="fx-modal-body">
          <p>
            This records <strong>{fileName}</strong> as a problem in the audit log so someone can follow up.
            The baseline stays unchanged.
          </p>
          <label className="fx-field">
            <span>What looks wrong? <em>(optional)</em></span>
            <textarea
              ref={textareaRef}
              rows={3}
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Nobody on the team should have edited this contract."
            />
          </label>
        </div>
        <div className="fx-modal-foot">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" icon={Flag} onClick={() => onConfirm(note)} loading={busy} loadingLabel="Flagging…">Flag Issue</Button>
        </div>
      </div>
    </div>
  );
}
