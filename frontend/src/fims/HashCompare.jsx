import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Highlights the characters that differ between two fingerprints. */
function Fingerprint({ value, other, tone }) {
  if (!value) return null;
  return (
    <code className="fx-hash">
      {value.split('').map((char, index) => (
        <span key={index} className={other && other[index] !== char ? `fx-hash-diff fx-hash-diff--${tone}` : undefined}>{char}</span>
      ))}
    </code>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked on http; the hash is still selectable */
    }
  };
  return (
    <button type="button" className="fx-copy-btn" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function HashRow({ title, hash, emptyText, other, tone }) {
  return (
    <div className={`fx-hash-row fx-hash-row--${tone}`}>
      <div className="fx-hash-row-head">
        <span className="fx-hash-title">{title}</span>
        {hash && <CopyButton text={hash} label={title} />}
      </div>
      {hash ? <Fingerprint value={hash} other={other} tone={tone} /> : <span className="fx-hash-empty">{emptyText}</span>}
    </div>
  );
}

export default function HashCompare({ oldHash, newHash, status }) {
  const identical = oldHash && newHash && oldHash === newHash;
  return (
    <section className="fx-hash-card" aria-label="SHA-256 fingerprint comparison">
      <div className="fx-hash-intro">
        <h3>File fingerprint (SHA-256)</h3>
        <p>
          A fingerprint is a unique code made from a file’s exact contents. Change even one character and the
          code changes completely.
        </p>
      </div>
      <HashRow
        title="Before — saved baseline"
        hash={oldHash}
        other={newHash}
        tone="old"
        emptyText="Not in the baseline — this file is new."
      />
      <HashRow
        title="Now — current file"
        hash={newHash}
        other={oldHash}
        tone="new"
        emptyText={status === 'deleted' ? 'File not found — it was deleted.' : 'Not available.'}
      />
      {identical && <p className="fx-note">The fingerprints match, so the file is unchanged.</p>}
    </section>
  );
}
