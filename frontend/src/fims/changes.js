import { baseName, normalizePath } from './format';
import { STATUS_ORDER } from './statusConfig';

/**
 * Turn the raw scan result from the API into one flat, easy-to-render list.
 * Each item: { path, name, status, meta, diff }
 */
export function buildChangeList(checkResult) {
  if (!checkResult) return [];
  const meta = checkResult.file_metadata || {};
  const diffs = checkResult.text_differences || {};

  const make = (path, status) => ({
    path,
    name: baseName(path),
    status,
    meta: meta[path] || {},
    diff: diffs[path] || null,
  });

  return [
    ...(checkResult.deleted_files || []).map((path) => make(path, 'deleted')),
    ...(checkResult.modified_files || []).map((path) => make(path, 'modified')),
    ...(checkResult.new_files || []).map((path) => make(path, 'added')),
  ].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
}

/** Quick lookup: normalized path -> status ('modified' | 'deleted' | 'added'). */
export function buildStatusLookup(changes) {
  const lookup = new Map();
  changes.forEach((change) => lookup.set(normalizePath(change.path), change.status));
  return lookup;
}
