import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, Eye } from 'lucide-react';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function FileRow({ file, onPreview }) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);

    if (next && file.is_text_file && !preview) {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/files/preview?path=${encodeURIComponent(file.path)}`
        );
        if (res.ok) {
          const data = await res.json();
          setPreview(data);
          onPreview?.(data);
        }
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

          {loading && <p className="monitored-file-loading">Loading preview…</p>}

          {!loading && file.is_text_file && preview?.previewable && (
            <div className="monitored-file-preview">
              <div className="monitored-file-preview-header">
                <Eye size={14} />
                Baseline snapshot
              </div>
              <pre>{preview.preview}</pre>
            </div>
          )}

          {!loading && !file.is_text_file && (
            <p className="monitored-file-note">
              Preview is not available for this file type. The file is still monitored using its digital fingerprint.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MonitoredFilesPanel({ files, folderPath, loading }) {
  if (loading) {
    return (
      <section className="glass-panel monitored-files-panel">
        <p className="text-muted">Loading monitored files…</p>
      </section>
    );
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
          <h3 className="card-title" style={{ marginBottom: '0.35rem' }}>
            <FileText size={18} /> Monitored Files
          </h3>
          <p className="text-secondary" style={{ fontSize: '0.9rem' }}>
            {files.length} file{files.length !== 1 ? 's' : ''} in <strong>{folderPath}</strong>
          </p>
        </div>
      </div>

      <div className="monitored-files-list">
        {files.map((file) => (
          <FileRow key={file.path} file={file} />
        ))}
      </div>
    </section>
  );
}
