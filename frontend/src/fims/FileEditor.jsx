import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, RotateCcw, Save, ScanLine, X, Zap } from 'lucide-react';
import { Button } from './ui';

/**
 * Simple in-browser editor for text and Word (.docx) files.
 * Lets testers change a monitored file on the server and watch FIMS detect it.
 */
export default function FileEditor({ open, filePath, apiBase, apiFetch, onClose, onSaved }) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [filename, setFilename] = useState('');
  const [isWord, setIsWord] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const areaRef = useRef(null);

  useEffect(() => {
    if (!open || !filePath) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiFetch(`${apiBase}/api/files/text?path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (!alive) return;
        if (res.ok && data.success) {
          setContent(data.content || '');
          setOriginal(data.content || '');
          setFilename(data.filename || filePath.split(/[\\/]/).pop());
          setIsWord(Boolean(data.is_word));
          setReadOnly(Boolean(data.read_only));
        } else {
          setError(data.detail || 'We could not open this file.');
        }
      } catch (err) {
        if (alive) setError(err.message || 'We could not open this file.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, filePath, apiBase, apiFetch]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dirty = content !== original;
  const post = async (url, body) => {
    const res = await apiFetch(`${apiBase}${url}`, { method: 'POST', body: JSON.stringify(body) });
    return { res, data: await res.json() };
  };

  const save = async (scanAfter) => {
    setSaving(true);
    setError(null);
    try {
      const { res, data } = await post('/api/files/save', { path: filePath, content });
      if (res.ok && data.success) {
        setOriginal(content);
        onSaved?.(filePath, scanAfter, data.message);
        onClose();
      } else {
        setError(data.detail || 'Could not save the file.');
      }
    } catch (err) {
      setError(err.message || 'Could not save the file.');
    } finally {
      setSaving(false);
    }
  };

  const quickTamper = async () => {
    setSaving(true);
    setError(null);
    try {
      const { res, data } = await post('/api/files/simulate-tamper', { path: filePath });
      if (res.ok && data.success) {
        onSaved?.(filePath, true, data.message);
        onClose();
      } else {
        setError(data.detail || 'Could not change the file.');
      }
    } catch (err) {
      setError(err.message || 'Could not change the file.');
    } finally {
      setSaving(false);
    }
  };

  const addMarker = () => {
    const time = new Date().toLocaleTimeString();
    setContent((text) => `${text}${text.endsWith('\n') || !text ? '' : '\n'}[TEST EDIT] Added in the browser at ${time}\n`);
    areaRef.current?.focus();
  };

  return (
    <div className="fx-modal-overlay" role="presentation" onClick={onClose}>
      <div className="fx-modal fx-modal--lg" role="dialog" aria-modal="true" aria-labelledby="editor-title" onClick={(event) => event.stopPropagation()}>
        <div className="fx-modal-head">
          <div className="fx-modal-title">
            <span className="fx-modal-icon" aria-hidden="true"><FileText size={20} /></span>
            <div>
              <h2 id="editor-title">{filename || 'Edit file'}</h2>
              <code className="fx-path" title={filePath}>{filePath}</code>
            </div>
          </div>
          <button type="button" className="fx-icon-btn" onClick={onClose} aria-label="Close editor"><X size={18} /></button>
        </div>

        <div className="fx-modal-body fx-editor-body">
          <p className="fx-note">
            {readOnly
              ? 'This file type can be viewed here but not edited. Use “Make a test change” to see detection work.'
              : isWord
                ? 'This shows the text of your Word document. Saving writes your edits back into the .docx file on the server.'
                : 'Edit the text and save. FIMS will notice the file no longer matches its baseline.'}
          </p>

          {loading ? (
            <div className="fx-editor-state">Opening file…</div>
          ) : error && !content ? (
            <div className="fx-editor-state fx-editor-state--error">
              <AlertTriangle size={24} aria-hidden="true" />
              <p>{error}</p>
              <Button icon={Zap} onClick={quickTamper} loading={saving} loadingLabel="Working…">Make a test change instead</Button>
            </div>
          ) : (
            <textarea
              ref={areaRef}
              className={`fx-editor ${isWord ? 'is-prose' : ''}`}
              value={content}
              readOnly={readOnly}
              spellCheck={false}
              onChange={(event) => setContent(event.target.value)}
              aria-label="File contents"
            />
          )}
          {error && content && <p className="fx-inline-error" role="alert">{error}</p>}
        </div>

        <div className="fx-modal-foot fx-modal-foot--split">
          <div className="fx-row">
            {!readOnly && <Button size="sm" icon={Zap} onClick={addMarker} disabled={loading}>Add a test line</Button>}
            <Button size="sm" icon={Zap} onClick={quickTamper} disabled={saving || loading} title="Change the file on disk and scan straight away">Make a test change &amp; scan</Button>
            {dirty && !readOnly && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setContent(original)}>Undo my edits</Button>}
          </div>
          <div className="fx-row">
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
            {!readOnly && (
              <>
                <Button icon={Save} onClick={() => save(false)} loading={saving} loadingLabel="Saving…" disabled={!dirty || loading}>Save</Button>
                <Button variant="primary" icon={ScanLine} onClick={() => save(true)} loading={saving} loadingLabel="Saving…" disabled={loading}>Save &amp; scan</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
