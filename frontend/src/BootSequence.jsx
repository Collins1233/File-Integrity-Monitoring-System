import { useEffect, useRef, useState } from 'react';

const BOOT_SESSION_KEY = 'fim_boot_complete';
const APP_LOGO = '/fim-logo.png';

const FILE_STEPS = [
  { name: 'config.json', label: 'config.json' },
  { name: 'baseline.json', label: 'baseline.json' },
  { name: 'integrity.py', label: 'integrity engine' },
  { name: 'dashboard', label: 'dashboard shell' },
];

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function shouldShowBoot() {
  try {
    return sessionStorage.getItem(BOOT_SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function BootSequence({ open, onComplete }) {
  const [phase, setPhase] = useState('start'); // start | brand | load | done
  const [brandPlay, setBrandPlay] = useState(false);
  const [brandSubVisible, setBrandSubVisible] = useState(false);
  const [fileStates, setFileStates] = useState(() => FILE_STEPS.map(() => 'idle'));
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ count: '0 / 4', text: 'Waiting' });
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    return () => {
      abortRef.current?.abort();
    };
  }, [open]);

  const finish = () => {
    try {
      sessionStorage.setItem(BOOT_SESSION_KEY, '1');
    } catch {
      // ignore
    }
    setPhase('done');
    onComplete?.();
  };

  const runSequence = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      setFileStates(FILE_STEPS.map(() => 'idle'));
      setProgress(0);
      setBrandPlay(false);
      setBrandSubVisible(false);
      setStatus({ count: '0 / 4', text: 'Preparing baseline' });

      setPhase('brand');
      await wait(40, signal);
      setBrandPlay(true);
      await wait(1000, signal);
      setBrandSubVisible(true);
      await wait(750, signal);

      setPhase('load');
      await wait(280, signal);

      for (let i = 0; i < FILE_STEPS.length; i += 1) {
        setFileStates((prev) => prev.map((state, index) => (index === i ? 'show' : state)));
        setStatus({ count: `${i + 1} / ${FILE_STEPS.length}`, text: `Sealing ${FILE_STEPS[i].name}` });
        await wait(580, signal);
        setFileStates((prev) => prev.map((state, index) => (index === i ? 'done' : state)));
        setProgress(((i + 1) / FILE_STEPS.length) * 100);
        setStatus({ count: `${i + 1} / ${FILE_STEPS.length}`, text: `Sealed ${FILE_STEPS[i].name}` });
        await wait(320, signal);
      }

      await wait(450, signal);
      finish();
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error(err);
        finish();
      }
    }
  };

  if (!open || phase === 'done') return null;

  return (
    <div className="boot-overlay" role="dialog" aria-modal="true" aria-label="Starting File Integrity Monitoring System">
      <div className="boot-stage">
        {phase === 'start' && (
          <section className="boot-screen boot-screen-active">
            <div className="boot-glass">
              <img
                src={APP_LOGO}
                alt="File Integrity Monitoring System"
                className="boot-hero-logo"
                width={120}
                height={120}
              />
              <h1 className="boot-title">File Integrity Monitoring System</h1>
              <p className="boot-subtitle">
                Build a trusted baseline, then catch every change before it becomes a problem.
              </p>
              <button type="button" className="btn btn-primary" onClick={runSequence}>
                Start
              </button>
            </div>
          </section>
        )}

        {phase === 'brand' && (
          <section className="boot-screen boot-screen-active">
            <div className="boot-glass">
              <img
                src={APP_LOGO}
                alt=""
                className="boot-brand-logo"
                width={72}
                height={72}
              />
              <div className="boot-tag">Establishing identity</div>
              <div className={`boot-split-brand ${brandPlay ? 'play' : ''}`}>
                <div><span>File Integrity</span></div>
                <div><span>Monitoring</span></div>
                <div><span>System</span></div>
              </div>
              <p className={`boot-subtitle ${brandSubVisible ? 'visible' : 'is-hidden'}`}>
                Your files. Your baseline. Your control.
              </p>
            </div>
          </section>
        )}

        {phase === 'load' && (
          <section className="boot-screen boot-screen-active">
            <div className="boot-glass">
              <div className="boot-tag">Building baseline</div>
              <h1 className="boot-title boot-title-sm">Sealing your workspace</h1>
              <div className="boot-stack" aria-hidden="true">
                {FILE_STEPS.map((step, index) => (
                  <div
                    key={step.name}
                    className={`boot-file-card ${fileStates[index] === 'show' || fileStates[index] === 'done' ? 'show' : ''} ${fileStates[index] === 'done' ? 'done' : ''}`}
                    style={{ top: `${8 + index * 20}px`, zIndex: index + 1 }}
                  >
                    <div className="boot-file-icon" />
                    <em>{step.label}</em>
                    <span className="boot-check">✓</span>
                  </div>
                ))}
              </div>
              <div className="boot-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <p className="boot-status">
                <b>{status.count}</b>
                {' · '}
                {status.text}
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
