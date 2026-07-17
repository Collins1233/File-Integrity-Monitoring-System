import React, { useMemo, useState } from 'react';
import { FileText, ChevronDown, ChevronUp, Eye, RotateCcw, Search } from 'lucide-react';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function FileRow({ file, onRestore }) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);

    if (next && file.is_text_file && !preview) {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/files/preview?path=${encodeURIComponent(file.path)}`);
        if (res.ok) setPreview(await res.json());
      } catch (err) {
        console.error('Preview failed:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className={`monitored-file-row ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="monitored-file-header" onClick={handleToggle}>
        <div className="monitored-file-main">
          <FileText size={18} className="monitored-file-icon" />
          <div className="monitored-file-meta">
            <span className="monitored-file-name">{file.name}</span>
            <span className="monitored-file-path">{file.relative_path}</span>
          </div>
        </div>
        <div className="monitored-file-details">
          <span className="monitored-file-tag">{file.file_type}</span>
          {file.hash_only && <span className="monitored-file-tag">Hash-only</span>}
          <span className="monitored-file-size">{formatSize(file.size)}</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="monitored-file-body">
          <div className="monitored-file-info-grid">
            <div><span className="label">Type</span><span>{file.file_type}</span></div>
            <div><span className="label">Size</span><span>{formatSize(file.size)}</span></div>
            <div><span className="label">Last modified</span><span>{file.last_modified || '—'}</span></div>
            <div><span className="label">Full path</span><span className="path-value">{file.path}</span></div>
          </div>

          {file.has_backup && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => onRestore?.(file.path)}>
              <RotateCcw size={14} /> Restore from baseline backup
            </button>
          )}

          {loading && <p className="monitored-file-loading">Loading preview…</p>}

          {!loading && file.is_text_file && preview?.previewable && (
            <div className="monitored-file-preview">
              <div className="monitored-file-preview-header"><Eye size={14} /> Baseline snapshot</div>
              <pre>{preview.preview}</pre>
            </div>
          )}

          {!loading && file.hash_only && (
            <p className="monitored-file-note">Large file — monitored by hash only. Full text snapshot was skipped.</p>
          )}

          {!loading && !file.is_text_file && !file.hash_only && (
            <p className="monitored-file-note">Monitored by digital fingerprint. Office backups support diff on change.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MonitoredFilesPanel({ files, folderPath, monitors, activeMonitorId, onSelectMonitor, loading, onRestore }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    return files.filter((file) => {
      const matchesQuery = !query || file.name.toLowerCase().includes(query.toLowerCase()) || file.relative_path.toLowerCase().includes(query.toLowerCase());
      const matchesType = typeFilter === 'all' || file.file_type === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [files, query, typeFilter]);

  const fileTypes = useMemo(() => ['all', ...new Set(files.map((file) => file.file_type))], [files]);

  if (loading) {
    return <section className="glass-panel monitored-files-panel"><p className="text-muted">Loading monitored files…</p></section>;
  }

  if (!files.length) {
    return (
      <section className="glass-panel monitored-files-panel">
        <h3 className="card-title"><FileText size={18} /> Monitored Files</h3>
        <p className="text-muted">No files yet. Pick a folder to start monitoring — a baseline is created automatically.</p>
      </section>
    );
  }

  return (
    <section className="glass-panel monitored-files-panel">
      <div className="monitored-files-header">
        <div>
          <h3 className="card-title" style={{ marginBottom: '0.35rem' }}><FileText size={18} /> Monitored Files</h3>
          <p className="text-secondary" style={{ fontSize: '0.9rem' }}>
            {filtered.length} of {files.length} files in <strong>{folderPath}</strong>
          </p>
        </div>
      </div>

      {monitors?.length > 1 && (
        <div className="monitor-switcher">
          {monitors.map((monitor) => (
            <button
              key={monitor.id}
              type="button"
              className={`btn btn-secondary ${monitor.id === activeMonitorId ? 'active-monitor' : ''}`}
              onClick={() => onSelectMonitor?.(monitor.id)}
            >
              {monitor.folder_path.split('/').pop() || monitor.folder_path}
            </button>
          ))}
        </div>
      )}

      <div className="files-toolbar">
        <div className="files-search">
          <Search size={16} />
          <input type="text" placeholder="Search files…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {fileTypes.map((type) => (
            <option key={type} value={type}>{type === 'all' ? 'All types' : type}</option>
          ))}
        </select>
      </div>

      <div className="monitored-files-list">
        {filtered.map((file) => <FileRow key={file.path} file={file} onRestore={onRestore} />)}
      </div>
    </section>
  );
}
