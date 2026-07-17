export function getFileName(filePath) {
  if (!filePath) return 'Unknown file';
  return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
}

export function getAffectedFiles(alert) {
  if (alert.affected_files?.length) {
    return alert.affected_files;
  }

  const files = [];
  for (const path of alert.modified_files || []) {
    files.push({ name: getFileName(path), path, change: 'modified' });
  }
  for (const path of alert.deleted_files || []) {
    files.push({ name: getFileName(path), path, change: 'deleted' });
  }
  for (const path of alert.new_files || []) {
    files.push({ name: getFileName(path), path, change: 'new' });
  }
  return files;
}

export function formatAlertTitle(alert) {
  const files = getAffectedFiles(alert);
  if (files.length === 1) {
    const file = files[0];
    if (file.change === 'modified') {
      return `We noticed a change to ${file.name}`;
    }
    if (file.change === 'deleted') {
      return `${file.name} is no longer in the folder`;
    }
    return `A new file appeared: ${file.name}`;
  }
  if (files.length > 1) {
    return `${files.length} files changed in your monitored folder`;
  }
  return 'Something changed in your monitored folder';
}

export function formatAlertMessage(alert) {
  const files = getAffectedFiles(alert);
  if (files.length === 0) {
    return 'Your latest scan found differences from the baseline snapshot.';
  }

  const names = files.map((file) => file.name);
  if (names.length === 1) {
    const file = files[0];
    if (file.change === 'modified') {
      return `${file.name} no longer matches the snapshot from when monitoring started. Open the dashboard to see what changed.`;
    }
    if (file.change === 'deleted') {
      return `${file.name} was present in your baseline but could not be found during the latest check.`;
    }
    return `${file.name} was not in your baseline and has now appeared in the monitored folder.`;
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]} were added, edited, or removed since your last baseline.`;
  }
  if (names.length === 3) {
    return `${names[0]}, ${names[1]}, and ${names[2]} need your attention.`;
  }
  return `${names.slice(0, 2).join(', ')}, and ${names.length - 2} other files need your attention.`;
}

export function formatAlertSummary(alert) {
  const parts = [];
  if (alert.modified_count === 1) {
    parts.push('1 file edited');
  } else if (alert.modified_count > 1) {
    parts.push(`${alert.modified_count} files edited`);
  }
  if (alert.deleted_count === 1) {
    parts.push('1 file removed');
  } else if (alert.deleted_count > 1) {
    parts.push(`${alert.deleted_count} files removed`);
  }
  if (alert.new_count === 1) {
    parts.push('1 new file');
  } else if (alert.new_count > 1) {
    parts.push(`${alert.new_count} new files`);
  }
  return parts.join(' · ');
}

export function formatAlertTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return timestamp;

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${time}`;
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
