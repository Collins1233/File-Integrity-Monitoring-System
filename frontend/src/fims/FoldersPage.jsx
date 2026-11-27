import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FilePenLine,
  FileStack,
  HardDrive,
  RotateCcw,
  ScanLine,
  Trash2,
  Undo2,
  Plus,
  FolderPlus,
} from 'lucide-react';
import { Button, EmptyState, FileTypeIcon, PageHeader, StatusBadge } from './ui';
import TestingSandbox from './TestingSandbox';
import { baseName, formatBytes, formatDateTime, normalizePath, plural } from './format';

function monitorName(monitor) {
  if (monitor.monitor_type === 'files') return `Selected files (${monitor.file_count})`;
  return baseName(monitor.folder_path) || monitor.folder_path;
}

function MonitorCard({
  monitor,
  files,
  statusLookup,
  expanded,
  onToggle,
  canAct,
  isAdmin,
  onReset,
  onRemove,
  onEdit,
  onRestore,
  restoringPath,
}) {
  const isFolder = monitor.monitor_type !== 'files';
  const Icon = isFolder ? Folder : FileStack;
  const changedHere = files.filter((file) => statusLookup.get(normalizePath(file.path))).length;

  return (
    <article className="fx-card fx-monitor">
      <div className="fx-monitor-main">
        <span className="fx-monitor-icon" aria-hidden="true"><Icon size={22} /></span>
        <div className="fx-monitor-info">
          <h3 className="fx-monitor-name">{monitorName(monitor)}</h3>
          <code className="fx-path" title={monitor.folder_path}>{monitor.folder_path}</code>
          <div className="fx-monitor-meta">
            <span>{isFolder ? 'Folder' : 'Hand-picked files'}</span>
            <span>{plural(monitor.file_count, 'file')}</span>
            <span>Baseline saved {formatDateTime(monitor.created_at)}</span>
            {changedHere > 0 && <span className="fx-meta-alert">{plural(changedHere, 'file')} changed</span>}
          </div>
        </div>
        <div className="fx-monitor-actions">
          <Button
            icon={RotateCcw}
            size="sm"
            onClick={() => onReset(monitor)}
            disabled={!canAct}
            title="Save these files exactly as they are now as your new trusted baseline"
          >
            Reset baseline
          </Button>
          <Button
            icon={Trash2}
            size="sm"
            variant="danger"
            onClick={() => onRemove(monitor)}
            disabled={!isAdmin}
            title={isAdmin ? 'Stop watching this folder' : 'Only admins can stop monitoring'}
          >
            Stop watching
          </Button>
        </div>
      </div>

      <button
        type="button"
        className="fx-monitor-toggle"
        onClick={() => onToggle(monitor.id)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        {expanded ? 'Hide files' : `Show the ${plural(files.length, 'file')} in this baseline`}
      </button>

      {expanded && (
        <div className="fx-table-wrap fx-monitor-files">
          <table className="fx-table fx-table--compact">
            <thead>
              <tr>
                <th scope="col">File name</th>
                <th scope="col">Size</th>
                <th scope="col">Last modified</th>
                <th scope="col">Status</th>
                <th scope="col" className="fx-col-action"><span className="fx-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const status = statusLookup.get(normalizePath(file.path)) || 'intact';
                return (
                  <tr key={file.path}>
                    <td>
                      <div className="fx-file-cell">
                        <span className="fx-file-icon"><FileTypeIcon path={file.path} /></span>
                        <div>
                          <div className="fx-file-name">{file.name || baseName(file.path)}</div>
                          {file.relative_path && file.relative_path !== file.name && (
                            <div className="fx-file-path" title={file.path}>{file.relative_path}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="fx-muted">{formatBytes(file.size)}</td>
                    <td className="fx-muted">{formatDateTime(file.last_modified, '—')}</td>
                    <td><StatusBadge status={status} /></td>
                    <td className="fx-col-action">
                      <div className="fx-row-actions">
                        <Button size="sm" variant="ghost" icon={FilePenLine} onClick={() => onEdit(file.path)} disabled={!canAct} title="View or edit this file in the browser">
                          Edit
                        </Button>
                        {status !== 'intact' && file.has_backup && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Undo2}
                            onClick={() => onRestore(file.path)}
                            loading={restoringPath === file.path}
                            loadingLabel="Restoring…"
                            disabled={!canAct}
                            title="Put the original file back from the baseline backup"
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function FoldersPage({
  monitors,
  files,
  statusLookup,
  canAct,
  isAdmin,
  folderLoading,
  scanning,
  folderPathInput,
  onFolderPathInput,
  onSubmitPath,
  pathPlaceholder,
  helpText,
  onAddFolder,
  onAddFiles,
  onOpenServerBrowser,
  onScan,
  onResetBaseline,
  onRemoveMonitor,
  onEdit,
  onRestore,
  restoringPath,
  sandbox,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const toggle = (id) => setExpandedId((current) => (current === id ? null : id));

  return (
    <>
      <PageHeader
        title="Monitored Folders & Files"
        subtitle="Everything FIMS is watching, and when each baseline was saved."
        actions={(
          <Button
            variant="primary"
            icon={ScanLine}
            onClick={onScan}
            loading={scanning}
            loadingLabel="Scanning…"
            disabled={!canAct || monitors.length === 0}
            title={monitors.length === 0 ? 'Add a folder first' : 'Check every monitored folder and file now'}
          >
            Run Scan
          </Button>
        )}
      />

      <section className="fx-card fx-add">
        <div className="fx-add-head">
          <div>
            <h2 className="fx-card-title">Add something to watch</h2>
            <p className="fx-card-sub">{helpText}</p>
          </div>
          <div className="fx-add-actions">
            <Button variant="primary" icon={FolderPlus} onClick={onAddFolder} loading={folderLoading} loadingLabel="Adding…" disabled={!canAct}>
              Add Folder
            </Button>
            <Button icon={FileStack} onClick={onAddFiles} disabled={folderLoading || !canAct}>
              Add Files
            </Button>
            <Button variant="ghost" icon={HardDrive} onClick={() => onOpenServerBrowser('folder')} disabled={folderLoading || !canAct} title="Browse folders that live on the FIMS server (such as the demo files)">
              Server folders
            </Button>
          </div>
        </div>

        <details className="fx-disclosure">
          <summary>Prefer to type a folder path instead?</summary>
          <form className="fx-path-form" onSubmit={onSubmitPath}>
            <input
              type="text"
              value={folderPathInput}
              onChange={(event) => onFolderPathInput(event.target.value)}
              placeholder={pathPlaceholder}
              disabled={folderLoading || !canAct}
              aria-label="Folder path"
            />
            <Button type="submit" icon={Plus} loading={folderLoading} loadingLabel="Adding…" disabled={!canAct}>Add</Button>
          </form>
        </details>
      </section>

      <h2 className="fx-section-title">Being watched <span className="fx-count">{monitors.length}</span></h2>

      {monitors.length === 0 ? (
        <section className="fx-card">
          <EmptyState
            icon={Folder}
            title="Nothing is being watched yet"
            text="Use “Add Folder” or “Add Files” above. FIMS will save a baseline straight away."
          />
        </section>
      ) : (
        <div className="fx-stack">
          {monitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              files={files.filter((file) => file.monitor_id === monitor.id)}
              statusLookup={statusLookup}
              expanded={expandedId === monitor.id}
              onToggle={toggle}
              canAct={canAct}
              isAdmin={isAdmin}
              onReset={onResetBaseline}
              onRemove={onRemoveMonitor}
              onEdit={onEdit}
              onRestore={onRestore}
              restoringPath={restoringPath}
            />
          ))}
        </div>
      )}

      {monitors.length > 0 && (
        <TestingSandbox
          files={files}
          canAct={canAct}
          onEdit={onEdit}
          {...sandbox}
        />
      )}
    </>
  );
}
