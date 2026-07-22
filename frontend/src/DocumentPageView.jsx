import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  SkipForward,
  X,
} from 'lucide-react';
import {
  LINES_PER_PAGE,
  collectChangeIndices,
  contentUrl,
  countTotalPages,
  getDocumentStyle,
  getTypeLabel,
  paginateLines,
  paginateRows,
  pagesWithChanges,
  parseCsvLines,
  parseSheetLines,
  renderDocumentLine,
} from './documentDiffUtils';
import MediaChangesPanel from './MediaChangesPanel';

function DocumentLine({ line, globalIndex, diff, side }) {
  const { html, isSection, isChanged } = renderDocumentLine(line, globalIndex, diff, side);
  if (isSection) {
    return <div className="doc-line doc-section">{line}</div>;
  }
  return (
    <div
      className={`doc-line ${isChanged ? `doc-line-changed-${side}` : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MarkdownLine({ line }) {
  const trimmed = (line || '').trim();
  if (!trimmed) return <div className="doc-line doc-empty-line">&nbsp;</div>;
  if (trimmed.startsWith('# ')) {
    return <h1 className="doc-md-h1">{trimmed.slice(2)}</h1>;
  }
  if (trimmed.startsWith('## ')) {
    return <h2 className="doc-md-h2">{trimmed.slice(3)}</h2>;
  }
  if (trimmed.startsWith('### ')) {
    return <h3 className="doc-md-h3">{trimmed.slice(4)}</h3>;
  }
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return <li className="doc-md-li">{trimmed.slice(2)}</li>;
  }
  return <p className="doc-md-p">{line}</p>;
}

function TextDocumentPage({ lines, pageIndex, diff, side, pageLabel, style }) {
  const start = pageIndex * LINES_PER_PAGE;
  const pageLines = lines.slice(start, start + LINES_PER_PAGE);
  const pageClass = style === 'code' ? 'code' : style === 'markdown' ? 'markdown' : style === 'prose' ? 'prose' : style;

  return (
    <div className={`doc-page doc-page-${pageClass}`}>
      <div className="doc-page-toolbar">
        <span>{pageLabel}</span>
        <span className="doc-page-num">Page {pageIndex + 1}</span>
      </div>
      <div className={`doc-page-body doc-page-body-${pageClass}`}>
        {pageLines.length === 0 ? (
          <p className="doc-empty"><em>Nothing on this page</em></p>
        ) : style === 'markdown' ? (
          pageLines.map((line, i) => <MarkdownLine key={`${side}-md-${start + i}`} line={line} />)
        ) : (
          pageLines.map((line, i) => (
            <DocumentLine
              key={`${side}-${start + i}`}
              line={line}
              globalIndex={start + i}
              diff={diff}
              side={side}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CsvDocumentPage({ lines, pageIndex, diff, side, compact }) {
  const rows = parseCsvLines(lines);
  const pages = paginateRows(rows, compact ? 8 : 14);
  const pageRows = pages[pageIndex] || pages[0] || [];
  const headers = rows[0] || [];

  return (
    <div className="doc-page doc-page-csv">
      <div className="doc-page-toolbar">
        <span>CSV spreadsheet</span>
        <span className="doc-page-num">Page {pageIndex + 1} of {Math.max(pages.length, 1)}</span>
      </div>
      <div className="doc-page-body doc-sheet-body">
        <table className="doc-sheet-table doc-csv-table">
          {pageIndex === 0 && headers.length > 0 && (
            <thead>
              <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SlideDocumentPage({ lines, pageIndex, diff, side }) {
  const slides = useMemo(() => {
    const result = [];
    let current = { title: 'Slide', lines: [] };
    for (const line of lines || []) {
      if (line.startsWith('──')) {
        if (current.lines.length) result.push(current);
        current = { title: line.replace(/─/g, '').trim(), lines: [] };
      } else if (line.trim()) {
        current.lines.push(line);
      }
    }
    if (current.lines.length || result.length === 0) result.push(current);
    return result;
  }, [lines]);

  const slide = slides[pageIndex] || slides[0] || { title: 'Slide', lines: [] };
  const globalOffset = lines.findIndex((l) => l === slide.lines[0]);

  return (
    <div className="doc-page doc-page-slide">
      <div className="doc-page-toolbar">
        <span>PowerPoint</span>
        <span className="doc-page-num">{slide.title || `Slide ${pageIndex + 1}`}</span>
      </div>
      <div className="doc-page-body doc-slide-body">
        {slide.lines.map((line, i) => (
          <DocumentLine
            key={`${side}-slide-${pageIndex}-${i}`}
            line={line}
            globalIndex={globalOffset >= 0 ? globalOffset + i : i}
            diff={diff}
            side={side}
          />
        ))}
      </div>
    </div>
  );
}

function SheetDocumentPage({ diff, side, pageIndex, compact }) {
  const changes = diff?.cell_changes || [];
  const lines = side === 'before' ? diff?.before || [] : diff?.after || [];
  const allRows = parseSheetLines(lines);
  const pages = paginateRows(allRows, compact ? 10 : 20);
  const pageRows = pages[pageIndex] || pages[0] || [];

  return (
    <div className="doc-page doc-page-sheet">
      <div className="doc-page-toolbar">
        <span>Excel</span>
        <span className="doc-page-num">
          {changes.length ? `${changes.length} cells changed · ` : ''}
          Page {pageIndex + 1}{pages.length > 1 ? ` of ${pages.length}` : ''}
        </span>
      </div>
      <div className="doc-page-body doc-sheet-body">
        <table className="doc-sheet-table">
          <thead>
            <tr><th>Cell</th><th>Value</th></tr>
          </thead>
          <tbody>
            {pageRows.map(({ cell, value }) => {
              const change = changes.find((c) => c.cell === cell);
              const isChanged = change && change.before !== change.after;
              return (
                <tr key={`${side}-${cell}`} className={isChanged ? `doc-cell-changed-${side}` : ''}>
                  <td><code>{cell}</code></td>
                  <td>{isChanged ? (side === 'before' ? change?.before : change?.after) || value : value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PdfEmbedPage({ filePath, side, pageIndex }) {
  const url = contentUrl(filePath, side === 'before' ? 'baseline' : 'current');
  return (
    <div className="doc-page doc-page-pdf-embed">
      <div className="doc-page-toolbar">
        <span>PDF</span>
        <span className="doc-page-num">{side === 'before' ? 'Original' : 'Current'}</span>
      </div>
      <div className="doc-page-body doc-pdf-embed-body">
        <iframe title={`${side} PDF`} src={`${url}#page=${pageIndex + 1}`} className="doc-pdf-iframe" />
      </div>
    </div>
  );
}

function HtmlEmbedPage({ filePath, side }) {
  const url = contentUrl(filePath, side === 'before' ? 'baseline' : 'current');
  return (
    <div className="doc-page doc-page-html-embed">
      <div className="doc-page-toolbar">
        <span>HTML</span>
        <span className="doc-page-num">{side === 'before' ? 'Original' : 'Current'}</span>
      </div>
      <div className="doc-page-body doc-html-embed-body">
        <iframe title={`${side} HTML`} src={url} className="doc-html-iframe" sandbox="allow-same-origin" />
      </div>
    </div>
  );
}

function ImageDocumentPage({ filePath, side }) {
  const url = contentUrl(filePath, side === 'before' ? 'baseline' : 'current');
  return (
    <div className="doc-page doc-page-image">
      <div className="doc-page-toolbar">
        <span>Image</span>
        <span className="doc-page-num">{side === 'before' ? 'Original' : 'Current'}</span>
      </div>
      <div className="doc-page-body doc-image-body">
        <img src={url} alt={`${side} version`} className="doc-image-full" />
      </div>
    </div>
  );
}

function WordHtmlPage({ filePath, side, diff, pageIndex, compact }) {
  const [html, setHtml] = useState('');
  const [failed, setFailed] = useState(false);
  const url = contentUrl(filePath, side === 'before' ? 'baseline' : 'current');
  const ext = filePath.toLowerCase().endsWith('.docx');

  useEffect(() => {
    if (!ext) {
      setFailed(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const mammoth = await import('mammoth');
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const buf = await res.arrayBuffer();
        const result = await mammoth.default.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) {
          setHtml(result.value);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url, ext]);

  if (failed || !html) {
    const lines = side === 'before' ? diff?.before || [] : diff?.after || [];
    const pages = paginateLines(lines, LINES_PER_PAGE);
    return (
      <TextDocumentPage
        lines={lines}
        pageIndex={Math.min(pageIndex, pages.length - 1)}
        diff={diff}
        side={side}
        pageLabel="Word"
        style="word"
      />
    );
  }

  return (
    <div className="doc-page doc-page-word-html">
      <div className="doc-page-toolbar">
        <span>Word</span>
        <span className="doc-page-num">{side === 'before' ? 'Original' : 'Current'}</span>
      </div>
      <div
        className={`doc-page-body doc-word-html-body ${compact ? 'compact' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function pageLabelForStyle(style) {
  const labels = {
    word: 'Word', pdf: 'PDF', prose: 'Document', code: 'Code file',
    markdown: 'Markdown', csv: 'CSV', html: 'HTML', slide: 'PowerPoint', sheet: 'Excel',
  };
  return labels[style] || 'Document';
}

function DocumentSide({
  filePath, diff, side, pageIndex, style, compact, singleSide, preferTextDiff = false,
}) {
  const lines = side === 'before' ? diff?.before || [] : diff?.after || [];
  const hasTextChanges = Boolean(
    diff?.changed_before_lines?.length || diff?.changed_after_lines?.length,
  );

  if (style === 'image') {
    return <ImageDocumentPage filePath={filePath} side={side} />;
  }
  if (style === 'sheet') {
    return <SheetDocumentPage diff={diff} side={side} pageIndex={pageIndex} compact={compact} />;
  }
  if (style === 'csv') {
    return <CsvDocumentPage lines={lines} pageIndex={pageIndex} diff={diff} side={side} compact={compact} />;
  }
  if (style === 'slide') {
    return <SlideDocumentPage lines={lines} pageIndex={pageIndex} diff={diff} side={side} />;
  }
  if (style === 'pdf') {
    return <PdfEmbedPage filePath={filePath} side={side} pageIndex={pageIndex} />;
  }
  if (style === 'html' && !compact) {
    return <HtmlEmbedPage filePath={filePath} side={side} />;
  }
  if (
    style === 'word'
    && !compact
    && filePath.toLowerCase().endsWith('.docx')
    && !preferTextDiff
    && !hasTextChanges
  ) {
    return <WordHtmlPage filePath={filePath} side={side} diff={diff} pageIndex={pageIndex} compact={compact} />;
  }

  const pages = paginateLines(lines, LINES_PER_PAGE);
  const safePage = Math.min(pageIndex, Math.max(pages.length - 1, 0));
  return (
    <TextDocumentPage
      lines={lines}
      pageIndex={safePage}
      diff={diff}
      side={side}
      pageLabel={pageLabelForStyle(style)}
      style={style}
    />
  );
}

export function DocumentPageCompare({
  filePath,
  diff,
  pageIndex = 0,
  compact = false,
  mode = 'compare',
}) {
  const style = getDocumentStyle(diff, filePath);
  const totalPages = countTotalPages(diff, filePath, style);
  const showBefore = mode !== 'current-only';
  const showAfter = mode !== 'baseline-only';
  const preferTextDiff = mode === 'compare' && Boolean(
    diff?.changed_before_lines?.length || diff?.changed_after_lines?.length,
  );

  if (mode === 'baseline-only') {
    return (
      <div className={`doc-compare doc-compare-single ${compact ? 'doc-compare-compact' : ''}`}>
        <div className="doc-compare-col">
          <div className="doc-col-label before"><span className="doc-col-dot" /> Original (saved copy)</div>
          <DocumentSide filePath={filePath} diff={diff} side="before" pageIndex={pageIndex} style={style} compact={compact} singleSide preferTextDiff={preferTextDiff} />
        </div>
      </div>
    );
  }

  if (mode === 'current-only') {
    return (
      <div className={`doc-compare doc-compare-single ${compact ? 'doc-compare-compact' : ''}`}>
        <div className="doc-compare-col">
          <div className="doc-col-label after"><span className="doc-col-dot" /> Current file on disk</div>
          <DocumentSide filePath={filePath} diff={diff} side="after" pageIndex={pageIndex} style={style} compact={compact} singleSide preferTextDiff={preferTextDiff} />
        </div>
      </div>
    );
  }

  return (
    <div className={`doc-compare ${compact ? 'doc-compare-compact' : ''}`}>
      {showBefore && (
        <div className="doc-compare-col">
          <div className="doc-col-label before"><span className="doc-col-dot" /> Original</div>
          <DocumentSide filePath={filePath} diff={diff} side="before" pageIndex={pageIndex} style={style} compact={compact} preferTextDiff={preferTextDiff} />
        </div>
      )}
      {showAfter && (
        <div className="doc-compare-col">
          <div className="doc-col-label after"><span className="doc-col-dot" /> Current</div>
          <DocumentSide filePath={filePath} diff={diff} side="after" pageIndex={pageIndex} style={style} compact={compact} preferTextDiff={preferTextDiff} />
        </div>
      )}
      {!compact && totalPages > 1 && (
        <p className="doc-page-hint">Page {pageIndex + 1} of {totalPages} — open full view to browse all pages</p>
      )}
    </div>
  );
}

export function DocumentCompareModal({
  open,
  onClose,
  filePath,
  fileName,
  diff,
  onRestore,
  canRestore,
  isRestoring,
  mode = 'compare',
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [changeCursor, setChangeCursor] = useState(0);

  const style = getDocumentStyle(diff, filePath);
  const isImage = style === 'image';
  const isSheet = style === 'sheet' || style === 'csv';
  const totalPages = countTotalPages(diff, filePath, style);

  const changeIndices = useMemo(
    () => (mode === 'compare' ? collectChangeIndices(diff?.changed_before_lines, diff?.changed_after_lines) : []),
    [diff, mode],
  );

  const changePages = useMemo(
    () => pagesWithChanges(changeIndices, LINES_PER_PAGE),
    [changeIndices],
  );

  useEffect(() => {
    if (open) {
      setPageIndex(0);
      setChangeCursor(0);
    }
  }, [open, filePath]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setPageIndex((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setPageIndex((p) => Math.min(totalPages - 1, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, totalPages]);

  const jumpToNextChange = () => {
    if (!changeIndices.length) return;
    const next = (changeCursor + 1) % changeIndices.length;
    setChangeCursor(next);
    setPageIndex(Math.floor(changeIndices[next] / LINES_PER_PAGE));
  };

  const jumpToPrevChange = () => {
    if (!changeIndices.length) return;
    const prev = (changeCursor - 1 + changeIndices.length) % changeIndices.length;
    setChangeCursor(prev);
    setPageIndex(Math.floor(changeIndices[prev] / LINES_PER_PAGE));
  };

  if (!open || !diff) return null;

  const modalTitle = mode === 'baseline-only'
    ? 'Original file (before deletion)'
    : mode === 'current-only'
      ? 'New file on disk'
      : fileName;

  return (
    <div className="doc-modal-overlay" role="dialog" aria-modal="true" aria-label={modalTitle}>
      <div className="doc-modal">
        <header className="doc-modal-head">
          <div>
            <h2>{modalTitle}</h2>
            <p>
              {mode === 'compare'
                ? 'Original (left) vs current (right) — browse pages and jump between changes'
                : 'Scroll through the full document — use page buttons below'}
            </p>
          </div>
          <button type="button" className="doc-modal-close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </header>

        {mode === 'compare' && (
          <div className="doc-modal-guide">
            <span><mark className="doc-mark-old">Pink</mark> = was in original</span>
            <span><mark className="doc-mark-new">Green</mark> = is in current now</span>
          </div>
        )}

        <div className="doc-modal-body">
          <MediaChangesPanel changes={diff?.media_changes} />
          <DocumentPageCompare filePath={filePath} diff={diff} pageIndex={pageIndex} compact={false} mode={mode} />
        </div>

        <footer className="doc-modal-foot">
          {totalPages > 1 && (
            <div className="doc-modal-nav">
              <button type="button" className="btn btn-secondary doc-nav-btn" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex <= 0}>
                <ChevronLeft size={18} /> Previous page
              </button>
              <span className="doc-modal-page-info">
                Page <strong>{pageIndex + 1}</strong> of <strong>{totalPages}</strong>
                {changeIndices.length > 0 && <> · <strong>{changeIndices.length}</strong> changes</>}
              </span>
              <button type="button" className="btn btn-secondary doc-nav-btn" onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))} disabled={pageIndex >= totalPages - 1}>
                Next page <ChevronRight size={18} />
              </button>
            </div>
          )}

          {changeIndices.length > 0 && !isImage && !isSheet && mode === 'compare' && (
            <div className="doc-modal-change-nav">
              <button type="button" className="btn btn-secondary doc-nav-btn" onClick={jumpToPrevChange}>
                <ChevronLeft size={16} /> Previous change
              </button>
              <button type="button" className="btn btn-primary doc-nav-btn" onClick={jumpToNextChange}>
                Next change <SkipForward size={16} />
              </button>
            </div>
          )}

          {changePages.length > 0 && totalPages > 1 && (
            <div className="doc-modal-page-dots">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`doc-page-dot ${i === pageIndex ? 'active' : ''} ${changePages.includes(i) ? 'has-change' : ''}`}
                  onClick={() => setPageIndex(i)}
                  aria-label={`Go to page ${i + 1}`}
                />
              ))}
            </div>
          )}

          {canRestore && onRestore && (
            <button type="button" className="btn btn-secondary doc-restore-modal" onClick={() => onRestore(filePath)} disabled={isRestoring}>
              Undo — restore the original file
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function ExpandFullViewButton({ onClick, label = 'Open full view' }) {
  return (
    <button type="button" className="btn btn-primary doc-expand-btn" onClick={onClick}>
      <Maximize2 size={16} /> {label}
    </button>
  );
}

export { getTypeLabel };
