import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Files,
  FileSearch,
  Folder,
  FileStack,
  PauseCircle,
  PlayCircle,
  ScanLine,
  ShieldCheck,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Banner, Button, EmptyState, FileTypeIcon, PageHeader, SkeletonRows, StatusBadge, SummaryCard } from './ui';
import { baseName, dirName, formatDateTime, normalizePath, plural, timeAgo } from './format';

const FILTERS = [
  { key: 'all', label: 'All files' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'intact', label: 'Unchanged' },
];
const COLLAPSED_ROWS = 10;

function GettingStarted({ canAct, folderLoading, onAddFolder, onAddFiles }) {
  const steps = [
    { icon: Folder, title: '1. Choose what to watch', text: 'Pick a folder, or a few specific files, from your computer.' },
    { icon: ShieldCheck, title: '2. We save a baseline', text: 'A baseline is a trusted snapshot of those files as they are right now.' },
    { icon: ScanLine, title: '3. Scan any time', text: 'FIMS compares your files with the baseline and tells you what changed.' },
  ];
  return (
    <section className="fx-card fx-start">
      <EmptyState
        icon={ShieldCheck}
        title="Let’s start protecting your files"
        text="Nothing is being monitored yet. Choose a folder or some files to get started — it only takes a few seconds."
        actions={(
          <>
            <Button variant="primary" icon={Folder} onClick={onAddFolder} loading={folderLoading} loadingLabel="Adding…" disabled={!canAct}>
              Choose a folder
            </Button>
            <Button icon={FileStack} onClick={onAddFiles} disabled={folderLoading || !canAct}>
              Choose files
            </Button>
          </>
        )}
      />
      {!canAct && <p className="fx-note fx-center">Your current role is read-only, so adding folders is turned off.</p>}
      <ol className="fx-steps">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title} className="fx-step">
            <span className="fx-step-icon" aria-hidden="true"><Icon size={20} /></span>
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ScanProgress({ progress, checking }) {
  if (!progress?.active && !checking) return null;
  const percent = progress?.active ? Math.min(100, Math.max(0, progress.percent || 0)) : null;
  return (
    <div className="fx-card fx-progress" role="status" aria-live="polite">
      <div className="fx-progress-top">
        <strong>{progress?.operation || 'Scanning your files…'}</strong>
        <span>{percent != null ? `${percent}%` : 'Working…'}</span>
      </div>
      <div className="fx-progress-bar" aria-hidden="true">
        <span className={percent == null ? 'is-indeterminate' : ''} style={percent != null ? { width: `${percent}%` } : undefined} />
      </div>
      {progress?.current_file && <span className="fx-progress-file">{progress.current_file}</span>}
    </div>
  );
}

export default function DashboardPage({
  status,
  monitoring,
  scanProgress,
  checkResult,
  changes,
  files,
  filesLoading,
  scanning,
  tamperDetected,
  canAct,
  folderLoading,
  onScan,
  onToggleMonitoring,
  onViewChange,
  onGoChanges,
  onGoFolders,
  onAddFolder,
  onAddFiles,
}) {
  const [filter, setFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const lastChecked = monitoring.last_check_at || null;
  const lastCheckedLabel = lastChecked ? timeAgo(lastChecked) : 'Not scanned yet';
  const rowCheckedAt = lastChecked || status.created_at;

  const changedCount = changes.length;
  const modifiedCount = changes.filter((c) => c.status === 'modified').length;
  const deletedCount = changes.filter((c) => c.status === 'deleted').length;
  const addedCount = changes.filter((c) => c.status === 'added').length;
  const totalFiles = status.file_count || 0;
  // Added files are not part of the baseline count; modified & deleted ones are.
  const unchangedCount = Math.max(0, totalFiles - modifiedCount - deletedCount);

  const rows = useMemo(() => {
    const changedPaths = new Set(changes.map((c) => normalizePath(c.path)));
    const changedRows = changes.map((c) => ({ path: c.path, name: c.name, status: c.status }));
    const seen = new Set();
    const intactRows = [];
    files.forEach((file) => {
      const key = normalizePath(file.path);
      if (changedPaths.has(key) || seen.has(key)) return;
      seen.add(key);
      intactRows.push({ path: file.path, name: file.name || baseName(file.path), status: 'intact' });
    });
    return [...changedRows, ...intactRows];
  }, [changes, files]);

  const visibleRows = rows.filter((row) => {
    if (filter === 'attention') return row.status !== 'intact';
    if (filter === 'intact') return row.status === 'intact';
    return true;
  });
  const limited = showAll ? visibleRows : visibleRows.slice(0, COLLAPSED_ROWS);

  if (!status.has_baseline) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="See at a glance whether any of your files have changed." />
        <GettingStarted canAct={canAct} folderLoading={folderLoading} onAddFolder={onAddFolder} onAddFiles={onAddFiles} />
      </>
    );
  }

  const hasScanned = Boolean(checkResult);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="See at a glance whether any of your files have changed."
        actions={(
          <>
            <Button
              variant="ghost"
              icon={monitoring.enabled ? PauseCircle : PlayCircle}
              onClick={onToggleMonitoring}
              title={monitoring.enabled ? 'Stop the automatic background scans' : 'Turn automatic background scans back on'}
            >
              {monitoring.enabled ? 'Pause auto-scan' : 'Resume auto-scan'}
            </Button>
            <Button variant="primary" icon={ScanLine} onClick={onScan} loading={scanning} loadingLabel="Scanning…" disabled={!canAct} title={canAct ? undefined : 'Your role is read-only'}>
              Run Scan
            </Button>
          </>
        )}
      />

      {tamperDetected && (
        <Banner
          tone="danger"
          icon={ShieldAlert}
          title="The saved baseline was altered outside of FIMS"
        >
          Its security signature no longer matches, so scan results can’t be fully trusted. Reset the baseline from
          “Folders &amp; Files” once you’ve checked the files yourself.
        </Banner>
      )}

      <ScanProgress progress={scanProgress} checking={scanning || monitoring.is_checking} />

      {!tamperDetected && (
        hasScanned && changedCount > 0 ? (
          <Banner
            tone="warning"
            icon={AlertTriangle}
            title={`${plural(changedCount, 'file')} changed since your baseline`}
            actions={<Button variant="primary" size="sm" icon={FileSearch} onClick={onGoChanges}>Review changes</Button>}
          >
            {[
              modifiedCount && `${modifiedCount} modified`,
              deletedCount && `${deletedCount} deleted`,
              addedCount && `${addedCount} added`,
            ].filter(Boolean).join(' · ')}
          </Banner>
        ) : hasScanned ? (
          <Banner tone="success" icon={CheckCircle2} title="All clear">
            Every monitored file matches your baseline. Last scan {lastCheckedLabel.toLowerCase()}.
          </Banner>
        ) : (
          <Banner tone="info" icon={Info} title="No scan has been run yet">
            Your baseline is saved. Press <strong>Run Scan</strong> to check your files now
            {monitoring.active ? `, or wait — automatic scans run every ${monitoring.interval_minutes} minutes.` : '.'}
          </Banner>
        )
      )}

      <section className="fx-summary-grid" aria-label="Summary">
        <SummaryCard icon={Files} label="Monitored files" value={totalFiles} hint={plural(status.monitor_count || 0, 'folder / group')} onClick={onGoFolders} />
        <SummaryCard icon={CheckCircle2} tone="intact" label="Unchanged" value={unchangedCount} hint="Match the baseline" />
        <SummaryCard
          icon={AlertTriangle}
          tone={changedCount ? 'modified' : 'neutral'}
          label="Changed / Alerts"
          value={changedCount}
          hint={changedCount ? 'Click to review' : hasScanned ? 'Nothing to review' : 'Run a scan to find out'}
          onClick={changedCount ? onGoChanges : undefined}
        />
        <SummaryCard icon={Clock} label="Last scan" value={lastCheckedLabel} hint={lastChecked ? formatDateTime(lastChecked) : 'Baseline saved ' + formatDateTime(status.created_at)} />
      </section>

      <section className="fx-card">
        <div className="fx-card-head">
          <div>
            <h2 className="fx-card-title">Recent file checks</h2>
            <p className="fx-card-sub">Files that changed are listed first.</p>
          </div>
          <div className="fx-segmented" role="group" aria-label="Filter files">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={filter === key ? 'is-active' : ''}
                aria-pressed={filter === key}
                onClick={() => { setFilter(key); setShowAll(false); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="fx-table-wrap">
          <table className="fx-table">
            <thead>
              <tr>
                <th scope="col">File name</th>
                <th scope="col">Status</th>
                <th scope="col">Last checked</th>
                <th scope="col" className="fx-col-action"><span className="fx-sr-only">Action</span></th>
              </tr>
            </thead>
            {filesLoading && rows.length === 0 ? (
              <SkeletonRows rows={4} cols={4} />
            ) : (
              <tbody>
                {limited.map((row) => (
                  <tr key={row.path} className={row.status !== 'intact' ? 'is-attention' : ''}>
                    <td>
                      <div className="fx-file-cell">
                        <span className="fx-file-icon"><FileTypeIcon path={row.path} /></span>
                        <div>
                          <div className="fx-file-name">{row.name}</div>
                          <div className="fx-file-path" title={row.path}>{dirName(row.path)}</div>
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="fx-muted" title={formatDateTime(rowCheckedAt)}>{rowCheckedAt ? timeAgo(rowCheckedAt) : '—'}</td>
                    <td className="fx-col-action">
                      {row.status !== 'intact' ? (
                        <Button size="sm" icon={FileSearch} onClick={() => onViewChange(row.path)}>View Changes</Button>
                      ) : (
                        <span className="fx-muted" aria-label="No changes to view">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        {!filesLoading && visibleRows.length === 0 && (
          <EmptyState
            icon={filter === 'attention' ? CheckCircle2 : Files}
            tone={filter === 'attention' ? 'intact' : 'neutral'}
            title={filter === 'attention' ? 'Nothing needs your attention' : 'No files to show'}
            text={filter === 'attention' ? 'All monitored files match the baseline.' : 'Try a different filter, or add a folder to watch.'}
          />
        )}

        {visibleRows.length > COLLAPSED_ROWS && (
          <div className="fx-card-foot">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer' : `Show all ${visibleRows.length} files`}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
