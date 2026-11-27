import React from 'react';
import {
  CheckCircle2,
  FilePlus2,
  FileMinus2,
  FilePenLine,
  Loader2,
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  FileCode,
  FileArchive,
} from 'lucide-react';
import { STATUS } from './statusConfig';
import { extensionOf } from './format';

const STATUS_ICON = {
  intact: CheckCircle2,
  modified: FilePenLine,
  added: FilePlus2,
  deleted: FileMinus2,
};

/** Status pill: always icon + text (never color alone). */
export function StatusBadge({ status = 'intact', label }) {
  const config = STATUS[status] || STATUS.intact;
  const Icon = STATUS_ICON[config.key];
  return (
    <span className={`fx-badge fx-badge--${config.key}`}>
      <Icon size={14} aria-hidden="true" />
      {label || config.label}
    </span>
  );
}

/** Button with built-in loading state. variant: primary | secondary | danger | ghost */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  loadingLabel,
  children,
  className = '',
  disabled,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`fx-btn fx-btn--${variant} fx-btn--${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="fx-spin" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="fx-page-header">
      <div>
        <h1 className="fx-page-title">{title}</h1>
        {subtitle && <p className="fx-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="fx-page-actions">{actions}</div>}
    </div>
  );
}

/** Summary box on the dashboard. tone: neutral | intact | modified | added | deleted */
export function SummaryCard({ icon: Icon, label, value, hint, tone = 'neutral', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`fx-card fx-summary-card fx-tone--${tone} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
    >
      <span className="fx-summary-icon" aria-hidden="true"><Icon size={20} /></span>
      <span className="fx-summary-body">
        <span className="fx-summary-label">{label}</span>
        <span className="fx-summary-value">{value}</span>
        {hint && <span className="fx-summary-hint">{hint}</span>}
      </span>
    </Tag>
  );
}

/** Friendly empty / zero state. */
export function EmptyState({ icon: Icon, title, text, actions, tone = 'neutral' }) {
  return (
    <div className={`fx-empty fx-tone--${tone}`}>
      {Icon && <span className="fx-empty-icon" aria-hidden="true"><Icon size={26} /></span>}
      <h2 className="fx-empty-title">{title}</h2>
      {text && <p className="fx-empty-text">{text}</p>}
      {actions && <div className="fx-empty-actions">{actions}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', icon: Icon, title, children, actions }) {
  return (
    <div className={`fx-banner fx-banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {Icon && <Icon size={20} aria-hidden="true" className="fx-banner-icon" />}
      <div className="fx-banner-body">
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {actions && <div className="fx-banner-actions">{actions}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 4, cols = 4 }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}><span className="fx-skeleton" style={{ width: `${c === 0 ? 70 : 45}%` }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

const TYPE_ICON = {
  '.doc': FileText, '.docx': FileText, '.rtf': FileText, '.txt': FileText, '.md': FileText, '.log': FileText, '.pdf': FileText,
  '.xls': FileSpreadsheet, '.xlsx': FileSpreadsheet, '.csv': FileSpreadsheet,
  '.ppt': Presentation, '.pptx': Presentation,
  '.png': FileImage, '.jpg': FileImage, '.jpeg': FileImage, '.gif': FileImage, '.webp': FileImage, '.svg': FileImage,
  '.py': FileCode, '.js': FileCode, '.jsx': FileCode, '.ts': FileCode, '.html': FileCode, '.css': FileCode, '.json': FileCode, '.xml': FileCode, '.yaml': FileCode, '.yml': FileCode, '.sh': FileCode,
  '.zip': FileArchive,
};

export function FileTypeIcon({ path, size = 18 }) {
  const Icon = TYPE_ICON[extensionOf(path)] || File;
  return <Icon size={size} aria-hidden="true" />;
}
