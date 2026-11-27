import React, { useState } from 'react';
import {
  Zap,
  AlertTriangle,
  FileCode,
  Skull,
  FilePlus,
  Trash2,
  Edit3,
  Play,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function AttackSimulatorToolbar({
  apiBase,
  apiFetch,
  monitors,
  activeMonitorId,
  monitoredFiles,
  onOpenEditor,
  onCheckNow,
  addConsoleLog,
  addToast,
  refreshState,
}) {
  const [loadingScenario, setLoadingScenario] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const handleSimulate = async (scenario, label) => {
    setLoadingScenario(scenario);
    addConsoleLog(`[SIMULATION] Initiating "${label}" attack scenario…`, 'warning');

    try {
      const fetchFn = apiFetch || fetch;
      const res = await fetchFn(`${apiBase}/api/files/simulate-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          monitor_id: activeMonitorId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addConsoleLog(`[SIMULATION SUCCESS] ${data.message}`, 'danger');
        addToast?.({
          id: Date.now(),
          type: 'warning',
          title: `Simulated Attack: ${label}`,
          message: `${data.message} Running integrity check…`,
        });

        // Automatically trigger Check Now to demonstrate real-time detection!
        if (onCheckNow) {
          setTimeout(() => {
            onCheckNow();
          }, 400);
        } else if (refreshState) {
          refreshState();
        }
      } else {
        addConsoleLog(`Simulation failed: ${data.detail || 'Unknown error'}`, 'danger');
        addToast?.({
          id: Date.now(),
          type: 'danger',
          title: 'Simulation Failed',
          message: data.detail || 'Could not complete attack scenario.',
        });
      }
    } catch (err) {
      addConsoleLog(`Error simulating scenario: ${err.message}`, 'danger');
    } finally {
      setLoadingScenario(null);
    }
  };

  const handleOpenFirstFileEditor = () => {
    if (monitoredFiles && monitoredFiles.length > 0) {
      onOpenEditor?.(monitoredFiles[0].path);
    } else {
      addToast?.({
        id: Date.now(),
        type: 'warning',
        title: 'No Monitored Files',
        message: 'Add a folder or select server presets first.',
      });
    }
  };

  return (
    <section
      className="glass-panel"
      style={{
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        borderRadius: '14px',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(15, 23, 42, 0.75) 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                ⚡ Cloud Testing Sandbox & Attack Simulator
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  fontWeight: 600,
                }}
              >
                1-Click Demo
              </span>
            </div>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Simulate real-world tampering, ransomware, or rogue files directly on cloud-monitored files to test SHA-256 detection and diff viewing.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.6rem', borderRadius: '6px' }}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '1.15rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* In-Browser Editor */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleOpenFirstFileEditor}
              style={{
                fontSize: '0.875rem',
                padding: '0.6rem 1rem',
                gap: '0.5rem',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                borderColor: 'rgba(59, 130, 246, 0.35)',
                color: '#60a5fa',
              }}
              title="Open the in-browser code/text editor to make custom modifications to monitored files"
            >
              <Edit3 size={15} />
              ✏️ Edit File in Browser
            </button>

            {/* Scenario 1: Unauthorized Edit */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSimulate('modify', 'Unauthorized Modification')}
              disabled={loadingScenario !== null}
              style={{
                fontSize: '0.875rem',
                padding: '0.6rem 1rem',
                gap: '0.5rem',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                color: '#f59e0b',
              }}
              title="Injects unauthorized code into an existing monitored file"
            >
              <Zap size={15} />
              {loadingScenario === 'modify' ? 'Injecting…' : '⚡ 1-Click Tamper'}
            </button>

            {/* Scenario 2: Ransomware Payload */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSimulate('ransomware', 'Ransomware Payload')}
              disabled={loadingScenario !== null}
              style={{
                fontSize: '0.875rem',
                padding: '0.6rem 1rem',
                gap: '0.5rem',
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#f87171',
              }}
              title="Appends a simulated ransomware encrypted block payload"
            >
              <Skull size={15} />
              {loadingScenario === 'ransomware' ? 'Simulating…' : '☣️ Ransomware Payload'}
            </button>

            {/* Scenario 3: Rogue Backdoor File */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSimulate('rogue_file', 'Rogue Backdoor File')}
              disabled={loadingScenario !== null}
              style={{
                fontSize: '0.875rem',
                padding: '0.6rem 1rem',
                gap: '0.5rem',
                borderColor: 'rgba(168, 85, 247, 0.4)',
                color: '#c084fc',
              }}
              title="Creates an unauthorized backdoor script (unauthorized_backdoor.sh) in the monitored directory"
            >
              <FilePlus size={15} />
              {loadingScenario === 'rogue_file' ? 'Creating…' : '🛑 Inject Rogue File'}
            </button>

            {/* Scenario 4: Delete File */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSimulate('delete', 'Malicious Deletion')}
              disabled={loadingScenario !== null}
              style={{
                fontSize: '0.875rem',
                padding: '0.6rem 1rem',
                gap: '0.5rem',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
              }}
              title="Deletes a file on disk to test missing file detection"
            >
              <Trash2 size={15} />
              {loadingScenario === 'delete' ? 'Deleting…' : '🗑️ Delete Test File'}
            </button>
          </div>

          <div
            style={{
              marginTop: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span>💡 <strong>Tip for evaluators:</strong> Click any attack above; the system immediately applies the change and triggers an automatic integrity scan so you can view the alert, SHA-256 hash diff, and side-by-side comparison.</span>
          </div>
        </div>
      )}
    </section>
  );
}
