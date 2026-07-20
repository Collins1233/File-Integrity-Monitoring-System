import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, RotateCcw } from 'lucide-react';
import {
  DocumentCompareModal,
  DocumentPageCompare,
  ExpandFullViewButton,
  getTypeLabel,
} from './DocumentPageView';
import {
  buildSingleSideDiff,
  fetchPreviewLines,
  getDocumentStyleFromPath,
} from './documentDiffUtils';

/**
 * Document page preview for deleted files (baseline only) and new files (current only).
 */
export default function FileDocumentPreview({
  filePath,
  variant = 'deleted',
  fileMeta,
  onRestore,
  restoringPath,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewDiff, setPreviewDiff] = useState(null);

  const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
  const canRestore = fileMeta?.can_restore;
  const isRestoring = restoringPath === filePath;
  const mode = variant === 'deleted' ? 'baseline-only' : 'current-only';
  const version = variant === 'deleted' ? 'baseline' : 'current';

  useEffect(() => {
    if (!expanded) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await fetchPreviewLines(filePath, version);
      if (cancelled) return;

      if (result?.style === 'image') {
        setPreviewDiff({
          ...buildSingleSideDiff([], variant === 'deleted' ? 'before' : 'after'),
          preview_type: 'image',
        });
      } else if (result?.lines) {
        const side = variant === 'deleted' ? 'before' : 'after';
        setPreviewDiff({
          ...buildSingleSideDiff(result.lines, side),
          preview_type: result.style === 'sheet' ? 'spreadsheet' : 'text',
          document_type: getDocumentStyleFromPath(filePath, null),
        });
      } else {
        setPreviewDiff(null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [expanded, filePath, version, variant]);

  const typeLabel = getTypeLabel(filePath, previewDiff);

  return (
    <>
      <article className={`fc-card fc-status-card fc-status-${variant} ${expanded ? 'expanded' : ''}`}>
        <button
          type="button"
          className="fc-card-header"
          onClick={() => setExpanded((p) => !p)}
          aria-expanded={expanded}
        >
          <div className="fc-card-main">
            <span className="fc-card-icon-wrap">{variant === 'deleted' ? '🗑️' : '📄'}</span>
            <div className="fc-card-meta">
              <span className="fc-card-name">{fileName}</span>
              <span className="fc-card-summary">
                {variant === 'deleted'
                  ? 'File removed from disk — view the saved original'
                  : 'New file added after monitoring started'}
              </span>
              <span className="fc-card-path" title={filePath}>{filePath}</span>
            </div>
          </div>
          <div className="fc-card-aside">
            <span className="fc-type">{typeLabel}</span>
            <span className={`fc-badge fc-badge-${variant}`}>
              {variant === 'deleted' ? 'Deleted' : 'New'}
            </span>
            <span className="fc-expand-hint">
              <Eye size={14} />
              {expanded ? 'Hide' : 'View file'}
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </div>
        </button>

        {expanded && (
          <div className="fc-card-body">
            {loading && <p className="fc-intro">Loading document preview…</p>}

            {!loading && previewDiff && (
              <>
                <p className="fc-intro">
                  {variant === 'deleted'
                    ? 'This is the original file as it was when monitoring started.'
                    : 'This is the new file currently on your computer.'}
                </p>
                <DocumentPageCompare
                  filePath={filePath}
                  diff={previewDiff}
                  compact
                  mode={mode}
                />
                <div className="doc-expand-row">
                  <ExpandFullViewButton
                    onClick={() => setModalOpen(true)}
                    label="Open full view — browse all pages"
                  />
                </div>
              </>
            )}

            {!loading && !previewDiff && (
              <p className="fc-unavailable">
                {variant === 'deleted' && !canRestore
                  ? 'No backup copy is available to preview this deleted file.'
                  : 'Preview is not available for this file type.'}
              </p>
            )}

            {variant === 'deleted' && canRestore && onRestore && (
              <div className="fc-actions">
                <button
                  type="button"
                  className="btn btn-secondary fc-restore-btn"
                  onClick={() => onRestore(filePath)}
                  disabled={isRestoring}
                >
                  <RotateCcw size={16} className={isRestoring ? 'animate-spin' : ''} />
                  {isRestoring ? 'Restoring…' : 'Restore file from backup'}
                </button>
              </div>
            )}
          </div>
        )}
      </article>

      <DocumentCompareModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        filePath={filePath}
        fileName={fileName}
        diff={previewDiff}
        onRestore={variant === 'deleted' ? onRestore : undefined}
        canRestore={variant === 'deleted' && canRestore}
        isRestoring={isRestoring}
        mode={mode}
      />
    </>
  );
}
