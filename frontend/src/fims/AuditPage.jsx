import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FileDown,
  History,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button, EmptyState, PageHeader } from './ui';
import { LOG_CATEGORIES, buildHistory } from './auditLog';
import { formatBytes, formatDateTime, parseDate } from './format';

const PAGE_SIZE = 40;

function newestFirst(reports) {
  return [...reports].sort((a, b) => (parseDate(b.created_at)?.getTime() || 0) - (parseDate(a.created_at)?.getTime() || 0));
}

function ReportsCard({ reports, previewReport, onPreview, onClosePreview, onDownload, onDelete, isAdmin, canAct, scanning, onScan, apiBase }) {
  const sorted = useMemo(() => newestFirst(reports), [reports]);

  if (sorted.length === 0) {
    return (
      <section className="fx-card">
        <EmptyState
          icon={FileText}
          title="No PDF report yet"
          text="A PDF report is created automatically every time you run a scan. Run one now to create your first report."
          actions={<Button variant="primary" icon={ScanLine} onClick={onScan} loading={scanning} loadingLabel="Scanning…" disabled={!canAct}>Run Scan &amp; create report</Button>}
        />
      </section>
    );
  }

  return (
    <section className="fx-card">
      <div className="fx-card-head">
        <div>
          <h2 className="fx-card-title">PDF reports</h2>
          <p className="fx-card-sub">The {sorted.length === 1 ? 'report' : `${sorted.length} most recent reports`} from your scans.</p>
        </div>
      </div>

      <ul className="fx-report-list">
        {sorted.map((report, index) => (
          <li key={report.filename} className="fx-report">
            <span className="fx-report-icon" aria-hidden="true"><FileText size={20} /></span>
            <div className="fx-report-info">
              <strong>{report.filename}</strong>
              <span className="fx-muted">
                {index === 0 && <span className="fx-chip fx-chip--latest">Latest</span>}
                {formatDateTime(report.created_at)} · {formatBytes(report.size_bytes)}
              </span>
            </div>
            <div className="fx-report-actions">
              <Button size="sm" icon={Eye} onClick={() => onPreview(report.filename)}>Preview</Button>
              <Button size="sm" icon={Download} variant={index === 0 ? 'primary' : 'secondary'} onClick={() => onDownload(report.filename)}>Download</Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDelete(report.filename)} disabled={!isAdmin} title={isAdmin ? 'Delete this report' : 'Only admins can delete reports'} aria-label={`Delete ${report.filename}`} />
            </div>
          </li>
        ))}
      </ul>
      <p className="fx-note fx-pad">Only the most recent reports are kept; older ones are removed automatically.</p>

      {previewReport && (
        <div className="fx-preview">
          <div className="fx-preview-head">
            <strong>{previewReport}</strong>
            <Button size="sm" variant="ghost" icon={X} onClick={onClosePreview}>Close preview</Button>
          </div>
          <iframe title="Report preview" src={`${apiBase}/api/reports/${encodeURIComponent(previewReport)}/preview`} />
        </div>
      )}
    </section>
  );
}

function HistoryCard({ logs, apiBase }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const history = useMemo(() => buildHistory(logs), [logs]);
  const filtered = history.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!query) return true;
    const haystack = `${entry.title} ${entry.detail} ${entry.raw}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const visible = filtered.slice(0, limit);

  return (
    <section className="fx-card">
      <div className="fx-card-head">
        <div>
          <h2 className="fx-card-title">History</h2>
          <p className="fx-card-sub">Every scan and action, newest first.</p>
        </div>
        <div className="fx-export">
          <a className="fx-btn fx-btn--ghost fx-btn--sm" href={`${apiBase}/api/logs/export?format=csv`}><FileDown size={16} aria-hidden="true" /><span>Export CSV</span></a>
          <a className="fx-btn fx-btn--ghost fx-btn--sm" href={`${apiBase}/api/logs/export?format=json`}><FileDown size={16} aria-hidden="true" /><span>Export JSON</span></a>
        </div>
      </div>

      <div className="fx-toolbar">
        <label className="fx-search">
          <Search size={16} aria-hidden="true" />
          <span className="fx-sr-only">Search history</span>
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder="Search by file name or event…" />
        </label>
        <div className="fx-segmented fx-segmented--wrap" role="group" aria-label="Filter history">
          {LOG_CATEGORIES.map(({ key, label }) => (
            <button key={key} type="button" className={category === key ? 'is-active' : ''} aria-pressed={category === key} onClick={() => { setCategory(key); setLimit(PAGE_SIZE); }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {history.length === 0 ? (
        <EmptyState icon={History} title="Nothing recorded yet" text="Scans and actions will appear here as soon as they happen." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching entries" text="Try a different search or filter." />
      ) : (
        <ol className="fx-history">
          {visible.map((entry) => (
            <li key={entry.id} className="fx-history-item">
              <span className={`fx-dot fx-dot--${entry.tone}`} aria-hidden="true" />
              <div className="fx-history-body">
                <strong>{entry.title}</strong>
                {entry.detail && <span className="fx-history-detail" title={entry.detail}>{entry.detail}</span>}
              </div>
              <time className="fx-history-time" title={entry.timestamp}>{formatDateTime(entry.timestamp, entry.timestamp || '')}</time>
            </li>
          ))}
        </ol>
      )}

      {filtered.length > visible.length && (
        <div className="fx-card-foot">
          <Button variant="ghost" size="sm" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
            Show more ({filtered.length - visible.length} older)
          </Button>
        </div>
      )}
    </section>
  );
}

export default function AuditPage({
  logs,
  reports,
  previewReport,
  onPreviewReport,
  onClosePreview,
  onDownloadReport,
  onDeleteReport,
  isAdmin,
  canAct,
  scanning,
  onScan,
  apiBase,
}) {
  const latest = useMemo(() => newestFirst(reports)[0], [reports]);

  return (
    <>
      <PageHeader
        title="Audit Logs & Reports"
        subtitle="A record of everything FIMS has done, plus downloadable PDF reports for your records."
        actions={(
          <Button
            variant="primary"
            icon={Download}
            onClick={() => latest && onDownloadReport(latest.filename)}
            disabled={!latest}
            title={latest ? `Download ${latest.filename}` : 'Run a scan first to create a report'}
          >
            Download PDF Report
          </Button>
        )}
      />
      <ReportsCard
        reports={reports}
        previewReport={previewReport}
        onPreview={onPreviewReport}
        onClosePreview={onClosePreview}
        onDownload={onDownloadReport}
        onDelete={onDeleteReport}
        isAdmin={isAdmin}
        canAct={canAct}
        scanning={scanning}
        onScan={onScan}
        apiBase={apiBase}
      />
      <HistoryCard logs={logs} apiBase={apiBase} />
      <p className="fx-footnote"><CheckCircle2 size={14} aria-hidden="true" /> Audit entries are written by the server and can’t be edited from this screen.</p>
    </>
  );
}
