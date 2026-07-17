import { Shield, Folder, Zap, Bell } from 'lucide-react';

export default function OnboardingWizard({ open, onClose, onStart }) {
  if (!open) return null;

  const steps = [
    {
      icon: Folder,
      title: 'Add folders or files',
      text: 'Add one or more folders, or pick specific files. Each target gets its own baseline automatically.',
    },
    {
      icon: Zap,
      title: 'Check anytime',
      text: 'Use Check Now for an immediate scan, or let background monitoring run every 20 minutes.',
    },
    {
      icon: Bell,
      title: 'Get notified',
      text: 'When files change, you will see in-app alerts. Allow browser notifications for alerts outside the tab.',
    },
    {
      icon: Shield,
      title: 'Review and accept',
      text: 'See what changed, restore files from backup, or accept changes to update your baseline.',
    },
  ];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h2>Welcome to FIM Dashboard</h2>
        <p className="onboarding-intro">File Integrity Monitoring in four simple steps:</p>
        <div className="onboarding-steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="onboarding-step">
                <div className="onboarding-step-number">{index + 1}</div>
                <Icon size={20} />
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="onboarding-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Skip</button>
          <button type="button" className="btn btn-primary" onClick={onStart}>Get started</button>
        </div>
      </div>
    </div>
  );
}
