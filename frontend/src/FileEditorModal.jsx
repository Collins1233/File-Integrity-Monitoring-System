import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Save,
  Zap,
  X,
  RotateCcw,
  Check,
  AlertTriangle,
  Code,
  FileCheck,
  Layers,
} from 'lucide-react';

export default function FileEditorModal({
  open,
  filePath,
  apiBase,
  apiFetch,
  onClose,
  onSaved,
}) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [filename, setFilename] = useState('');
  const [fileType, setFileType] = useState('text');
  const [isWord, setIsWord] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open || !filePath) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadContent = async () => {
      try {
        const fetchFn = apiFetch || fetch;
        const res = await fetchFn(`${apiBase}/api/files/text?path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (!isMounted) return;

        if (res.ok && data.success) {
          setContent(data.content || '');
          setOriginalContent(data.content || '');
          setFilename(data.filename || filePath.split(/[\\/]/).pop());
          setFileType(data.file_type || 'text');
          setIsWord(Boolean(data.is_word));
          setReadOnly(Boolean(data.read_only));
        } else {
          setError(data.detail || 'Failed to load file content.');
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Error loading file.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadContent();

    return () => {
      isMounted = false;
    };
  }, [open, filePath, apiBase, apiFetch]);

  // Support Tab key inside the editor textarea
  const handleKeyDown = (e) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      setContent(newVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const handleAppendTamperMarker = () => {
    const time = new Date().toLocaleTimeString();
    if (isWord) {
      const marker = `\n[UNAUTHORIZED EDIT] Modified in browser at ${time}\nIntegrity violation test paragraph.\n`;
      setContent((prev) => prev + marker);
    } else {
      const marker = `\n# [UNAUTHORIZED EDIT] Injected in browser editor at ${time}\nATTACK_SIMULATION_FLAG=true\n`;
      setContent((prev) => prev + marker);
    }
  };

  const handleReset = () => {
    setContent(originalContent);
  };

  const handleSave = async (checkImmediately = false) => {
    setSaving(true);
    setError(null);
    try {
      const fetchFn = apiFetch || fetch;
      const res = await fetchFn(`${apiBase}/api/files/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setOriginalContent(content);
        if (onSaved) {
          onSaved(filePath, checkImmediately, data.message);
        }
        onClose();
      } else {
        setError(data.detail || 'Failed to save file.');
      }
    } catch (err) {
      setError(err.message || 'Error saving file.');
    } finally {
      setSaving(false);
    }
  };

  const handleDirectTamper = async () => {
    setSaving(true);
    try {
      const fetchFn = apiFetch || fetch;
      const res = await fetchFn(`${apiBase}/api/files/simulate-tamper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (onSaved) {
          onSaved(filePath, true, data.message);
        }
        onClose();
      } else {
        setError(data.detail || 'Failed to tamper file.');
      }
    } catch (err) {
      setError(err.message || 'Error executing tamper.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const hasChanges = content !== originalContent;
  const lineCount = content ? content.split('\n').length : 0;
  const charCount = content ? content.length : 0;

  return (
    <div className="confirm-overlay" onClick={onClose} role="presentation" style={{ zIndex: 1200 }}>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '90vw',
          maxWidth: '860px',
          height: '85vh',
          maxHeight: '750px',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-glass-panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: isWord ? 'rgba(37, 99, 235, 0.18)' : 'rgba(59, 130, 246, 0.12)',
                color: isWord ? '#3b82f6' : 'var(--color-primary, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isWord ? <FileText size={22} /> : <Code size={22} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
                  {filename || 'File Editor'}
                </h3>

                {isWord && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(37, 99, 235, 0.15)',
                      color: '#60a5fa',
                      fontWeight: 600,
                    }}
                  >
                    📄 Word Document (.docx)
                  </span>
                )}

                {hasChanges ? (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: '#f59e0b',
                      fontWeight: 600,
                    }}
                  >
                    Unsaved changes
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      fontWeight: 600,
                    }}
                  >
                    Baseline pristine
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  maxWidth: '560px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={filePath}
              >
                {isWord ? 'Extracted readable document text. Edits are saved back into Word (.docx) format.' : filePath}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.45rem', borderRadius: '8px' }}
            title="Close editor"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar & Quick Tamper Controls */}
        <div
          style={{
            padding: '0.65rem 1.5rem',
            background: 'rgba(0, 0, 0, 0.12)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAppendTamperMarker}
                style={{
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.75rem',
                  color: '#f59e0b',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  gap: '0.4rem',
                }}
                title="Quickly append an unauthorized edit marker to test detection"
              >
                <Zap size={14} /> Inject Tamper Marker
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDirectTamper}
              disabled={saving}
              style={{
                fontSize: '0.82rem',
                padding: '0.35rem 0.75rem',
                color: '#f87171',
                borderColor: 'rgba(239, 68, 68, 0.35)',
                gap: '0.4rem',
              }}
              title="Instantly inject a test modification on disk and run integrity check"
            >
              <Zap size={14} /> ⚡ 1-Click Tamper & Scan
            </button>

            {hasChanges && !readOnly && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleReset}
                style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', gap: '0.4rem' }}
                title="Discard your current edits and reset to loaded version"
              >
                <RotateCcw size={14} /> Revert edits
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {lineCount} lines • {charCount} chars • {isWord ? 'Microsoft Word (.docx)' : 'UTF-8'}
          </div>
        </div>

        {/* Editor Body */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              Loading document text…
            </div>
          ) : error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-danger)' }}>
              <AlertTriangle size={32} style={{ marginBottom: '0.5rem' }} />
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDirectTamper}
                style={{ marginTop: '1rem', gap: '0.5rem', color: '#f59e0b' }}
              >
                <Zap size={16} /> Run 1-Click Tamper on this file instead
              </button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => !readOnly && setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              spellCheck={false}
              style={{
                flex: 1,
                width: '100%',
                padding: '1.25rem 1.5rem',
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                color: '#f8fafc',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: isWord ? 'system-ui, -apple-system, sans-serif' : 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                tabSize: 2,
              }}
              placeholder="Document is empty…"
            />
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-glass-panel)',
          }}
        >
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {isWord ? 'Edits are saved directly into the Word document on disk.' : 'Changes are saved directly to the monitored file on the server.'}
          </span>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
              style={{ padding: '0.6rem 1.1rem' }}
            >
              Cancel
            </button>
            {!readOnly && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleSave(false)}
                  disabled={saving || !hasChanges || loading}
                  style={{ padding: '0.6rem 1.1rem', gap: '0.5rem' }}
                >
                  <Save size={16} />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSave(true)}
                  disabled={saving || loading}
                  style={{ padding: '0.6rem 1.3rem', gap: '0.5rem' }}
                  title="Save changes and immediately run an integrity check to verify detection and see diffs"
                >
                  <Zap size={16} />
                  {saving ? 'Saving…' : 'Save & Check Now ⚡'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
