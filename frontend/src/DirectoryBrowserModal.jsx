import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileStack,
  ArrowUp,
  HardDrive,
  Search,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  Home,
  Laptop,
  Layers,
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DirectoryBrowserModal({
  open,
  mode = 'folder', // 'folder' | 'files'
  apiBase = 'http://localhost:8000',
  onClose,
  onSelectFolder,
  onSelectFiles,
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [roots, setRoots] = useState([]);
  const [presets, setPresets] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState(new Set());

  // Fetch directory listing
  const fetchDirectory = async (targetPath = '') => {
    setLoading(true);
    setError(null);
    try {
      const url = targetPath
        ? `${apiBase}/api/browse-directory?path=${encodeURIComponent(targetPath)}`
        : `${apiBase}/api/browse-directory`;
      
      const token = localStorage.getItem('fim_token') || sessionStorage.getItem('fim_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Failed to read directory' }));
        throw new Error(errData.detail || `Server responded with status ${res.status}`);
      }
      const data = await res.json();
      setCurrentPath(data.current_path || '');
      setPathInput(data.current_path || '');
      setParentPath(data.parent_path || null);
      setRoots(data.roots || []);
      setPresets(data.presets || []);
      setItems(data.items || []);
      setSelectedFiles(new Set()); // Reset selected files on directory change
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load when opened
  useEffect(() => {
    if (open) {
      fetchDirectory(currentPath);
    }
  }, [open]);

  // Handle ESC key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Filtered items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  // Breadcrumbs calculation
  const breadcrumbSegments = useMemo(() => {
    if (!currentPath) return [];
    // Support Windows ('\') and POSIX ('/')
    const separator = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(separator).filter(Boolean);
    const segments = [];
    let acc = '';

    parts.forEach((part, index) => {
      if (separator === '\\' && index === 0 && part.includes(':')) {
        acc = `${part}\\`;
      } else if (separator === '/') {
        acc = `${acc}/${part}`;
      } else {
        acc = acc ? `${acc}\\${part}` : part;
      }
      segments.push({ name: part, path: acc });
    });

    return segments;
  }, [currentPath]);

  if (!open) return null;

  const handleNavigate = (path) => {
    setSearchQuery('');
    fetchDirectory(path);
  };

  const handlePathSubmit = (e) => {
    e.preventDefault();
    if (pathInput.trim()) {
      handleNavigate(pathInput.trim());
    }
  };

  const toggleFileSelection = (filePath) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (mode === 'folder') {
      onSelectFolder(currentPath);
      onClose();
    } else {
      if (selectedFiles.size === 0) return;
      onSelectFiles(Array.from(selectedFiles));
      onClose();
    }
  };

  const getPresetIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes('demo')) return <Layers size={14} className="text-info" />;
    if (n.includes('desktop')) return <Laptop size={14} className="text-primary" />;
    if (n.includes('home')) return <Home size={14} className="text-warning" />;
    return <Folder size={14} className="text-secondary" />;
  };

  return (
    <div className="confirm-overlay" onClick={onClose} role="presentation">
      <div
        className="browser-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="browser-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="browser-modal-header">
          <div className="browser-modal-title-group">
            <div className="browser-modal-icon">
              {mode === 'folder' ? <FolderOpen size={22} /> : <FileStack size={22} />}
            </div>
            <div>
              <h2 id="browser-dialog-title" className="browser-modal-title">
                {mode === 'folder' ? 'Select Target Directory' : 'Select Files to Monitor'}
              </h2>
              <p className="browser-modal-subtitle">
                In-app file explorer — works seamlessly across all browsers and operating systems.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="browser-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Preset Shortcuts Bar */}
        <div className="browser-presets-bar">
          <span className="browser-presets-label">Shortcuts:</span>
          {presets.map((preset) => (
            <button
              key={preset.path}
              type="button"
              className={`browser-preset-pill ${currentPath === preset.path ? 'active' : ''}`}
              onClick={() => handleNavigate(preset.path)}
              title={preset.description || preset.path}
            >
              {getPresetIcon(preset.name)}
              <span>{preset.name}</span>
            </button>
          ))}
          {roots.length > 0 && (
            <div className="browser-roots-group">
              {roots.map((root) => (
                <button
                  key={root}
                  type="button"
                  className={`browser-preset-pill browser-root-pill ${currentPath === root ? 'active' : ''}`}
                  onClick={() => handleNavigate(root)}
                  title={`Drive ${root}`}
                >
                  <HardDrive size={13} />
                  <span>{root}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Path Navigation Bar */}
        <div className="browser-nav-bar">
          <button
            type="button"
            className="browser-nav-btn"
            onClick={() => parentPath && handleNavigate(parentPath)}
            disabled={!parentPath || loading}
            title={parentPath ? `Go up to: ${parentPath}` : 'At root directory'}
          >
            <ArrowUp size={16} />
            <span>Up</span>
          </button>

          <form className="browser-path-form" onSubmit={handlePathSubmit}>
            <input
              type="text"
              className="browser-path-input"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="Paste or type path..."
            />
            <button
              type="submit"
              className="browser-nav-btn browser-go-btn"
              disabled={loading}
              title="Navigate to path"
            >
              Go
            </button>
          </form>

          <button
            type="button"
            className="browser-nav-btn"
            onClick={() => fetchDirectory(currentPath)}
            disabled={loading}
            title="Refresh directory"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {/* Breadcrumb Path Bar */}
        {breadcrumbSegments.length > 0 && (
          <div className="browser-breadcrumbs">
            {breadcrumbSegments.map((segment, idx) => (
              <React.Fragment key={segment.path}>
                {idx > 0 && <ChevronRight size={13} className="browser-crumb-divider" />}
                <button
                  type="button"
                  className={`browser-crumb-btn ${idx === breadcrumbSegments.length - 1 ? 'current' : ''}`}
                  onClick={() => handleNavigate(segment.path)}
                  title={segment.path}
                >
                  {segment.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Search / Filter Bar */}
        <div className="browser-filter-bar">
          <div className="browser-filter-input-wrap">
            <Search size={15} className="browser-filter-icon" />
            <input
              type="text"
              className="browser-filter-input"
              placeholder="Filter files and folders in current directory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="browser-filter-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear filter"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <span className="browser-item-count">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="browser-error-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Items Listing Container */}
        <div className="browser-items-container">
          {loading ? (
            <div className="browser-loading-state">
              <RefreshCw size={26} className="spin text-primary" />
              <span>Scanning directory...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="browser-empty-state">
              <Folder size={32} className="text-secondary opacity-50" />
              <p>No accessible items found in this directory.</p>
            </div>
          ) : (
            <table className="browser-table">
              <thead>
                <tr>
                  {mode === 'files' && <th style={{ width: '38px' }}></th>}
                  <th>Name</th>
                  <th style={{ width: '100px' }}>Size</th>
                  <th style={{ width: '160px' }}>Modified</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isSelected = selectedFiles.has(item.path);
                  return (
                    <tr
                      key={item.path}
                      className={`browser-row ${item.is_dir ? 'is-dir' : 'is-file'} ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        if (item.is_dir) {
                          handleNavigate(item.path);
                        } else if (mode === 'files') {
                          toggleFileSelection(item.path);
                        }
                      }}
                    >
                      {mode === 'files' && (
                        <td onClick={(e) => e.stopPropagation()}>
                          {!item.is_dir ? (
                            <input
                              type="checkbox"
                              className="browser-checkbox"
                              checked={isSelected}
                              onChange={() => toggleFileSelection(item.path)}
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="browser-name-cell">
                        {item.is_dir ? (
                          <Folder size={17} className="browser-item-icon folder-icon" />
                        ) : (
                          <FileText size={17} className="browser-item-icon file-icon" />
                        )}
                        <span className="browser-item-name" title={item.path}>
                          {item.name}
                        </span>
                      </td>
                      <td className="browser-meta-cell">
                        {item.is_dir ? '—' : formatBytes(item.size)}
                      </td>
                      <td className="browser-meta-cell">{item.modified || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="browser-modal-footer">
          <div className="browser-footer-status">
            {mode === 'folder' ? (
              <span title={currentPath}>
                Target: <strong>{currentPath || 'None selected'}</strong>
              </span>
            ) : (
              <span>
                <strong>{selectedFiles.size}</strong> file{selectedFiles.size === 1 ? '' : 's'} selected
              </span>
            )}
          </div>
          <div className="browser-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={loading || (mode === 'files' && selectedFiles.size === 0)}
            >
              <Check size={16} />
              {mode === 'folder'
                ? 'Select This Folder'
                : `Monitor Selected Files (${selectedFiles.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
