import React, { useState } from 'react';
import { CheckCheck, Flag, Undo2, Columns2, ListChecks } from 'lucide-react';
import { Button, FileTypeIcon, StatusBadge } from './ui';
import HashCompare from './HashCompare';
import ContentChangesView from './ContentChangesView';
import { STATUS } from './statusConfig';
import { extensionOf, fileTypeLabel } from './format';
import FileDocumentPreview from '../FileDocumentPreview';
import {
  DocumentCompareModal,
  DocumentPageCompare,
  ExpandFullViewButton,
} from '../DocumentPageView';

function SideBySide({ change }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fx-sidebyside">
      <p className="fx-note">
        The original is on the left and the current file is on the right. Changed passages are highlighted.
      </p>
      <DocumentPageCompare filePath={change.path} diff={change.diff} compact />
      <div className="fx-sidebyside-foot">
        <ExpandFullViewButton onClick={() => setOpen(true)} />
      </div>
      <DocumentCompareModal
        open={open}
        onClose={() => setOpen(false)}
        filePath={change.path}
        fileName={change.name}
        diff={change.diff}
        onRestore={null}
        canRestore={false}
        isRestoring={false}
      />
    </div>
  );
}

export default function ChangeDetail({
  change,
  flagged,
  canAct,
  busyPath,
  restoringPath,
  onMarkSafe,
  onFlag,
  onRestore,
}) {
  const [view, setView] = useState('summary');
  const { status, diff, meta, path } = change;
  const extension = extensionOf(path);
  const canCompareVisually = status === 'modified' && diff && diff.preview_type !== 'binary'
    && (diff.preview_type === 'image' || (Array.isArray(diff.before) && Array.isArray(diff.after)));
  const canRestore = Boolean(meta?.can_restore ?? diff?.can_restore);
  const isBusy = busyPath === path;
  const isRestoring = restoringPath === path;

  return (
    <section className="fx-card fx-detail" aria-label={`Changes in ${change.name}`}>
      <header className="fx-detail-head">
        <span className="fx-detail-icon" aria-hidden="true"><FileTypeIcon path={path} size={26} /></span>
        <div className="fx-detail-title">
          <div className="fx-detail-name-row">
            <h2>{change.name}</h2>
            <StatusBadge status={status} />
            {flagged && <span className="fx-flagged-pill"><Flag size={12} aria-hidden="true" /> Flagged</span>}
          </div>
          <code className="fx-path" title={path}>{path}</code>
          <p className="fx-detail-sentence">
            {fileTypeLabel(path)} file. {STATUS[status].sentence}
          </p>
        </div>
      </header>

      <HashCompare oldHash={meta?.old_hash} newHash={meta?.new_hash} status={status} />

      <div className="fx-detail-section">
        <div className="fx-detail-section-head">
          <h3>What changed</h3>
          {canCompareVisually && (
            <div className="fx-segmented" role="group" aria-label="Choose a view">
              <button type="button" className={view === 'summary' ? 'is-active' : ''} aria-pressed={view === 'summary'} onClick={() => setView('summary')}>
                <ListChecks size={14} aria-hidden="true" /> Summary
              </button>
              <button type="button" className={view === 'pages' ? 'is-active' : ''} aria-pressed={view === 'pages'} onClick={() => setView('pages')}>
                <Columns2 size={14} aria-hidden="true" /> Side by side
              </button>
            </div>
          )}
        </div>

        {status === 'modified' && (view === 'summary' || !canCompareVisually) && (
          <ContentChangesView diff={diff} extension={extension} />
        )}
        {status === 'modified' && view === 'pages' && canCompareVisually && <SideBySide change={change} />}

        {status === 'deleted' && (
          <>
            <p className="fx-note">
              {canRestore
                ? 'This file is missing from the folder. Below is the copy saved in your baseline — you can bring it back with “Restore original”.'
                : 'This file is missing from the folder and there is no backup copy to restore.'}
            </p>
            {canRestore && <FileDocumentPreview key={path} filePath={path} variant="deleted" fileMeta={meta} defaultExpanded />}
          </>
        )}

        {status === 'added' && (
          <>
            <p className="fx-note">
              This file wasn’t there when the baseline was saved. If you expected it, choose “Mark as Safe”; otherwise flag it.
            </p>
            <FileDocumentPreview key={path} filePath={path} variant="new" fileMeta={meta} defaultExpanded />
          </>
        )}
      </div>

      <footer className="fx-actionbar">
        <div className="fx-actionbar-main">
          <Button
            variant="primary"
            icon={CheckCheck}
            onClick={() => onMarkSafe(change)}
            loading={isBusy}
            loadingLabel="Updating baseline…"
            disabled={!canAct || isRestoring}
            title={canAct ? 'Accept this version of the file and update the baseline' : 'Your role is read-only'}
          >
            Mark as Safe (Update Baseline)
          </Button>
          <Button
            variant="danger"
            icon={Flag}
            onClick={() => onFlag(change)}
            disabled={!canAct || isBusy || flagged}
            title={flagged ? 'Already flagged' : 'Record this change as a problem in the audit log'}
          >
            {flagged ? 'Issue Flagged' : 'Flag Issue'}
          </Button>
          {canRestore && (
            <Button
              icon={Undo2}
              onClick={() => onRestore(path)}
              loading={isRestoring}
              loadingLabel="Restoring…"
              disabled={!canAct || isBusy}
              title="Replace the current file with the saved baseline copy"
            >
              Restore original
            </Button>
          )}
        </div>
        <p className="fx-actionbar-help">
          <strong>Mark as Safe</strong> means “I expected this change” — the baseline is updated for this file only.
        </p>
      </footer>
    </section>
  );
}
