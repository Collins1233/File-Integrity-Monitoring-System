import { baseName, plural } from './format';

/**
 * Turns the raw audit-log lines (fim_log.txt) into plain-English history rows.
 *
 *   { id, timestamp, category, tone, title, detail }
 *
 * category: scan | change | action | alert | test | system   (used by the filter)
 * tone:     success | modified | added | deleted | neutral    (colors the dot)
 */

export const LOG_CATEGORIES = [
  { key: 'all', label: 'Everything' },
  { key: 'scan', label: 'Scans' },
  { key: 'change', label: 'Changes found' },
  { key: 'action', label: 'Actions taken' },
  { key: 'alert', label: 'Alerts' },
  { key: 'test', label: 'Test activity' },
];

function summaryNumbers(text) {
  const read = (word) => Number((new RegExp(`${word}:\\s*(\\d+)`, 'i').exec(text) || [])[1] || 0);
  return { modified: read('Modified'), deleted: read('Deleted'), added: read('New') };
}

export function describeLogEntry(entry, index) {
  const message = String(entry.message || '').trim();
  const base = { id: `${entry.timestamp}-${index}`, timestamp: entry.timestamp, raw: message };
  const tagged = /^\[([A-Z _]+)\]\s*(.*)$/.exec(message);

  if (tagged) {
    const tag = tagged[1].trim();
    const rest = tagged[2];
    switch (tag) {
      case 'MODIFIED':
        return { ...base, category: 'change', tone: 'modified', title: 'File modified', detail: rest, file: baseName(rest) };
      case 'DELETED':
        return { ...base, category: 'change', tone: 'deleted', title: 'File deleted', detail: rest, file: baseName(rest) };
      case 'NEW FILE':
        return { ...base, category: 'change', tone: 'added', title: 'New file added', detail: rest, file: baseName(rest) };
      case 'SUMMARY': {
        const n = summaryNumbers(rest);
        const total = n.modified + n.deleted + n.added;
        const where = rest.split(':')[0];
        return {
          ...base,
          category: 'scan',
          tone: total ? 'modified' : 'success',
          title: total
            ? `Scan finished: ${plural(n.modified, 'modified file')}, ${plural(n.deleted, 'deleted file')}, ${plural(n.added, 'added file')}`
            : 'Scan finished: everything matches the baseline',
          detail: where,
        };
      }
      case 'AUTO CHECK':
        return { ...base, category: 'scan', tone: 'success', title: 'Automatic scan finished', detail: rest.replace(/ completed.*$/, '') };
      case 'REPORT GENERATED':
        return { ...base, category: 'scan', tone: 'neutral', title: 'PDF report created', detail: baseName(rest) };
      case 'RESTORED':
        return { ...base, category: 'action', tone: 'success', title: 'Original file restored', detail: rest.replace(/ \(baseline refreshed.*$/, '') };
      case 'MARKED SAFE':
        return { ...base, category: 'action', tone: 'success', title: 'Marked as safe (baseline updated)', detail: rest.replace(/ \(baseline updated.*$/, '') };
      case 'BASELINE RESET':
        return { ...base, category: 'action', tone: 'success', title: 'Baseline reset', detail: rest };
      case 'FLAGGED ISSUE':
        return { ...base, category: 'action', tone: 'deleted', title: 'Issue flagged for follow-up', detail: rest };
      case 'CRITICAL_TAMPER_ALERT':
      case 'CRITICAL TAMPER ALERT':
        return { ...base, category: 'alert', tone: 'deleted', title: 'Baseline tampering detected', detail: rest };
      case 'DIFF ERROR':
        return { ...base, category: 'alert', tone: 'modified', title: 'Could not compare a file', detail: rest };
      default:
        return { ...base, category: 'system', tone: 'neutral', title: tag.charAt(0) + tag.slice(1).toLowerCase(), detail: rest };
    }
  }

  if (/^SIMULATED (ATTACK|TAMPER):/i.test(message)) {
    return { ...base, category: 'test', tone: 'modified', title: 'Test change created', detail: message.replace(/^SIMULATED (ATTACK|TAMPER):\s*/i, '') };
  }
  if (/^IN-BROWSER EDIT:/i.test(message)) {
    return { ...base, category: 'test', tone: 'neutral', title: 'File edited in the browser', detail: message.replace(/^IN-BROWSER EDIT:\s*/i, '') };
  }
  return { ...base, category: 'system', tone: 'neutral', title: message || 'System event', detail: '' };
}

export function buildHistory(rawLogs = []) {
  return rawLogs.map(describeLogEntry).reverse(); // newest first
}
