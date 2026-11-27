/** Small, dependency-free helpers shared by the FIMS pages. */

export function baseName(path = '') {
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || String(path);
}

export function dirName(path = '') {
  const text = String(path);
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index > 0 ? text.slice(0, index) : '';
}

export function normalizePath(path = '') {
  return String(path).replace(/\\/g, '/').toLowerCase();
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "27 Nov 2026, 14:05" */
export function formatDateTime(value, fallback = 'Not yet') {
  const date = parseDate(value);
  if (!date) return value || fallback;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "5 minutes ago", "just now", "2 days ago" */
export function timeAgo(value, fallback = 'Never') {
  const date = parseDate(value);
  if (!date) return fallback;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const TYPE_BY_EXTENSION = {
  '.doc': 'Word', '.docx': 'Word',
  '.xls': 'Excel', '.xlsx': 'Excel', '.csv': 'Spreadsheet',
  '.ppt': 'PowerPoint', '.pptx': 'PowerPoint',
  '.pdf': 'PDF', '.rtf': 'Rich text',
  '.txt': 'Text', '.md': 'Text', '.log': 'Text', '.json': 'Data', '.xml': 'Data', '.yaml': 'Data', '.yml': 'Data',
  '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image', '.gif': 'Image', '.webp': 'Image', '.svg': 'Image',
  '.py': 'Code', '.js': 'Code', '.jsx': 'Code', '.ts': 'Code', '.html': 'Code', '.css': 'Code', '.sh': 'Script',
  '.zip': 'Archive',
};

export function extensionOf(path = '') {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** Friendly file-type label (Word, Excel, PDF…). */
export function fileTypeLabel(path = '') {
  return TYPE_BY_EXTENSION[extensionOf(path)] || 'File';
}

export function isOfficeFile(path = '') {
  return ['Word', 'Excel', 'PowerPoint'].includes(fileTypeLabel(path));
}
