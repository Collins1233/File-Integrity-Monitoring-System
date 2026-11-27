import React, { useEffect } from 'react';
import { CheckCheck, CheckCircle2, Flag, ScanLine, ShieldCheck } from 'lucide-react';
import { Button, EmptyState, FileTypeIcon, PageHeader, StatusBadge } from './ui';
import ChangeDetail from './ChangeDetail';
import { dirName, plural } from './format';

export default function ChangesPage({
  changes,
  hasScanned,
  selectedPath,
  onSelect,
  flagged,
  canAct,
  scanning,
  busyPath,
  restoringPath,
  onScan,
  onMarkSafe,
  onMarkAllSafe,
  onFlag,
  onRestore,
  onGoFolders,
  hasBaseline,
}) {
  const selected = changes.find((change) => change.path === selectedPath) || changes[0] || null;

  // Keep the selection valid when files get resolved.
  useEffect(() => {
    if (selected && selected.path !== selectedPath) onSelect(selected.path);
  }, [selected, selectedPath, onSelect]);

  const header = (
    <PageHeader
      title="File Changes"
      subtitle="Review exactly what is different from your saved baseline, then decide what to do."
      actions={(
        <Button variant="primary" icon={ScanLine} onClick={onScan} loading={scanning} loadingLabel="Scanning…" disabled={!canAct || !hasBaseline}>
          Run Scan
        </Button>
      )}
    />
  );

  if (!hasBaseline) {
    return (
      <>
        {header}
        <section className="fx-card">
          <EmptyState
            icon={ShieldCheck}
            title="Nothing to compare yet"
            text="Add a folder or some files to watch first. Once they’re scanned, any changes will show up here."
            actions={<Button variant="primary" onClick={onGoFolders}>Add folders &amp; files</Button>}
          />
        </section>
      </>
    );
  }

  if (!hasScanned) {
    return (
      <>
        {header}
        <section className="fx-card">
          <EmptyState
            icon={ScanLine}
            title="Run a scan to see changes"
            text="Your baseline is saved. Run a scan and FIMS will list every file that was modified, added or deleted."
            actions={<Button variant="primary" icon={ScanLine} onClick={onScan} loading={scanning} loadingLabel="Scanning…" disabled={!canAct}>Run Scan</Button>}
          />
        </section>
      </>
    );
  }

  if (changes.length === 0) {
    return (
      <>
        {header}
        <section className="fx-card">
          <EmptyState
            icon={CheckCircle2}
            tone="intact"
            title="No changes found"
            text="Every monitored file matches your baseline. Nothing has been modified, added or deleted."
            actions={<Button icon={ScanLine} onClick={onScan} loading={scanning} loadingLabel="Scanning…" disabled={!canAct}>Scan again</Button>}
          />
        </section>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="fx-changes">
        <aside className="fx-card fx-changes-list" aria-label="Changed files">
          <div className="fx-card-head fx-card-head--tight">
            <h2 className="fx-card-title">{plural(changes.length, 'changed file')}</h2>
            {changes.length > 1 && (
              <Button variant="ghost" size="sm" icon={CheckCheck} onClick={onMarkAllSafe} disabled={!canAct || busyPath === '*'} loading={busyPath === '*'} loadingLabel="Updating…" title="Accept every change below and update the baseline">
                Mark all safe
              </Button>
            )}
          </div>
          <ul className="fx-change-items">
            {changes.map((change) => {
              const active = selected?.path === change.path;
              return (
                <li key={change.path}>
                  <button
                    type="button"
                    className={`fx-change-item fx-change-item--${change.status} ${active ? 'is-active' : ''}`}
                    onClick={() => onSelect(change.path)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <span className="fx-file-icon"><FileTypeIcon path={change.path} /></span>
                    <span className="fx-change-text">
                      <span className="fx-file-name">{change.name}</span>
                      <span className="fx-file-path">{dirName(change.path)}</span>
                    </span>
                    <span className="fx-change-side">
                      <StatusBadge status={change.status} />
                      {flagged[change.path] && <Flag size={13} className="fx-flag-icon" aria-label="Flagged" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {selected && (
          <ChangeDetail
            key={selected.path}
            change={selected}
            flagged={Boolean(flagged[selected.path])}
            canAct={canAct}
            busyPath={busyPath}
            restoringPath={restoringPath}
            onMarkSafe={onMarkSafe}
            onFlag={onFlag}
            onRestore={onRestore}
          />
        )}
      </div>
    </>
  );
}
