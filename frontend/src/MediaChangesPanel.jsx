import React from 'react';

function formatBytes(size) {
  if (!size && size !== 0) return '';
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function MediaThumb({ entry, emptyLabel }) {
  if (!entry) {
    return <div className="fc-media-empty">{emptyLabel}</div>;
  }
  if (entry.thumbnail) {
    return (
      <img
        src={entry.thumbnail}
        alt={entry.name || 'Embedded image'}
        className="fc-media-thumb"
      />
    );
  }
  return (
    <div className="fc-media-empty">
      {entry.name || 'Image'}
      {entry.size != null ? ` · ${formatBytes(entry.size)}` : ''}
      <span>(preview not available for this image type)</span>
    </div>
  );
}

export default function MediaChangesPanel({ changes }) {
  if (!changes?.length) return null;

  return (
    <div className="fc-media-panel">
      <h4 className="fc-media-title">Embedded images</h4>
      <p className="fc-media-intro">
        These pictures are inside the document. The check found them even when the text did not change.
      </p>
      <div className="fc-media-list">
        {changes.map((item, index) => (
          <article key={`${item.change}-${item.name}-${index}`} className={`fc-media-card fc-media-${item.change}`}>
            <header className="fc-media-card-head">
              <span className={`fc-media-badge ${item.change}`}>
                {item.change === 'added' ? 'Added' : item.change === 'removed' ? 'Removed' : 'Replaced'}
              </span>
              <strong>{item.label || item.name}</strong>
            </header>
            <div className="fc-media-compare">
              <div className="fc-media-side before">
                <span className="fc-media-side-label">Original</span>
                <MediaThumb entry={item.before} emptyLabel="Not in original" />
              </div>
              <div className="fc-media-arrow" aria-hidden="true">→</div>
              <div className="fc-media-side after">
                <span className="fc-media-side-label">Current</span>
                <MediaThumb entry={item.after} emptyLabel="Not in current" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
