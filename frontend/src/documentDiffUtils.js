import { API_BASE } from './api';

/** Split lines into readable "pages" for document-style viewing. */
export function paginateLines(lines, linesPerPage = 18) {
  if (!lines?.length) return [[]];
  const pages = [];
  let current = [];

  for (const line of lines) {
    const isSection = typeof line === 'string' && line.startsWith('──');
    if (isSection && current.length >= Math.floor(linesPerPage * 0.6)) {
      pages.push(current);
      current = [];
    }
    current.push(line);
    if (current.length >= linesPerPage) {
      pages.push(current);
      current = [];
    }
  }
  if (current.length) pages.push(current);
  return pages;
}

export function paginateRows(rows, rowsPerPage = 16) {
  if (!rows?.length) return [[]];
  const pages = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    pages.push(rows.slice(i, i + rowsPerPage));
  }
  return pages;
}

export function getExtension(filePath) {
  if (!filePath) return '';
  const name = filePath.split('/').pop() || filePath.split('\\').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tif', '.tiff',
]);

const CODE_EXTENSIONS = new Set([
  '.json', '.xml', '.yaml', '.yml', '.py', '.js', '.jsx', '.ts', '.tsx',
  '.css', '.scss', '.sql', '.sh', '.bat', '.ps1', '.env', '.ini', '.cfg', '.conf',
]);

export function getDocumentStyleFromPath(filePath, diff) {
  const ext = getExtension(filePath);
  const type = diff?.document_type || diff?.preview_type;

  if (type === 'image' || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (type === 'spreadsheet' || type === 'excel' || ext === '.xlsx' || ext === '.xls') return 'sheet';
  if (type === 'presentation' || type === 'powerpoint' || ext === '.pptx' || ext === '.ppt') return 'slide';
  if (type === 'pdf' || ext === '.pdf') return 'pdf';
  if (ext === '.csv') return 'csv';
  if (ext === '.md') return 'markdown';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (ext === '.rtf' || type === 'rtf') return 'word';
  if (type === 'word' || type === 'document' || ext === '.docx' || ext === '.doc') return 'word';
  if (ext === '.txt' || ext === '.log' || type === 'text') return 'prose';
  return 'prose';
}

export function getDocumentStyle(diff, filePath) {
  return getDocumentStyleFromPath(filePath, diff);
}

export function getTypeLabel(filePath, diff) {
  const ext = getExtension(filePath);
  const labels = {
    '.docx': 'Word', '.doc': 'Word', '.pdf': 'PDF', '.xlsx': 'Excel', '.xls': 'Excel',
    '.pptx': 'PowerPoint', '.ppt': 'PowerPoint', '.csv': 'CSV', '.md': 'Markdown',
    '.html': 'HTML', '.htm': 'HTML', '.rtf': 'Rich text', '.json': 'JSON', '.xml': 'XML',
    '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image', '.gif': 'Image', '.webp': 'Image',
    '.svg': 'Image', '.txt': 'Text', '.py': 'Python', '.js': 'JavaScript', '.jsx': 'React',
  };
  if (labels[ext]) return labels[ext];
  const style = getDocumentStyle(diff, filePath);
  const styleLabels = {
    image: 'Image', sheet: 'Excel', slide: 'PowerPoint', pdf: 'PDF', word: 'Word',
    csv: 'CSV', markdown: 'Markdown', html: 'HTML', code: 'Code', prose: 'Document',
  };
  return styleLabels[style] || 'File';
}

export function pagesWithChanges(changedLineIndices, linesPerPage = 18) {
  const set = new Set();
  for (const idx of changedLineIndices || []) {
    set.add(Math.floor(idx / linesPerPage));
  }
  return [...set].sort((a, b) => a - b);
}

export function collectChangeIndices(changedBefore, changedAfter) {
  const all = new Set([...(changedBefore || []), ...(changedAfter || [])]);
  return [...all].sort((a, b) => a - b);
}

function tokenize(text) {
  return (text || '').split(/(\s+)/);
}

function highlightDiff(oldText, newText, side) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  if (oldText === newText) return oldText || '\u00A0';

  if (!oldText || !newText || Math.abs(oldTokens.length - newTokens.length) > 6) {
    const text = side === 'before' ? oldText : newText;
    const cls = side === 'before' ? 'doc-mark-old' : 'doc-mark-new';
    return `<mark class="${cls}">${escapeHtml(text)}</mark>`;
  }

  const matcher = longestCommonSubsequence(oldTokens, newTokens);
  const parts = [];
  let oi = 0;
  let ni = 0;

  for (const [type, oLen, nLen] of matcher) {
    if (type === 'equal') {
      for (let i = 0; i < oLen; i += 1) parts.push(escapeHtml(oldTokens[oi + i]));
      oi += oLen;
      ni += nLen;
    } else if (type === 'remove' && side === 'before') {
      parts.push(`<mark class="doc-mark-old">${escapeHtml(oldTokens.slice(oi, oi + oLen).join(''))}</mark>`);
      oi += oLen;
    } else if (type === 'insert' && side === 'after') {
      parts.push(`<mark class="doc-mark-new">${escapeHtml(newTokens.slice(ni, ni + nLen).join(''))}</mark>`);
      ni += nLen;
    } else if (type === 'replace') {
      if (side === 'before') {
        parts.push(`<mark class="doc-mark-old">${escapeHtml(oldTokens.slice(oi, oi + oLen).join(''))}</mark>`);
      } else {
        parts.push(`<mark class="doc-mark-new">${escapeHtml(newTokens.slice(ni, ni + nLen).join(''))}</mark>`);
      }
      oi += oLen;
      ni += nLen;
    } else {
      oi += oLen;
      ni += nLen;
    }
  }
  return parts.join('') || escapeHtml(side === 'before' ? oldText : newText);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function longestCommonSubsequence(a, b) {
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      let len = 0;
      while (i + len < a.length && j + len < b.length && a[i + len] === b[j + len]) len += 1;
      ops.push(['equal', len, len]);
      i += len;
      j += len;
    } else if (j < b.length && (i >= a.length || b[j] !== a[i])) {
      let len = 0;
      while (j + len < b.length && (i >= a.length || b[j + len] !== a[i])) len += 1;
      if (i < a.length) {
        let oLen = 0;
        while (i + oLen < a.length && (j >= b.length || a[i + oLen] !== b[j])) oLen += 1;
        ops.push(['replace', oLen, len]);
        i += oLen;
        j += len;
      } else {
        ops.push(['insert', 0, len]);
        j += len;
      }
    } else if (i < a.length) {
      let len = 0;
      while (i + len < a.length && (j >= b.length || a[i + len] !== b[j])) len += 1;
      ops.push(['remove', len, 0]);
      i += len;
    }
  }
  return ops;
}

