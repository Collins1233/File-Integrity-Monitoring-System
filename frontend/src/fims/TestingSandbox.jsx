import React, { useState } from 'react';
import { FilePenLine, FilePlus2, FlaskConical, Trash2, Zap, Skull } from 'lucide-react';
import { Button } from './ui';
import { baseName } from './format';

const SCENARIOS = [
  { id: 'modify', icon: Zap, label: 'Make a small edit', hint: 'Adds a line of text to the file.', needsFile: true },
  { id: 'ransomware', icon: Skull, label: 'Simulate ransomware text', hint: 'Appends scrambled “encrypted” text.', needsFile: true },
  { id: 'rogue_file', icon: FilePlus2, label: 'Create an unexpected file', hint: 'Adds a new file the baseline has never seen.', needsFile: false },
  { id: 'delete', icon: Trash2, label: 'Delete the file', hint: 'Removes the file from disk.', needsFile: true },
];

/**
 * Optional "try it" panel. It changes real files on the server so first-time users
 * (and testers on the cloud version) can see detection working in a few clicks.
 */
export default function TestingSandbox({
  files,
  apiBase,
  apiFetch,
  canAct,
  onEdit,
  onSimulated,
  addConsoleLog,
  addToast,
}) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(null);
  const target = selected || files[0]?.path || '';

  const run = async (scenario) => {
    setBusy(scenario.id);
    addConsoleLog?.(`Test: ${scenario.label.toLowerCase()}…`, 'warning');
    try {
      const res = await apiFetch(`${apiBase}/api/files/simulate-scenario`, {
        method: 'POST',
        body: JSON.stringify({ scenario: scenario.id, path: scenario.id === 'rogue_file' ? null : target }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast?.({ id: Date.now(), type: 'warning', title: 'Test change made', message: `${data.message} Scanning now…` });
        onSimulated?.();
      } else {
        addToast?.({ id: Date.now(), type: 'danger', title: 'Could not make the test change', message: data.detail || 'Something went wrong.' });
      }
    } catch (error) {
      addConsoleLog?.(`Test failed: ${error.message}`, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="fx-card fx-sandbox">
      <summary>
        <span className="fx-sandbox-icon" aria-hidden="true"><FlaskConical size={18} /></span>
        <span>
          <strong>Try it out</strong>
          <small>Make a test change and watch FIMS catch it</small>
        </span>
      </summary>

      <div className="fx-sandbox-body">
        <p className="fx-note">
          These buttons change a real file on the server so you can see how detection works. Use a demo folder, not
          files you care about — you can always restore the original from the “File Changes” page.
        </p>

        {files.length === 0 ? (
          <p className="fx-muted">Add a folder first, then come back here.</p>
        ) : (
          <>
            <label className="fx-field">
              <span>File to test with</span>
              <select value={target} onChange={(event) => setSelected(event.target.value)}>
                {files.map((file) => (
                  <option key={file.path} value={file.path}>{file.name || baseName(file.path)}</option>
                ))}
              </select>
            </label>

            <div className="fx-sandbox-actions">
              <Button icon={FilePenLine} onClick={() => onEdit(target)} disabled={!canAct || !target}>
                Edit in browser
              </Button>
              {SCENARIOS.map((scenario) => (
                <Button
                  key={scenario.id}
                  icon={scenario.icon}
                  title={scenario.hint}
                  onClick={() => run(scenario)}
                  loading={busy === scenario.id}
                  loadingLabel="Working…"
                  disabled={!canAct || busy !== null || (scenario.needsFile && !target)}
                >
                  {scenario.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
