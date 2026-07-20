import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  File,
  RotateCcw,
  ListTree,
  Eye,
} from 'lucide-react';
import {
  DocumentCompareModal,
  DocumentPageCompare,
  ExpandFullViewButton,
} from './DocumentPageView';

const TYPE_LABELS = {
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  pdf: 'PDF',
  rtf: 'Rich text',
  image: 'Image',
  text: 'Text',
  document: 'Document',
  spreadsheet: 'Excel',
  presentation: 'PowerPoint',
  binary: 'Other file',
};

function getFileIcon(diff) {
  const type = diff?.document_type || diff?.preview_type;
  if (type === 'spreadsheet' || type === 'excel') return FileSpreadsheet;
  if (type === 'presentation' || type === 'powerpoint') return Presentation;
  if (type === 'image') return FileImage;
  if (type === 'binary') return File;
  return FileText;
}

function fileBaseName(filePath) {
  return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
}

function normalizeDiff(diffData) {
  if (!diffData) return null;
  if (Array.isArray(diffData)) {
    const before = diffData
      .filter((line) => line.startsWith('-') && !line.startsWith('---'))
      .map((line) => line.slice(1));
    const after = diffData
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1));
    return {
      before,
      after,
      changed_before_lines: before.map((_, i) => i),
      changed_after_lines: after.map((_, i) => i),
      preview_type: 'text',
      summary: {
        lines_removed: before.length,
        lines_added: after.length,
        total_changes: before.length + after.length,
      },
    };
  }
  return diffData;
}

function buildSummaryText(diff) {
  if (!diff?.summary) return 'This file was changed';
  if (diff.preview_type === 'image') return 'The picture looks different now';
  if (diff.preview_type === 'spreadsheet' && diff.summary.cells_changed != null) {
    const count = diff.summary.cells_changed;
    return `${count} cell${count !== 1 ? 's' : ''} in the spreadsheet changed`;
  }
  const removed = diff.summary.lines_removed || 0;
  const added = diff.summary.lines_added || 0;
  if (diff.preview_type === 'binary') {
    return 'This file changed (preview not available for this format)';
  }
  if (removed === 0 && added === 0) {
    return diff.message
      ? 'File changed — the words look the same (maybe formatting)'
      : 'This file was changed';
  }
  if (removed > 0 && added > 0) {
    return `${removed} part${removed !== 1 ? 's' : ''} changed · ${added} part${added !== 1 ? 's' : ''} updated`;
  }
  if (removed > 0) return `${removed} part${removed !== 1 ? 's' : ''} removed or rewritten`;
  return `${added} part${added !== 1 ? 's' : ''} added or updated`;
}

function ChangeStats({ diff }) {
  if (!diff?.summary || diff.preview_type === 'image') return null;
  const removed = diff.summary.lines_removed || 0;
  const added = diff.summary.lines_added || 0;
  const cells = diff.summary.cells_changed;
  if (cells != null) {
    return (
      <div className="fc-stats">
        <span className="fc-stat after">{cells} cell{cells !== 1 ? 's' : ''} changed</span>
      </div>
    );
  }
  if (removed === 0 && added === 0) return null;
  return (
    <div className="fc-stats">
      {removed > 0 && <span className="fc-stat before">{removed} changed in original</span>}
      {added > 0 && <span className="fc-stat after">{added} changed in current</span>}
    </div>
  );
}

