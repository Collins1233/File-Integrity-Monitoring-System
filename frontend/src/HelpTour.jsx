import { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  File,
  FileStack,
  FileText,
  Files,
  Folder,
  HelpCircle,
  Settings,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react';

const TOUR_STEPS = [
  {
    id: 'welcome',
    icon: Shield,
    title: 'Welcome to FIM',
    text: 'File Integrity Monitoring keeps a snapshot of your files and tells you when something changes. Let us walk through the dashboard together.',
    tab: null,
    cta: null,
    scene: 'welcome',
  },
  {
    id: 'targets',
    icon: Folder,
    title: 'Choose what to watch',
    text: 'Add full folders or hand pick specific files. Each target gets its own baseline so nothing slips through.',
    tab: 'dashboard',
    cta: 'Go to Overview',
    scene: 'folders',
  },
  {
    id: 'check',
    icon: Zap,
    title: 'Run integrity checks',
    text: 'Hit Check Now anytime for an instant scan. Background monitoring follows the schedule in Settings, usually every 20 minutes.',
    tab: 'dashboard',
    cta: 'Try Check Now',
    scene: 'scan',
  },
  {
    id: 'files',
    icon: Files,
    title: 'Explore your files',
    text: 'Monitored Files shows icon tiles for every snapshotted file. Click one to preview content or restore from backup.',
    tab: 'files',
    cta: 'Open Monitored Files',
    scene: 'filegrid',
  },
  {
    id: 'alerts',
    icon: Bell,
    title: 'Get alerted instantly',
    text: 'Changes trigger in app toasts. Use the bell in the header to enable browser notifications so alerts reach you outside this tab.',
    tab: 'dashboard',
    cta: 'Back to Overview',
    scene: 'alert',
  },
  {
    id: 'reports',
    icon: FileText,
    title: 'Review PDF reports',
    text: 'When Check Now finds changes, a PDF report is generated. Preview it in the browser or download for your records.',
    tab: 'reports',
    cta: 'Open Reports',
    scene: 'reports',
  },
  {
    id: 'logs',
    icon: Terminal,
    title: 'Audit everything',
    text: 'System Logs captures every scan and event. Export CSV or JSON whenever you need a compliance copy.',
    tab: 'logs',
    cta: 'Open Logs',
    scene: 'logs',
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'Fine tune monitoring',
    text: 'Adjust check interval, excluded file types, hash only limits, and report retention. Changes save to the server and apply immediately.',
    tab: 'settings',
    cta: 'Open Settings',
    scene: 'settings',
  },
  {
    id: 'done',
    icon: Activity,
    title: 'You are ready',
    text: 'Add your first folder or files on Overview and let FIM do the rest. Replay this tour anytime from the header.',
    tab: 'dashboard',
    cta: 'Start monitoring',
    scene: 'done',
  },
];

function TourScene({ scene }) {
  if (scene === 'welcome') {
    return (
      <div className="tour-scene tour-scene-welcome">
        <Shield size={64} strokeWidth={1.4} />
        <div className="tour-scene-rings" />
      </div>
    );
  }

  if (scene === 'folders') {
    return (
      <div className="tour-scene tour-scene-folders">
        {[Folder, FileStack, Folder].map((Icon, index) => (
          <div key={index} className="tour-scene-folder-tile">
            <Icon size={28} />
          </div>
        ))}
      </div>
    );
  }

  if (scene === 'filegrid') {
    return (
      <div className="tour-scene tour-scene-files">
        {[FileText, File, FileText, File, FileText].map((Icon, index) => (
          <div key={index} className="tour-scene-file-tile">
            <Icon size={22} />
          </div>
        ))}
      </div>
    );
  }

  if (scene === 'scan') {
    return (
      <div className="tour-scene tour-scene-scan">
        <Zap size={40} />
        <div className="tour-scene-scan-bar"><span /></div>
      </div>
    );
  }

  if (scene === 'alert') {
    return (
      <div className="tour-scene tour-scene-alert">
        <div className="tour-scene-toast-mock">
          <Bell size={16} />
          <span>File changed</span>
        </div>
      </div>
    );
  }

  if (scene === 'reports') {
    return (
      <div className="tour-scene tour-scene-reports">
        <FileText size={44} />
        <span>PDF Report</span>
      </div>
    );
  }

  if (scene === 'logs') {
    return (
      <div className="tour-scene tour-scene-logs">
        <Terminal size={40} />
        <code>[SCAN] Integrity check complete</code>
      </div>
    );
  }

  if (scene === 'settings') {
    return (
      <div className="tour-scene tour-scene-settings">
        <Settings size={40} className="tour-scene-spin-slow" />
      </div>
    );
  }

  return (
    <div className="tour-scene tour-scene-done">
      <Activity size={48} />
    </div>
  );
}

export default function HelpTour({ onNavigate, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const step = TOUR_STEPS[stepIndex];
  const Icon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progress = ((stepIndex + 1) / TOUR_STEPS.length) * 100;

  const changeStep = (nextIndex) => {
    setAnimating(true);
    setTimeout(() => {
      setStepIndex(nextIndex);
      setAnimating(false);
    }, 180);
  };

  const goNext = () => {
    if (isLast) {
      onClose?.();
      onNavigate?.('dashboard');
      return;
    }
    changeStep(stepIndex + 1);
  };

  const goBack = () => changeStep(Math.max(0, stepIndex - 1));

  const tryStep = () => {
    if (step.tab) onNavigate?.(step.tab);
    if (isLast) onClose?.();
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft' && !isFirst) goBack();
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="help-tour-immersive">
      <div className="help-tour-backdrop" />
      <section className="help-tour-stage">
        <div className="help-tour-progress-track">
          <span className="help-tour-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="help-tour-stage-top">
          <div className="help-tour-badge">
            <HelpCircle size={18} />
            <span>Guided tour, step {stepIndex + 1} of {TOUR_STEPS.length}</span>
          </div>
          {onClose && (
            <button type="button" className="help-tour-skip" onClick={onClose}>
              Exit tour
            </button>
          )}
        </div>

        <div className={`help-tour-body ${animating ? 'animating' : ''}`} key={step.id}>
          <TourScene scene={step.scene} />

          <div className="help-tour-step">
            <div className="help-tour-icon">
              <Icon size={24} />
            </div>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </div>
        </div>

        <div className="help-tour-dots">
          {TOUR_STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`help-tour-dot ${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'done' : ''}`}
              onClick={() => changeStep(index)}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        <div className="help-tour-actions">
          <div className="help-tour-nav">
            <button type="button" className="btn btn-secondary" onClick={goBack} disabled={isFirst}>
              <ChevronLeft size={16} />
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={goNext}>
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight size={16} />}
            </button>
          </div>
          {step.cta && (
            <button type="button" className="btn btn-secondary help-tour-try" onClick={tryStep}>
              {step.cta}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
