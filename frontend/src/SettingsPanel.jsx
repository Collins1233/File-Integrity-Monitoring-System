import { useEffect, useState } from 'react';
import { Settings, Moon, Sun, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE = window.location.origin.includes(':517') ? 'http://127.0.0.1:8000' : '';

export default function SettingsPanel({ darkMode, onToggleDarkMode, onSaved }) {
  const [settings, setSettings] = useState({
    monitoring_interval_seconds: 1200,
    monitoring_enabled: true,
    excluded_extensions: ['.tmp', '.swp', '.DS_Store'],
    hash_only_enabled: true,
    hash_only_size_bytes: 1048576,
    max_reports_retained: 5,
  });
  const [saving, setSaving] = useState(false);
  const [excludedText, setExcludedText] = useState('');
  const [saveMessage, setSaveMessage] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setExcludedText((data.excluded_extensions || []).join(', '));
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const intervalMinutes = Math.max(1, Number(settings.monitoring_interval_seconds) / 60);
    const hashMb = Math.max(1, Number(settings.hash_only_size_bytes) / (1024 * 1024));
    const maxReports = Math.min(50, Math.max(1, Number(settings.max_reports_retained)));

    try {
      const payload = {
        monitoring_interval_seconds: intervalMinutes * 60,
        monitoring_enabled: settings.monitoring_enabled,
        hash_only_enabled: settings.hash_only_enabled,
        hash_only_size_bytes: hashMb * 1024 * 1024,
        max_reports_retained: maxReports,
        excluded_extensions: excludedText.split(',').map((item) => item.trim()).filter(Boolean),
      };

      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setSettings(data.settings);
        setExcludedText((data.settings.excluded_extensions || []).join(', '));
        const interval = Math.round(data.settings.monitoring_interval_seconds / 60);
        const pruned = data.reports_pruned ? `, ${data.reports_pruned} old report(s) removed` : '';
        setSaveMessage(
          `Saved. Checks every ${interval} min, monitoring ${data.settings.monitoring_enabled ? 'on' : 'off'}${pruned}.`
        );
        onSaved?.(data.settings);
      } else {
        setSaveError(data.detail || 'Could not save settings.');
      }
    } catch (error) {
      setSaveError(error.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-panel settings-panel">
      <h3 className="card-title"><Settings size={18} /> Settings</h3>
      <p className="settings-intro">
        These options are saved to the server and apply to the next scan. Background monitoring restarts automatically when you save.
      </p>

      {saveMessage && (
        <div className="settings-feedback success">
          <CheckCircle size={16} />
          <span>{saveMessage}</span>
        </div>
      )}
      {saveError && (
        <div className="settings-feedback error">
          <AlertCircle size={16} />
          <span>{saveError}</span>
        </div>
      )}

      <div className="settings-grid">
        <label>
          Check interval (minutes)
          <input
            type="number"
            min="1"
            value={Math.round(settings.monitoring_interval_seconds / 60)}
            onChange={(e) => setSettings({ ...settings, monitoring_interval_seconds: Math.max(1, Number(e.target.value)) * 60 })}
          />
        </label>

        <label>
          Hash only threshold (MB)
          <input
            type="number"
            min="1"
            value={Math.round(settings.hash_only_size_bytes / (1024 * 1024))}
            onChange={(e) => setSettings({ ...settings, hash_only_size_bytes: Math.max(1, Number(e.target.value)) * 1024 * 1024 })}
          />
        </label>

        <label>
          Max reports kept
          <input
            type="number"
            min="1"
            max="50"
            value={settings.max_reports_retained}
            onChange={(e) => setSettings({ ...settings, max_reports_retained: Number(e.target.value) })}
          />
        </label>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.monitoring_enabled}
            onChange={(e) => setSettings({ ...settings, monitoring_enabled: e.target.checked })}
          />
          Background monitoring enabled
        </label>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.hash_only_enabled}
            onChange={(e) => setSettings({ ...settings, hash_only_enabled: e.target.checked })}
          />
          Hash only mode for large text files
        </label>

        <label className="settings-full">
          Excluded extensions (comma separated)
          <input
            type="text"
            value={excludedText}
            onChange={(e) => setExcludedText(e.target.value)}
            placeholder=".tmp, .swp, .DS_Store"
          />
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" className="btn btn-secondary" onClick={onToggleDarkMode}>
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          {darkMode ? 'Light mode' : 'Dark mode'}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </section>
  );
}