function findPairedLine(index, diff, side) {
  const changedBefore = [...(diff?.changed_before_lines || [])].sort((a, b) => a - b);
  const changedAfter = [...(diff?.changed_after_lines || [])].sort((a, b) => a - b);
  if (side === 'before') {
    const pos = changedBefore.indexOf(index);
    return pos >= 0 ? changedAfter[pos] ?? index : index;
  }
  const pos = changedAfter.indexOf(index);
  return pos >= 0 ? changedBefore[pos] ?? index : index;
}

export function renderDocumentLine(line, globalIndex, diff, side) {
  const isSection = typeof line === 'string' && line.startsWith('──');
  if (isSection) {
    return { html: escapeHtml(line), isSection: true, isChanged: false };
  }

  const changedBefore = new Set(diff?.changed_before_lines || []);
  const changedAfter = new Set(diff?.changed_after_lines || []);
  const isChanged = side === 'before' ? changedBefore.has(globalIndex) : changedAfter.has(globalIndex);

  if (!isChanged) {
    return { html: escapeHtml(line || '\u00A0'), isSection: false, isChanged: false };
  }

  const beforeLine = diff?.before?.[globalIndex] ?? '';
  const afterLine = diff?.after?.[globalIndex] ?? '';
  const pairedIndex = findPairedLine(globalIndex, diff, side);
  const otherLine = side === 'before'
    ? (diff?.after?.[pairedIndex] ?? '')
    : (diff?.before?.[pairedIndex] ?? '');

  if (side === 'after' && isChanged && !otherLine?.trim() && (line || afterLine)) {
    const text = line || afterLine;
    return {
      html: `<mark class="doc-mark-new doc-mark-added">${escapeHtml(text)}</mark>`,
      isSection: false,
      isChanged: true,
    };
  }

  if (side === 'before' && isChanged && !otherLine?.trim() && (line || beforeLine)) {
    const text = line || beforeLine;
    return {
      html: `<mark class="doc-mark-old doc-mark-removed">${escapeHtml(text)}</mark>`,
      isSection: false,
      isChanged: true,
    };
  }

  const html = highlightDiff(
    side === 'before' ? (line || beforeLine) : (line || afterLine),
    side === 'before' ? otherLine : otherLine,
    side,
  );
  return { html, isSection: false, isChanged: true };
}

export function parseCsvLines(lines) {
  const rows = [];
  for (const line of lines || []) {
    if (!line.trim() || line.startsWith('──')) continue;
    const cells = line.split(',').map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

export function parseSheetLines(lines) {
  const rows = [];
  for (const line of lines || []) {
    if (line.startsWith('──')) continue;
    const match = line.match(/^([A-Z]+\d+):\s*(.*)$/);
    if (match) rows.push({ cell: match[1], value: match[2] });
  }
  return rows;
}

export function linesFromPreviewText(text) {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

export function buildSingleSideDiff(lines, side) {
  return {
    before: side === 'before' ? lines : [],
    after: side === 'after' ? lines : [],
    changed_before_lines: [],
    changed_after_lines: [],
    preview_type: 'text',
  };
}

export async function fetchPreviewLines(filePath, version = 'baseline') {
  try {
    const res = await fetch(
      `${API_BASE}/api/files/preview?path=${encodeURIComponent(filePath)}&version=${version}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.preview_mode === 'image') {
      return { style: 'image', lines: [], preview: data };
    }
    const lines = linesFromPreviewText(data.preview || '');
    return { style: getDocumentStyleFromPath(filePath, null), lines, preview: data };
  } catch {
    return null;
  }
}

export function contentUrl(filePath, version) {
  return `${API_BASE}/api/files/content?path=${encodeURIComponent(filePath)}&version=${version}&inline=1`;
}

export function countTotalPages(diff, filePath, style) {
  if (style === 'image') return 1;
  if (style === 'sheet') {
    const rows = parseSheetLines(diff?.before?.length ? diff.before : diff?.after);
    return Math.max(1, paginateRows(rows, 16).length);
  }
  if (style === 'csv') {
    const rows = parseCsvLines(diff?.before?.length ? diff.before : diff?.after);
    return Math.max(1, paginateRows(rows, 12).length);
  }
  if (style === 'slide') {
    const lines = diff?.before?.length ? diff.before : diff?.after || [];
    return Math.max(1, lines.filter((l) => l.startsWith('──')).length || 1);
  }
  const lines = diff?.before?.length ? diff.before : diff?.after || [];
  return Math.max(1, paginateLines(lines, LINES_PER_PAGE).length);
}

export const LINES_PER_PAGE = 18;
