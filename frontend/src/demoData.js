/**
 * Realistic demonstration dataset for Vercel Cloud Preview / Showcase Mode.
 * This ensures that when someone visits the Vercel URL, they get an immediate,
 * interactive, responsive tour of the dashboard without needing a local backend running.
 */

export const DEMO_STATUS = {
  app_version: "2.0.1",
  dev_session: "vercel-preview",
  has_baseline: true,
  baseline_integrity: {
    is_valid: true,
    status: "VALID",
    tamper_detected: false,
  },
  folder_path: "/production/secure_configs",
  created_at: "2026-10-01 10:15:00",
  file_count: 24,
  active_file_count: 14,
  monitor_count: 3,
  active_monitor_id: "mon-prod-01",
  monitors: [
    {
      id: "mon-prod-01",
      folder_path: "/production/secure_configs",
      monitor_type: "folder",
      created_at: "2026-10-01 10:15:00",
      file_count: 14,
    },
    {
      id: "mon-audit-02",
      folder_path: "/var/log/compliance_audit",
      monitor_type: "folder",
      created_at: "2026-10-01 11:30:00",
      file_count: 9,
    },
    {
      id: "mon-hosts-03",
      folder_path: "/etc/hosts",
      monitor_type: "files",
      created_at: "2026-10-01 12:00:00",
      file_count: 1,
    },
  ],
};

export const DEMO_MONITORING = {
  enabled: true,
  active: true,
  interval_minutes: 20,
  is_checking: false,
  last_check_at: "2026-10-01 15:10:00",
  next_check_at: "2026-10-01 15:30:00",
  pending_alert_count: 1,
  last_result: {
    success: true,
    folder_path: "/production/secure_configs",
    modified_files: ["/production/secure_configs/database.yml"],
    deleted_files: [],
    new_files: [],
    text_differences: {
      "/production/secure_configs/database.yml":
        "--- /production/secure_configs/database.yml (baseline)\n+++ /production/secure_configs/database.yml (current)\n@@ -10,6 +10,6 @@\n database:\n   adapter: postgresql\n   host: primary-db.internal.bank.net\n   port: 5432\n-  pool: 25\n-  sslmode: verify-full\n+  pool: 50\n+  sslmode: require\n",
    },
    file_metadata: {
      "/production/secure_configs/database.yml": {
        size: 2048,
        modified: "2026-10-01 15:08:42",
        type: "yaml",
      },
    },
    report_path: "reports/fim_report_2026-10-01_151000.pdf",
    report_paths: ["reports/fim_report_2026-10-01_151000.pdf"],
    monitor_results: [],
    auto_check: false,
  },
  watchdog_active: true,
  active_watches_count: 3,
  events_processed_count: 142,
  engine_type: "watchdog_kernel",
};

export const DEMO_ALERTS = [
  {
    id: 101,
    timestamp: "2026-10-01 15:10:00",
    severity: "warning",
    type: "modified",
    title: "File Content Modified",
    folder_path: "/production/secure_configs",
    affected_files: [{ name: "database.yml", path: "/production/secure_configs/database.yml" }],
    message: "Detected 1 modified file during scheduled integrity audit.",
  },
];

export const DEMO_LOGS = [
  { timestamp: "15:10:00", message: "[AUTO CHECK] /production/secure_configs completed.", type: "info" },
  { timestamp: "15:10:00", message: "[REPORT GENERATED] reports/fim_report_2026-10-01_151000.pdf", type: "success" },
  { timestamp: "15:08:42", message: "[WATCHDOG] File modification event detected: /production/secure_configs/database.yml", type: "warning" },
  { timestamp: "15:05:22", message: "[HMAC-SHA256] Baseline store signature verified. (Status: VALID, 256-bit key)", type: "success" },
  { timestamp: "14:50:00", message: "[AUTO CHECK] Background monitoring scan completed. All 24 files verified.", type: "info" },
  { timestamp: "14:30:15", message: "[KERNEL_EVENT] Real-time filesystem watcher active on 3 targets.", type: "info" },
];

export const DEMO_FILES = [
  {
    name: "database.yml",
    path: "/production/secure_configs/database.yml",
    size: 2048,
    hash: "8f3a1b894ec7120da35678432a1b32d0f91234ac678ef0123456789abcdef012",
    modified: "2026-10-01 15:08:42",
    type: "yaml",
    status: "modified",
  },
  {
    name: "auth_service.py",
    path: "/production/secure_configs/auth_service.py",
    size: 14320,
    hash: "4a2b1c890123456789abcdef0123456789abcdef0123456789abcdef01234567",
    modified: "2026-10-01 10:12:00",
    type: "python",
    status: "intact",
  },
  {
    name: "api_gateway_routes.json",
    path: "/production/secure_configs/api_gateway_routes.json",
    size: 5120,
    hash: "7c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d",
    modified: "2026-10-01 09:45:00",
    type: "json",
    status: "intact",
  },
  {
    name: "pci_dss_compliance_policy.docx",
    path: "/production/secure_configs/pci_dss_compliance_policy.docx",
    size: 38400,
    hash: "1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f",
    modified: "2026-09-30 18:20:00",
    type: "docx",
    status: "intact",
  },
  {
    name: "ssl_certificate_chain.pem",
    path: "/production/secure_configs/ssl_certificate_chain.pem",
    size: 4096,
    hash: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
    modified: "2026-09-28 14:00:00",
    type: "pem",
    status: "intact",
  },
  {
    name: "quarterly_audit_records.xlsx",
    path: "/production/secure_configs/quarterly_audit_records.xlsx",
    size: 51200,
    hash: "3b2c1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b",
    modified: "2026-09-25 16:30:00",
    type: "xlsx",
    status: "intact",
  },
];

export const DEMO_REPORTS = [
  {
    filename: "fim_compliance_report_2026-10-01.pdf",
    created_at: "2026-10-01 15:10:00",
    size: 48200,
    path: "reports/fim_compliance_report_2026-10-01.pdf",
    html_path: "reports/fim_compliance_report_2026-10-01.html",
  },
  {
    filename: "fim_audit_summary_2026-09-30.pdf",
    created_at: "2026-09-30 23:59:00",
    size: 42100,
    path: "reports/fim_audit_summary_2026-09-30.pdf",
    html_path: "reports/fim_audit_summary_2026-09-30.html",
  },
];

export const DEMO_BROWSE_DIRECTORY = {
  current_path: "/production/secure_configs",
  parent_path: "/production",
  roots: ["/"],
  presets: [
    { name: "Production Configs", path: "/production/secure_configs", description: "Critical production environment files" },
    { name: "Compliance Logs", path: "/var/log/compliance_audit", description: "PCI-DSS audit log records" },
    { name: "System Policies", path: "/etc/security", description: "OS security policies" },
  ],
  items: [
    { name: "auth_service.py", path: "/production/secure_configs/auth_service.py", is_dir: false, size: 14320, modified: "2026-10-01 10:12:00" },
    { name: "database.yml", path: "/production/secure_configs/database.yml", is_dir: false, size: 2048, modified: "2026-10-01 15:08:42" },
    { name: "certificates", path: "/production/secure_configs/certificates", is_dir: true, size: 0, modified: "2026-10-01 09:00:00" },
    { name: "pci_dss_compliance_policy.docx", path: "/production/secure_configs/pci_dss_compliance_policy.docx", is_dir: false, size: 38400, modified: "2026-09-30 18:20:00" },
    { name: "quarterly_audit_records.xlsx", path: "/production/secure_configs/quarterly_audit_records.xlsx", is_dir: false, size: 51200, modified: "2026-09-25 16:30:00" },
  ],
};
