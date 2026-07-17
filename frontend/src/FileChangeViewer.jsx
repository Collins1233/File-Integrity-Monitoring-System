import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

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
      summary: {
        lines_removed: before.length,
        lines_added: after.length,
        total_changes: before.length + after.length,
      },
    };
  }
  return diffData;
}

function LineBlock({ lines, changedLines, variant }) {
  if (!lines || lines.length === 0) {
    return (
      <div className="file-compare-empty">
        <em>No content</em>
      </div>
    );
  }

  const changedSet = new Set(changedLines || []);

  return (
    <div className="file-compare-lines">
      {lines.map((line, index) => (
        <div
          key={index}
          className={`file-compare-line ${changedSet.has(index) ? `changed-${variant}` : ''}`}
        >
          <span className="file-compare-lineno">{index + 1}</span>
          <span className="file-compare-text">{line || '\u00A0'}</span>
        </div>
      ))}
    </div>
  );
}

function FileChangeCard({ filePath, diffData }) {
  const [expanded, setExpanded] = useState(false);
  const diff = normalizeDiff(diffData);
  const fileName = filePath.split('/').pop() || filePath.split('\\').pop();

  const summaryText = diff
    ? `${diff.summary.lines_removed} line${diff.summary.lines_removed !== 1 ? 's' : ''} removed, ${diff.summary.lines_added} line${diff.summary.lines_added !== 1 ? 's' : ''} added`
    : 'Content changed (preview not available)';

  return (
    <div className={`file-change-card ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="file-change-header"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="file-change-header-main">
          <FileText size={20} className="file-change-icon" />
          <div className="file-change-meta">
            <span className="file-change-name">{fileName}</span>
            <span className="file-change-summary">{summaryText}</span>
          </div>
        </div>
        <div className="file-change-header-actions">
          <span className="file-change-badge">Modified</span>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="file-change-body">
          {diff ? (
            <>
              <p className="file-change-intro">
                Compare the original snapshot taken when monitoring started with the file as it exists now.
              </p>
              <div className="file-compare-grid">
                <div className="file-compare-panel">
                  <div className="file-compare-panel-header before">
                    <span className="file-compare-dot" />
                    Original version
                  </div>
                  <LineBlock
                    lines={diff.before}
                    changedLines={diff.changed_before_lines}
                    variant="before"
                  />
                </div>
                <div className="file-compare-panel">
                  <div className="file-compare-panel-header after">
                    <span className="file-compare-dot" />
                    Current version
                  </div>
                  <LineBlock
                    lines={diff.after}
                    changedLines={diff.changed_after_lines}
                    variant="after"
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="file-change-unavailable">
              This file was changed, but a readable text preview is not available for this file type.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FileChangeViewer({ modifiedFiles, textDifferences }) {
  if (!modifiedFiles?.length) return null;

  return (
    <div className="file-change-list">
      {modifiedFiles.map((file) => (
        <FileChangeCard
          key={file}
          filePath={file}
          diffData={textDifferences?.[file]}
        />
      ))}
    </div>
  );
}
