/**
 * Turns the backend diff for a changed file into plain "what changed" items:
 *
 *   { kind, groups: [{ title, items: [{ type, label, before, after }] }], counts }
 *
 * `type` is 'added' | 'changed' | 'removed'. Works for Word (paragraphs),
 * Excel (cells), PowerPoint (slides) and plain text (lines).
 */

const MARKER = /^──\s*(Slide|Sheet)\s*:?\s*(.*?)\s*──$/i;

function markerTitle(line) {
  const match = MARKER.exec(String(line || '').trim());
  if (!match) return null;
  const kind = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return `${kind} ${match[2]}`.trim();
}

function documentKind(diff, extension) {
  const type = diff?.document_type || diff?.preview_type || '';
  if (diff?.cell_changes || type === 'excel' || type === 'spreadsheet') return 'excel';
  if (type === 'powerpoint' || type === 'presentation' || ['.ppt', '.pptx'].includes(extension)) return 'powerpoint';
  if (type === 'word' || ['.doc', '.docx'].includes(extension)) return 'word';
  if (type === 'pdf' || extension === '.pdf') return 'pdf';
  return 'text';
}

function excelGroups(cellChanges = []) {
  const bySheet = new Map();
  cellChanges.forEach((change) => {
    const before = String(change.before ?? '');
    const after = String(change.after ?? '');
    const isSheetLevel = change.cell === '(none)';
    let type = 'changed';
    if (isSheetLevel) type = /added/i.test(after) ? 'added' : 'removed';
    else if (!before && after) type = 'added';
    else if (before && !after) type = 'removed';

    const item = {
      type,
      label: isSheetLevel ? (type === 'added' ? 'New sheet' : 'Sheet removed') : `Cell ${change.cell}`,
      before: isSheetLevel ? '' : before,
      after: isSheetLevel ? '' : after,
    };
    const title = `Sheet: ${change.sheet}`;
    if (!bySheet.has(title)) bySheet.set(title, []);
    bySheet.get(title).push(item);
  });
  return [...bySheet.entries()].map(([title, items]) => ({ title, items }));
}

function lineGroups(diff, kind) {
  const before = diff.before || [];
  const after = diff.after || [];
  const changedBefore = new Set(diff.changed_before_lines || []);
  const changedAfter = new Set(diff.changed_after_lines || []);

  // Where does each line live? (nearest slide / sheet marker above it)
  const locate = (lines, index) => {
    for (let i = index; i >= 0; i -= 1) {
      const title = markerTitle(lines[i]);
      if (title) return title;
    }
    return null;
  };

  const collect = (lines, changedSet) => lines
    .map((text, index) => ({ text, index, marker: markerTitle(text), loc: locate(lines, index) }))
    .filter((entry) => changedSet.has(entry.index));

  const beforeEntries = collect(before, changedBefore);
  const afterEntries = collect(after, changedAfter);

  const groups = new Map();
  const groupFor = (loc) => {
    const title = loc || (kind === 'word' ? 'Document text' : kind === 'pdf' ? 'PDF text' : 'File contents');
    if (!groups.has(title)) groups.set(title, { before: [], after: [], extra: [] });
    return groups.get(title);
  };

  const beforeMarkers = new Set(before.map(markerTitle).filter(Boolean));
  const afterMarkers = new Set(after.map(markerTitle).filter(Boolean));

  beforeEntries.forEach((entry) => {
    if (entry.marker) {
      if (!afterMarkers.has(entry.marker)) {
        groupFor(entry.marker).extra.push({ type: 'removed', label: `${entry.marker} removed`, before: '', after: '' });
      }
      return;
    }
    groupFor(entry.loc).before.push(entry);
  });
  afterEntries.forEach((entry) => {
    if (entry.marker) {
      if (!beforeMarkers.has(entry.marker)) {
        groupFor(entry.marker).extra.push({ type: 'added', label: `New ${entry.marker.split(' ')[0].toLowerCase()} added`, before: '', after: '' });
      }
      return;
    }
    groupFor(entry.loc).after.push(entry);
  });

  const lineLabel = (entry, noun) => (kind === 'text' ? `Line ${entry.index + 1}` : noun);

  return [...groups.entries()].map(([title, group]) => {
    const items = [...group.extra];
    const pairs = Math.min(group.before.length, group.after.length);
    for (let i = 0; i < pairs; i += 1) {
      items.push({
        type: 'changed',
        label: lineLabel(group.after[i], kind === 'word' ? 'Paragraph edited' : 'Edited'),
        before: group.before[i].text,
        after: group.after[i].text,
      });
    }
    group.after.slice(pairs).forEach((entry) => {
      items.push({ type: 'added', label: lineLabel(entry, kind === 'word' ? 'Paragraph added' : 'Added'), before: '', after: entry.text });
    });
    group.before.slice(pairs).forEach((entry) => {
      items.push({ type: 'removed', label: lineLabel(entry, kind === 'word' ? 'Paragraph removed' : 'Removed'), before: entry.text, after: '' });
    });
    return { title, items };
  }).filter((group) => group.items.length > 0);
}

export function buildContentChanges(diff, extension = '') {
  if (!diff || diff.preview_type === 'binary' || diff.preview_type === 'image') {
    return { kind: diff?.preview_type || 'binary', groups: [], counts: { added: 0, changed: 0, removed: 0 } };
  }

  const kind = documentKind(diff, extension);
  const groups = diff.cell_changes
    ? excelGroups(diff.cell_changes)
    : Array.isArray(diff.before) && Array.isArray(diff.after)
      ? lineGroups(diff, kind)
      : [];

  const counts = { added: 0, changed: 0, removed: 0 };
  groups.forEach((group) => group.items.forEach((item) => { counts[item.type] += 1; }));
  return { kind, groups, counts };
}

/**
 * Word-level highlight for an edited line.
 * Returns { before: [{text, hit}], after: [{text, hit}] } where `hit` marks changed words.
 */
export function diffWords(beforeText = '', afterText = '') {
  const split = (text) => String(text).split(/(\s+)/).filter((part) => part !== '');
  const a = split(beforeText);
  const b = split(afterText);

  // Very long lines: skip the O(n·m) table and just mark everything.
  if (a.length * b.length > 160000) {
    return { before: [{ text: beforeText, hit: true }], after: [{ text: afterText, hit: true }] };
  }

  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const outBefore = [];
  const outAfter = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      outBefore.push({ text: a[i], hit: false });
      outAfter.push({ text: b[j], hit: false });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      outBefore.push({ text: a[i], hit: true });
      i += 1;
    } else {
      outAfter.push({ text: b[j], hit: true });
      j += 1;
    }
  }
  while (i < a.length) { outBefore.push({ text: a[i], hit: true }); i += 1; }
  while (j < b.length) { outAfter.push({ text: b[j], hit: true }); j += 1; }
  return { before: outBefore, after: outAfter };
}
