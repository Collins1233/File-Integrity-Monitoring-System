import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  RotateCcw,
  Table2,
  Columns2,
  ListTree,
  Files,
} from 'lucide-react';
import { API_BASE } from './api';

const TYPE_LABELS = {
  word: 'Word document',
  excel: 'Excel spreadsheet',
  powerpoint: 'PowerPoint',
  pdf: 'PDF document',
  rtf: 'Rich text document',
  image: 'Image file',
  text: 'Text file',
  document: 'Document',
  spreadsheet: 'Excel spreadsheet',
  presentation: 'PowerPoint',
};

function getFileIcon(diff) {
  const type = diff?.document_type || diff?.preview_type;
  if (type === 'spreadsheet' || type === 'excel') return FileSpreadsheet;
  if (type === 'presentation' || type === 'powerpoint') return Presentation;
  if (type === 'image') return FileImage;
  return FileText;
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
  if (!diff?.summary) return 'Content changed';
  if (diff.preview_type === 'image') return 'Image visually changed';
  if (diff.document_type === 'pdf') {
    const total = diff.summary.total_changes || 0;
    return total > 0 ? `${total} section${total !== 1 ? 's' : ''} changed in PDF text` : 'PDF content changed';
  }
  if (diff.preview_type === 'spreadsheet' && diff.summary.cells_changed != null) {
    const count = diff.summary.cells_changed;
    return `${count} cell${count !== 1 ? 's' : ''} changed`;
  }
  const removed = diff.summary.lines_removed || 0;
  const added = diff.summary.lines_added || 0;
  if (removed === 0 && added === 0 && diff.preview_type === 'binary') {
    return 'File content changed (limited preview)';
  }
  return `${removed} section${removed !== 1 ? 's' : ''} changed, ${added} section${added !== 1 ? 's' : ''} updated`;
}

function buildChangePairs(diff) {
  const before = diff?.before || [];
  const after = diff?.after || [];
  const changedBefore = [...(diff?.changed_before_lines || [])].sort((a, b) => a - b);
  const changedAfter = [...(diff?.changed_after_lines || [])].sort((a, b) => a - b);
  const maxLen = Math.max(changedBefore.length, changedAfter.length);
  const pairs = [];

  for (let index = 0; index < maxLen; index += 1) {
    const beforeIndex = changedBefore[index];
    const afterIndex = changedAfter[index];
    pairs.push({
      id: `${beforeIndex ?? 'x'}-${afterIndex ?? 'x'}-${index}`,
      beforeLine: beforeIndex != null ? beforeIndex + 1 : null,
      afterLine: afterIndex != null ? afterIndex + 1 : null,
      beforeText: beforeIndex != null ? before[beforeIndex] : null,
      afterText: afterIndex != null ? after[afterIndex] : null,
    });
  }

  return pairs;
}

function ChangeStats({ diff }) {
  if (!diff?.summary || diff.preview_type === 'image') return null;

  const removed = diff.summary.lines_removed || 0;
  const added = diff.summary.lines_added || 0;
  const cells = diff.summary.cells_changed;

  if (cells != null) {
    return (
      <div className="file-change-stats">
        <span className="file-change-stat changed-after">{cells} cell{cells !== 1 ? 's' : ''} modified</span>
      </div>
    );
  }

  return (
    <div className="file-change-stats">
      {removed > 0 && (
        <span className="file-change-stat changed-before">
          {removed} removed or changed in original
        </span>
      )}
      {added > 0 && (
        <span className="file-change-stat changed-after">
          {added} added or changed in current file
        </span>
      )}
    </div>
  );
}

