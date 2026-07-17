import {
  Activity,
  Bell,
  FileText,
  Files,
  Folder,
  HelpCircle,
  RotateCcw,
  Settings,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react';

const SECTIONS = [
  {
    id: 'getting-started',
    icon: Folder,
    title: 'Getting started',
    steps: [
      'Open the Overview tab and enter the full path to a folder you want to monitor (e.g. /Users/you/Documents/project).',
      'Click Pick folder — a baseline snapshot is created automatically from every file in that folder.',
      'Background monitoring starts immediately and re-checks on the interval set in Settings (default: every 20 minutes).',
      'Use Check Now on the Overview for an immediate scan without waiting for the next scheduled check.',
    ],
  },
  {
    id: 'overview',
    icon: Activity,
    title: 'Overview dashboard',
    steps: [
      'Status cards show your monitored folder, file count, and baseline creation time.',
      'When changes are detected, modified, deleted, and new files appear in separate sections with expandable diffs.',
      'Text files show a side-by-side before/after viewer. Office files (Word, Excel, PowerPoint) show structured cell or paragraph changes when available.',
      'After reviewing legitimate changes, click Accept changes & update baseline so the same edits stop triggering alerts.',
      'Check Now runs a manual scan and generates a PDF report when changes are found.',
    ],
  },
  {
    id: 'files',
    icon: Files,
    title: 'Monitored Files',
    steps: [
      'Browse every file included in your baseline with search and type filters.',
      'Expand a row to preview text snapshots stored at baseline time.',
      'Large files may be marked Hash-only — they are monitored by fingerprint only, not full text content.',
      'If a backup exists, use Restore from baseline backup to revert a file to its baseline copy.',
      'When monitoring multiple folders, use the folder switcher at the top to change which monitor you are viewing.',
    ],
  },
  {
    id: 'alerts',
    icon: Bell,
    title: 'Alerts & notifications',
    steps: [
      'In-app toast notifications appear when background checks find changes — they stay visible for about 14 seconds.',
      'Click Enable browser notifications on the Overview to get alerts even when the tab is in the background.',
      'Dismiss a toast to acknowledge that alert; it will not reappear until new changes are detected.',
      'The monitoring status bar shows whether auto-checks are active, when the last check ran, and when the next one is scheduled.',
    ],
  },
  {
    id: 'logs',
    icon: Terminal,
    title: 'System Logs',
    steps: [
      'View the full audit trail from fim_log.txt — scans, baselines, alerts, and errors.',
      'Export CSV or Export JSON to download the log for compliance or external analysis.',
      'The live console on the Overview tab shows real-time actions from your current session.',
    ],
  },
  {
    id: 'reports',
    icon: FileText,
    title: 'Reports Archive',
    steps: [
      'PDF integrity reports are generated when Check Now finds changes (not on silent background checks).',
      'Preview opens the report in the browser; Download saves the PDF locally.',
      'Delete removes a report you no longer need. The system keeps at most 5 reports (configurable in Settings).',
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'Settings',
    steps: [
      'Check interval — how often background monitoring runs (in minutes).',
      'Excluded extensions — file types to skip during scans (e.g. .tmp, .swp).',
      'Hash-only threshold — files larger than this size are fingerprinted instead of storing full text.',
      'Max reports kept — oldest reports are pruned automatically when this limit is exceeded.',
      'Dark mode — toggle the visual theme; your preference is saved in the browser.',
    ],
  },
  {
    id: 'tips',
    icon: Shield,
    title: 'Tips & troubleshooting',
    steps: [
      'Run the app locally with: python3 server.py — then open http://127.0.0.1:8000 in your browser.',
      'If the dashboard shows a red Server disconnected banner, restart the Python server.',
      'After a version update, cached data is cleared automatically and the page refreshes within 15 seconds.',
      'This tool monitors folders on the machine where the server runs — it cannot watch files on your computer from a remote cloud host.',
      'For always-on monitoring, keep the server running or set it up as a background service (see Phase 3 in project docs).',
    ],
  },
];

export default function HelpPanel({ onNavigate }) {
  return (
    <section className="glass-panel help-panel">
      <div className="help-header">
        <HelpCircle size={22} />
        <div>
          <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Help & Guide</h3>
          <p className="text-secondary" style={{ fontSize: '0.9rem' }}>
            Everything you need to use File Integrity Monitoring effectively.
          </p>
        </div>
      </div>

      <div className="help-quick-links">
        <span className="help-quick-label">Jump to a section:</span>
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#help-${section.id}`} className="help-quick-link">
            {section.title}
          </a>
        ))}
      </div>

      <div className="help-sections">
        {SECTIONS.map((section, index) => {
          const Icon = section.icon;
          return (
            <article key={section.id} id={`help-${section.id}`} className="help-section">
              <div className="help-section-header">
                <span className="help-section-number">{index + 1}</span>
                <Icon size={20} />
                <h4>{section.title}</h4>
              </div>
              <ol className="help-steps">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {section.id === 'getting-started' && onNavigate && (
                <button type="button" className="btn btn-primary help-cta" onClick={() => onNavigate('dashboard')}>
                  <Zap size={16} /> Go to Overview
                </button>
              )}
              {section.id === 'settings' && onNavigate && (
                <button type="button" className="btn btn-secondary help-cta" onClick={() => onNavigate('settings')}>
                  <Settings size={16} /> Open Settings
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="help-footer">
        <RotateCcw size={16} />
        <p>
          Need to start over? Pick a new folder on the Overview tab to replace the baseline, or delete{' '}
          <code>baseline.json</code> in the project folder and restart the server.
        </p>
      </div>
    </section>
  );
}
