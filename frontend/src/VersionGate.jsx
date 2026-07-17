import { useEffect, useState } from 'react';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';
const VERSION_KEY = 'fim_client_version';

export default function VersionGate() {
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [nextVersion, setNextVersion] = useState('2.0.0');

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        const serverVersion = data.app_version || '2.0.0';
        const storedVersion = localStorage.getItem(VERSION_KEY);

        if (storedVersion && storedVersion !== serverVersion) {
          setNextVersion(serverVersion);
          setVisible(true);

          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('fim_')) {
              localStorage.removeItem(key);
            }
          });
        }

        localStorage.setItem(VERSION_KEY, serverVersion);
      } catch {
        // Server offline banner handles this separately
      }
    };

    checkVersion();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;

    const timer = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          clearInterval(timer);
          window.location.reload();
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="version-gate">
      <div className="version-gate-card">
        <h2>FIM Dashboard updated</h2>
        <p>
          Version <strong>{nextVersion}</strong> is now available. Local cached data has been reset
          so you get a clean experience with the latest features.
        </p>
        <p className="version-gate-countdown">Refreshing in {countdown} seconds…</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Refresh now
        </button>
      </div>
    </div>
  );
}
