import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { buildContentChanges, diffWords } from './diffHelpers';
import { plural } from './format';
import MediaChangesPanel from '../MediaChangesPanel';

const TYPE_LABEL = { added: 'Added', changed: 'Changed', removed: 'Removed' };
const GROUP_LIMIT = 25;

function Chip({ type }) {
  return <span className={`fx-chip fx-chip--${type}`}>{TYPE_LABEL[type]}</span>;
}

function Words({ parts, tone }) {
  return (
    <>
      {parts.map((part, index) => (
        part.hit
          ? <mark key={index} className={`fx-hl fx-hl--${tone}`}>{part.text}</mark>
          : <React.Fragment key={index}>{part.text}</React.Fragment>
      ))}
    </>
  );
}

function Delta({ item, highlightWords }) {
  const words = useMemo(
    () => (item.type === 'changed' && highlightWords ? diffWords(item.before, item.after) : null),
    [item, highlightWords],
  );
  return (
    <li className={`fx-delta fx-delta--${item.type}`}>
      <div className="fx-delta-top">
        <Chip type={item.type} />
        <span className="fx-delta-label">{item.label}</span>
      </div>
      {(item.before || item.after) && (
        <div className={`fx-delta-body ${item.type === 'changed' ? 'is-two' : ''}`}>
          {item.type !== 'added' && item.before && (
            <div className="fx-delta-side fx-delta-side--before">
              <small>Before</small>
              <p>{words ? <Words parts={words.before} tone="del" /> : item.before}</p>
            </div>
          )}
          {item.type !== 'removed' && item.after && (
            <div className="fx-delta-side fx-delta-side--after">
              <small>Now</small>
              <p>{words ? <Words parts={words.after} tone="add" /> : item.after}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ExcelTable({ items }) {
  return (
    <div className="fx-table-wrap">
      <table className="fx-table fx-table--compact fx-cells">
        <thead>
          <tr><th scope="col">Cell</th><th scope="col">Before</th><th scope="col">Now</th><th scope="col">Change</th></tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.label}-${index}`}>
              <td><code>{item.label.replace('Cell ', '')}</code></td>
              <td className={item.before ? 'fx-cell-before' : 'fx-muted'}>{item.before || '(empty)'}</td>
              <td className={item.after ? 'fx-cell-after' : 'fx-muted'}>{item.after || '(empty)'}</td>
              <td><Chip type={item.type} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Group({ group, kind }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? group.items : group.items.slice(0, GROUP_LIMIT);
  const hidden = group.items.length - items.length;
  const isExcelCells = kind === 'excel' && group.items.every((item) => item.label.startsWith('Cell '));

  return (
    <section className="fx-group">
      <h4 className="fx-group-title">{group.title} <span className="fx-count">{group.items.length}</span></h4>
      {isExcelCells ? <ExcelTable items={items} /> : (
        <ul className="fx-delta-list">
          {items.map((item, index) => <Delta key={`${item.label}-${index}`} item={item} highlightWords={kind !== 'excel'} />)}
        </ul>
      )}
      {hidden > 0 && (
        <button type="button" className="fx-link-btn" onClick={() => setExpanded(true)}>Show {hidden} more</button>
      )}
    </section>
  );
}

const KIND_NOUN = { word: 'text', excel: 'cells', powerpoint: 'slide text', pdf: 'text', text: 'lines' };

/**
 * Plain-English list of what was added, changed or removed.
 * Handles Word (paragraphs), Excel (cells), PowerPoint (slides) and text files.
 */
export default function ContentChanges({ diff, extension }) {
  const content = useMemo(() => buildContentChanges(diff, extension), [diff, extension]);
  const { counts, groups, kind } = content;
  const total = counts.added + counts.changed + counts.removed;
  const media = diff?.media_changes;

  if (!diff || kind === 'binary' || kind === 'image') {
    return (
      <div className="fx-note-box">
        <Info size={18} aria-hidden="true" />
        <div>
          <strong>{kind === 'image' ? 'This picture looks different now.' : 'A readable preview isn’t available for this file type.'}</strong>
          <span>{diff?.message || 'The fingerprint above proves the contents changed. You can restore the original or mark the new version as safe.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fx-content-changes">
      <div className="fx-chips-row" aria-label="Change summary">
        <span className="fx-chip fx-chip--added">{plural(counts.added, 'addition')}</span>
        <span className="fx-chip fx-chip--changed">{plural(counts.changed, 'edit')}</span>
        <span className="fx-chip fx-chip--removed">{plural(counts.removed, 'removal')}</span>
        <span className="fx-muted fx-chips-note">in the {KIND_NOUN[kind] || 'contents'} of this file</span>
      </div>

      {media?.length > 0 && <MediaChangesPanel changes={media} />}

      {total === 0 && !media?.length && (
        <div className="fx-note-box">
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>The words look the same.</strong>
            <span>{diff.message || 'Only formatting or hidden data changed, so there is no text difference to show.'}</span>
          </div>
        </div>
      )}

      {groups.map((group) => <Group key={group.title} group={group} kind={kind} />)}
    </div>
  );
}
