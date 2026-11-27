/**
 * One source of truth for file-status wording. Colors live in fims.css
 * (`.fx-badge--<key>`), so the whole app stays consistent.
 *
 *   intact   – soft green
 *   modified – warm amber
 *   added    – soft blue
 *   deleted  – soft red
 */
export const STATUS = {
  intact: {
    key: 'intact',
    label: 'Unchanged',
    sentence: 'This file matches your saved baseline.',
  },
  modified: {
    key: 'modified',
    label: 'Modified',
    sentence: 'The contents of this file are different from your saved baseline.',
  },
  added: {
    key: 'added',
    label: 'Added',
    sentence: 'This file was not in your baseline and has appeared in a monitored folder.',
  },
  deleted: {
    key: 'deleted',
    label: 'Deleted',
    sentence: 'This file was in your baseline but can no longer be found.',
  },
};

export const CHANGE_STATUSES = ['modified', 'deleted', 'added'];

/** Order used when listing changed files: most important first. */
export const STATUS_ORDER = { deleted: 0, modified: 1, added: 2, intact: 3 };
