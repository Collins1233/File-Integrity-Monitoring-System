import React, { useMemo, useState } from 'react';
import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileStack,
  FileText,
  Folder,
  Presentation,
  RotateCcw,
  Search,
  Eye,
  X,
} from 'lucide-react';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getFileIcon(extension) {
  const ext = (extension || '').toLowerCase();
  if (['.txt', '.md', '.log'].includes(ext)) return FileText;
  if (['.csv'].includes(ext)) return FileSpreadsheet;
  if (['.py', '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.xml', '.yaml', '.yml'].includes(ext)) return FileCode;
  if (['.xlsx', '.xls'].includes(ext)) return FileSpreadsheet;
  if (['.docx', '.doc'].includes(ext)) return FileText;
  if (['.pptx', '.ppt'].includes(ext)) return Presentation;
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return FileImage;
  if (['.zip', '.tar', '.gz', '.rar'].includes(ext)) return FileArchive;
  return File;
}

function monitorLabel(monitor) {
  if (monitor.monitor_type === 'files') {
    return monitor.folder_path.includes('(')
      ? monitor.folder_path
      : `${monitor.file_count} selected files`;
  }
  return monitor.folder_path.split('/').filter(Boolean).pop() || monitor.folder_path;
}

function FileDetailPanel({ file, onClose, onRestore }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (file.is_text_file) {
      setLoading(true);
      fetch(`${API_BASE}/api/files/preview?path=${encodeURIComponent(file.path)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled) setPreview(data);
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [file.path, file.is_text_file]);

  const Icon = getFileIcon(file.extension);

  return (
    <div className="file-detail-panel">
      <div className="file-detail-header">
        <div className="file-detail-title">
          <Icon size={22} />
          <div>
            <strong>{file.name}</strong>
            <span>{file.file_type}</span>
          </div>
        </div>
        <button type="button" className="file-detail-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="file-detail-grid">
        <div><span className="label">Size</span><span>{formatSize(file.size)}</span></div>
        <div><span className="label">Modified</span><span>{file.last_modified || 'N/A'}</span></div>
        <div className="file-detail-path"><span className="label">Path</span><span>{file.path}</span></div>
      </div>

      {file.hash_only && (
        <p className="monitored-file-note">Large file monitored by hash only. Full text snapshot was skipped.</p>
      )}

      {file.has_backup && (
        <button type="button" className="btn btn-secondary" onClick={() => onRestore?.(file.path)}>
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

      {!loading && !file.is_text_file && !file.hash_only && (
        <p className="monitored-file-note">Monitored by digital fingerprint. Office backups support diff on change.</p>
      )}
    </div>
  );
}

export default function MonitoredFilesPanel({
  files,
  folderPath,
  monitors,
  activeMonitorId,
  onSelectMonitor,
  loading,
  onRestore,
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState(null);

  const filtered = useMemo(() => {
    return files.filter((file) => {
      const matchesQuery = !query
        || file.name.toLowerCase().includes(query.toLowerCase())
        || file.relative_path.toLowerCase().includes(query.toLowerCase());
      const matchesType = typeFilter === 'all' || file.file_type === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [files, query, typeFilter]);

  const fileTypes = useMemo(() => ['all', ...new Set(files.map((file) => file.file_type))], [files]);

  if (loading) {
    return <section className="glass-panel monitored-files-panel"><p className="text-muted">Loading monitored files…</p></section>;
  }

  if (!files.length && !monitors?.length) {
    return (
      <section className="glass-panel monitored-files-panel">
        <h3 className="card-title"><FileText size={18} /> Monitored Files</h3>
        <p className="text-muted">No files yet. Pick a folder to start monitoring. A baseline is created automatically.</p>
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

      {monitors?.length > 0 && (
        <div className="monitor-icon-grid">
          {monitors.map((monitor) => {
            const MonitorIcon = monitor.monitor_type === 'files' ? FileStack : Folder;
            const active = monitor.id === activeMonitorId;
            return (
              <button
                key={monitor.id}
                type="button"
                className={`monitor-icon-tile ${active ? 'active' : ''}`}
                onClick={() => {
                  onSelectMonitor?.(monitor.id);
                  setSelectedFile(null);
                }}
              >
                <div className="monitor-icon-tile-icon">
                  <MonitorIcon size={28} strokeWidth={1.75} />
                </div>
                <span className="monitor-icon-tile-name">{monitorLabel(monitor)}</span>
                <span className="monitor-icon-tile-count">{monitor.file_count} files</span>
              </button>
            );
          })}
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

      {filtered.length === 0 ? (
        <p className="text-muted" style={{ padding: '1rem 0' }}>No files match your search.</p>
      ) : (
        <div className="files-icon-grid">
          {filtered.map((file) => {
            const Icon = getFileIcon(file.extension);
            const active = selectedFile?.path === file.path;
            return (
              <button
                key={file.path}
                type="button"
                className={`file-icon-tile ${active ? 'active' : ''}`}
                onClick={() => setSelectedFile(active ? null : file)}
                title={file.path}
              >
                <div className="file-icon-tile-graphic">
                  <Icon size={34} strokeWidth={1.6} />
                  {file.hash_only && <span className="file-icon-badge">Hash</span>}
                </div>
                <span className="file-icon-tile-name">{file.name}</span>
                <span className="file-icon-tile-meta">{formatSize(file.size)}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedFile && (
        <FileDetailPanel
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onRestore={onRestore}
        />
      )}
    </section>
  );
}