function ChangePairsList({ diff }) {
  const before = diff?.before || [];
  const after = diff?.after || [];
  const changedBefore = [...(diff?.changed_before_lines || [])].sort((a, b) => a - b);
  const changedAfter = [...(diff?.changed_after_lines || [])].sort((a, b) => a - b);
  const maxLen = Math.max(changedBefore.length, changedAfter.length);

  if (!maxLen) {
    return <p className="fc-unavailable">No readable text changes detected on this page.</p>;
  }

  return (
    <div className="fc-pairs">
      {Array.from({ length: maxLen }, (_, index) => (
        <article key={index} className="fc-pair">
          <header className="fc-pair-title">Change {index + 1}</header>
          <div className="fc-pair-body">
            <div className="fc-pair-side before">
              <span className="fc-pair-label">Before</span>
              <p>{before[changedBefore[index]] ?? <em className="fc-pair-empty">Removed</em>}</p>
            </div>
            <div className="fc-pair-arrow" aria-hidden="true">→</div>
            <div className="fc-pair-side after">
              <span className="fc-pair-label">Now</span>
              <p>{after[changedAfter[index]] ?? <em className="fc-pair-empty">Added</em>}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FileChangeCard({
  filePath,
  diffData,
  fileMeta,
  onRestore,
  restoringPath,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('document');
  const diff = normalizeDiff(diffData);
  const fileName = fileBaseName(filePath);
  const Icon = getFileIcon(diff);
  const canRestore = fileMeta?.can_restore ?? diff?.can_restore;
  const isRestoring = restoringPath === filePath;
  const typeLabel = TYPE_LABELS[diff?.document_type]
    || TYPE_LABELS[diff?.preview_type]
    || diff?.file_type
    || 'File';
  const isBinary = !diff || diff?.preview_type === 'binary';
  const canCompare = Boolean(
    diff &&
    !isBinary &&
    (diff.preview_type === 'image' || (Array.isArray(diff.before) && Array.isArray(diff.after)))
  );
  const summaryText = diff ? buildSummaryText(diff) : 'This file was changed';

  const handleRestoreClick = (event) => {
    event.stopPropagation();
    if (onRestore && canRestore) onRestore(filePath);
  };

  return (
    <>
      <article className={`fc-card ${expanded ? 'expanded' : ''}`}>
        <button
          type="button"
          className="fc-card-header"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          <div className="fc-card-main">
            <span className="fc-card-icon-wrap">
              <Icon size={22} />
            </span>
            <div className="fc-card-meta">
              <span className="fc-card-name">{fileName}</span>
              <span className="fc-card-summary">{summaryText}</span>
              <span className="fc-card-path" title={filePath}>{filePath}</span>
            </div>
          </div>
          <div className="fc-card-aside">
            <span className="fc-type">{typeLabel}</span>
            <span className="fc-badge">Changed</span>
            <span className="fc-expand-hint">
              <Eye size={14} />
              {expanded ? 'Hide' : 'Review'}
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </div>
        </button>

        {expanded && (
          <div className="fc-card-body">
            {isBinary ? (
              <div className="fc-binary">
                <p>
                  {diff?.message
                    || 'We detected a change in this file, but we cannot show a readable preview for this format.'}
                </p>
                {canRestore && (
                  <p className="fc-hint">You can still undo and put the original file back from your backup.</p>
                )}
              </div>
            ) : canCompare ? (
              <>
                <ChangeStats diff={diff} />
                {diff.message && <p className="fc-note">{diff.message}</p>}
                <p className="fc-intro">
                  See the file as a real page with changes highlighted inside it.
                  Open full view to browse all pages and jump between changes.
                </p>

                <div className="fc-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    className={`fc-tab ${viewMode === 'document' ? 'active' : ''}`}
                    onClick={() => setViewMode('document')}
                  >
                    📄 See the document
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`fc-tab ${viewMode === 'changes' ? 'active' : ''}`}
                    onClick={() => setViewMode('changes')}
                  >
                    <ListTree size={15} /> Just the changes
                  </button>
                </div>

                {viewMode === 'document' ? (
                  <>
                    <DocumentPageCompare filePath={filePath} diff={diff} compact />
                    <div className="doc-expand-row">
                      <ExpandFullViewButton onClick={() => setModalOpen(true)} />
                    </div>
                  </>
                ) : (
                  <ChangePairsList diff={diff} />
                )}
              </>
            ) : (
              <div className="fc-binary">
                <p>This file changed, but a readable comparison is not available yet.</p>
              </div>
            )}

            {canRestore && onRestore && (
              <div className="fc-actions">
                <button
                  type="button"
                  className="btn btn-secondary fc-restore-btn"
                  onClick={handleRestoreClick}
                  disabled={isRestoring}
                >
                  <RotateCcw size={16} className={isRestoring ? 'animate-spin' : ''} />
                  {isRestoring ? 'Restoring…' : 'Undo — restore the original file'}
                </button>
                <span className="fc-hint">
                  This replaces the current file with the backup from when monitoring started.
                </span>
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
        diff={diff}
        onRestore={onRestore}
        canRestore={canRestore}
        isRestoring={isRestoring}
      />
    </>
  );
}

export default function FileChangeViewer({
  modifiedFiles,
  textDifferences,
  fileMetadata,
  onRestore,
  restoringPath,
}) {
  if (!modifiedFiles?.length) return null;

  return (
    <div className="fc-list">
      <div className="fc-list-banner">
        <strong>How to read this</strong>
        <span>
          Tap a file to see the document as a page — original on the left, current on the right.
          Pink = old, green = new. Use <strong>Open full view</strong> for big files to browse all pages.
        </span>
      </div>
      {modifiedFiles.map((file, index) => (
        <FileChangeCard
          key={file}
          filePath={file}
          diffData={textDifferences?.[file]}
          fileMeta={fileMetadata?.[file]}
          onRestore={onRestore}
          restoringPath={restoringPath}
          defaultExpanded={index === 0}
        />
      ))}
    </div>
  );
}
