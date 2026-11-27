import React, { useEffect } from 'react';
import { CheckCircle2, FilePenLine, FilePlus2, FileMinus2, ScanLine, ShieldCheck, Folder, X } from 'lucide-react';
import { Button, StatusBadge } from './ui';

/** Plain-English "how it works" for first-time users. */
export default function HelpDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fx-modal-overlay" role="presentation" onClick={onClose}>
      <div className="fx-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
        <div className="fx-modal-head">
          <h2 id="help-title"><ShieldCheck size={20} aria-hidden="true" /> How FIMS works</h2>
          <button type="button" className="fx-icon-btn" onClick={onClose} aria-label="Close help"><X size={18} /></button>
        </div>
        <div className="fx-modal-body fx-help">
          <p>
            FIMS keeps a trusted snapshot of your files and tells you when something is different — so a surprise
            edit, a deleted file or an unexpected new file never goes unnoticed.
          </p>

          <ol className="fx-help-steps">
            <li><Folder size={18} aria-hidden="true" /><div><strong>Choose what to watch.</strong> Add a folder or specific files under “Folders &amp; Files”.</div></li>
            <li><ShieldCheck size={18} aria-hidden="true" /><div><strong>A baseline is saved.</strong> That is the snapshot FIMS compares against. Each file gets a SHA-256 “fingerprint”.</div></li>
            <li><ScanLine size={18} aria-hidden="true" /><div><strong>Scan.</strong> Press “Run Scan” any time. Scans also run by themselves in the background.</div></li>
            <li><CheckCircle2 size={18} aria-hidden="true" /><div><strong>Review.</strong> Open “File Changes” to see what changed, then mark it safe or flag it.</div></li>
          </ol>

          <h3>What the colors mean</h3>
          <ul className="fx-legend">
            <li><StatusBadge status="intact" /><span>Matches your baseline.</span></li>
            <li><StatusBadge status="modified" /><span>The contents changed.</span></li>
            <li><StatusBadge status="added" /><span>A new file that wasn’t in the baseline.</span></li>
            <li><StatusBadge status="deleted" /><span>A file that has gone missing.</span></li>
          </ul>

          <h3>Handy words</h3>
          <dl className="fx-glossary">
            <dt>Baseline</dt><dd>The trusted snapshot of your files that scans are compared with.</dd>
            <dt>Fingerprint (SHA-256)</dt><dd>A short code made from a file’s contents. If the file changes, the code changes.</dd>
            <dt>Mark as Safe</dt><dd>“I expected this change.” The baseline is updated for that one file.</dd>
            <dt>Flag Issue</dt><dd>“This looks wrong.” The file is noted in the audit log for follow-up.</dd>
          </dl>
        </div>
        <div className="fx-modal-foot"><Button variant="primary" onClick={onClose}>Got it</Button></div>
      </div>
    </div>
  );
}