function LineBlock({
  lines,
  changedLines,
  variant,
  emptyLabel = 'No content',
  showUnchanged = true,
  compact = false,
}) {
  if (!lines || lines.length === 0) {
    return (
      <div className="file-compare-empty">
        <em>{emptyLabel}</em>
      </div>
    );
  }

  const changedSet = new Set(changedLines || []);
  const visibleLines = showUnchanged
    ? lines.map((line, index) => ({ line, index }))
    : (changedLines || []).map((index) => ({ line: lines[index], index }));

  if (!showUnchanged && visibleLines.length === 0) {
    return (
      <div className="file-compare-empty">
        <em>No changes on this side</em>
      </div>
    );
  }

  return (
    <div className={`file-compare-lines ${compact ? 'compact' : ''}`}>
      {visibleLines.map(({ line, index }) => {
        const isHeader = typeof line === 'string' && line.startsWith('──');
        const isChanged = changedSet.has(index);
        const displayLineNumber = index + 1;

        return (
          <div
            key={`${index}-${displayLineNumber}`}
            className={[
              'file-compare-line',
              isHeader ? 'file-compare-section' : '',
              isChanged ? `changed-${variant}` : showUnchanged ? 'file-compare-line-unchanged' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="file-compare-lineno">{isHeader ? '' : displayLineNumber}</span>
            <span className="file-compare-text">{line || '\u00A0'}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChangePairsList({ pairs }) {
  if (!pairs.length) {
    return <p className="file-change-unavailable">No readable text changes were detected.</p>;
  }

  return (
    <div className="file-change-pairs">
      {pairs.map((pair, index) => (
        <div key={pair.id} className="file-change-pair-card">
          <div className="file-change-pair-header">Change {index + 1}</div>
          <div className="file-change-pair-grid">
            <div className="file-change-pair-side before">
              <span className="file-change-pair-label">
                Original{pair.beforeLine ? ` · line ${pair.beforeLine}` : ''}
              </span>
              <p>{pair.beforeText ?? <em className="file-change-pair-empty">(removed or empty)</em>}</p>
            </div>
            <div className="file-change-pair-side after">
              <span className="file-change-pair-label">
                Current{pair.afterLine ? ` · line ${pair.afterLine}` : ''}
              </span>
              <p>{pair.afterText ?? <em className="file-change-pair-empty">(added or empty)</em>}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExcelChangesTable({ changes }) {
  if (!changes?.length) {
    return <p className="file-change-unavailable">No cell-level changes detected.</p>;
  }

  return (
    <div className="excel-changes-wrap">
      <table className="excel-changes-table">
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Cell</th>
            <th>Original value</th>
            <th>Current value</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change, index) => (
            <tr key={`${change.sheet}-${change.cell}-${index}`}>
              <td>{change.sheet}</td>
              <td><code>{change.cell}</code></td>
              <td className="excel-cell-before">{change.before || <em>(empty)</em>}</td>
              <td className="excel-cell-after">{change.after || <em>(empty)</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparePanels({ diff, mode = 'full' }) {
  const isChangesOnly = mode === 'changes';
  const pairs = isChangesOnly ? buildChangePairs(diff) : [];

  if (isChangesOnly) {
    return (
      <div className="file-change-changes-only">
        <ChangePairsList pairs={pairs} />
        <div className="file-compare-grid file-compare-grid-compact">
          <div className="file-compare-panel">
            <div className="file-compare-panel-header before">
              <span className="file-compare-dot" />
              Original — changed sections only
            </div>
            <LineBlock
              lines={diff.before}
              changedLines={diff.changed_before_lines}
              variant="before"
              showUnchanged={false}
              compact
              emptyLabel="Nothing removed from the original"
            />
          </div>
          <div className="file-compare-panel">
            <div className="file-compare-panel-header after">
              <span className="file-compare-dot" />
              Current — changed sections only
            </div>
            <LineBlock
              lines={diff.after}
              changedLines={diff.changed_after_lines}
              variant="after"
              showUnchanged={false}
              compact
              emptyLabel="Nothing new in the current file"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="file-compare-grid file-compare-grid-full">
      <div className="file-compare-panel">
        <div className="file-compare-panel-header before">
          <span className="file-compare-dot" />
          Full original file
        </div>
        <LineBlock
          lines={diff.before}
          changedLines={diff.changed_before_lines}
          variant="before"
          showUnchanged
          emptyLabel="No original content captured"
        />
      </div>
      <div className="file-compare-panel">
        <div className="file-compare-panel-header after">
          <span className="file-compare-dot" />
          Full current file
        </div>
        <LineBlock
          lines={diff.after}
          changedLines={diff.changed_after_lines}
          variant="after"
          showUnchanged
          emptyLabel="No current content found"
        />
      </div>
    </div>
  );
}

function ImageComparePanels({ filePath }) {
  const contentBase = `${API_BASE}/api/files/content?path=${encodeURIComponent(filePath)}`;
  return (
    <div className="file-compare-grid">
      <div className="file-compare-panel">
        <div className="file-compare-panel-header before">
          <span className="file-compare-dot" />
          Original image
        </div>
        <div className="file-compare-image-wrap">
          <img
            src={`${contentBase}&version=baseline`}
            alt="Original version"
            className="file-compare-image"
          />
        </div>
      </div>
      <div className="file-compare-panel">
        <div className="file-compare-panel-header after">
          <span className="file-compare-dot" />
          Current image
        </div>
        <div className="file-compare-image-wrap">
          <img
            src={`${contentBase}&version=current`}
            alt="Current version"
            className="file-compare-image"
          />
        </div>
      </div>
    </div>
  );
}

function ViewTabs({ viewMode, setViewMode, hasExcelChanges, cellCount }) {
  if (hasExcelChanges) {
    return (
      <div className="file-change-view-tabs" role="tablist" aria-label="Change view">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'changes'}
          className={`file-change-view-tab ${viewMode === 'changes' ? 'active' : ''}`}
          onClick={() => setViewMode('changes')}
        >
          <Table2 size={15} /> What changed ({cellCount} cells)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'full'}
          className={`file-change-view-tab ${viewMode === 'full' ? 'active' : ''}`}
          onClick={() => setViewMode('full')}
        >
          <Files size={15} /> Full spreadsheet
        </button>
      </div>
    );
  }

  return (
    <div className="file-change-view-tabs" role="tablist" aria-label="Change view">
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === 'changes'}
        className={`file-change-view-tab ${viewMode === 'changes' ? 'active' : ''}`}
        onClick={() => setViewMode('changes')}
      >
        <ListTree size={15} /> What changed
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === 'full'}
        className={`file-change-view-tab ${viewMode === 'full' ? 'active' : ''}`}
        onClick={() => setViewMode('full')}
      >
        <Columns2 size={15} /> Full file side by side
      </button>
    </div>
  );
}

function FileChangeCard({ filePath, diffData, fileMeta, onRestore, restoringPath }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState('changes');
  const diff = normalizeDiff(diffData);
  const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
  const Icon = getFileIcon(diff);
  const canRestore = fileMeta?.can_restore ?? diff?.can_restore;
  const isRestoring = restoringPath === filePath;
  const typeLabel = TYPE_LABELS[diff?.document_type] || TYPE_LABELS[diff?.preview_type] || diff?.file_type || 'File';
  const hasExcelChanges = diff?.preview_type === 'spreadsheet' && diff?.cell_changes?.length > 0;
  const isBinary = diff?.preview_type === 'binary';
  const isImage = diff?.preview_type === 'image';

  const summaryText = diff ? buildSummaryText(diff) : 'Content changed (preview not available)';

  const handleRestoreClick = (event) => {
    event.stopPropagation();
    if (onRestore && canRestore) onRestore(filePath);
  };

  return (
    <div className={`file-change-card ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="file-change-header"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="file-change-header-main">
          <Icon size={20} className="file-change-icon" />
          <div className="file-change-meta">
            <span className="file-change-name">{fileName}</span>
            <span className="file-change-path">{filePath}</span>
            <span className="file-change-summary">{summaryText}</span>
          </div>
        </div>
        <div className="file-change-header-actions">
          <span className="file-change-type-badge">{typeLabel}</span>
          <span className="file-change-badge">Modified</span>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="file-change-body">
          {!diff || isBinary ? (
            <div className="file-change-binary-panel">
              <p className="file-change-unavailable">
                {diff?.message || 'This file was changed, but a readable preview is not available for this file type.'}
              </p>
              {canRestore && (
                <p className="file-change-restore-hint">
                  You can undo this change and restore the original file from your baseline backup.
                </p>
              )}
            </div>
          ) : isImage ? (
            <>
              <p className="file-change-intro">
                The image changed. Compare the original baseline copy with the current file on disk.
              </p>
              <ImageComparePanels filePath={filePath} />
            </>
          ) : (
            <>
              <ChangeStats diff={diff} />
              <p className="file-change-intro">
                {viewMode === 'changes'
                  ? 'Start with a quick summary of what changed. Switch to Full file to read both versions in context with changes highlighted.'
                  : 'Full original and current files shown side by side. Changed sections are highlighted; unchanged text is shown for context.'}
              </p>

              <ViewTabs
                viewMode={viewMode}
                setViewMode={setViewMode}
                hasExcelChanges={hasExcelChanges}
                cellCount={diff.cell_changes?.length || 0}
              />

              {hasExcelChanges && viewMode === 'changes' ? (
                <ExcelChangesTable changes={diff.cell_changes} />
              ) : (
                <ComparePanels diff={diff} mode={viewMode} />
              )}

              {viewMode === 'full' && !hasExcelChanges && (
                <p className="file-change-legend">
                  <span className="legend-item changed-before">Red</span> = changed or removed from original
                  {' · '}
                  <span className="legend-item changed-after">Green</span> = changed or added in current file
                </p>
              )}
            </>
          )}

          {canRestore && onRestore && (
            <div className="file-change-actions">
              <button
                type="button"
                className="btn btn-secondary file-change-restore-btn"
                onClick={handleRestoreClick}
                disabled={isRestoring}
              >
                <RotateCcw size={16} className={isRestoring ? 'animate-spin' : ''} />
                {isRestoring ? 'Restoring…' : 'Undo changes — restore original file'}
              </button>
              <span className="file-change-restore-note">
                Replaces the current file with the baseline backup. Run Check Now again to verify.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
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
    <div className="file-change-list">
      {modifiedFiles.map((file) => (
        <FileChangeCard
          key={file}
          filePath={file}
          diffData={textDifferences?.[file]}
          fileMeta={fileMetadata?.[file]}
          onRestore={onRestore}
          restoringPath={restoringPath}
        />
      ))}
    </div>
  );
}
