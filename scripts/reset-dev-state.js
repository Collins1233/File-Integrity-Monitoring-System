/**
 * Clears persisted FIM data before each `npm run dev` so every dev session starts fresh.
 * Production (`npm start`) does not run this script.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.join(__dirname, '..');

const filesToRemove = [
  'baseline.json',
  'fim_log.txt',
  'settings.json',
];

const dirsToRemove = [
  'baseline_files',
  'reports',
];

const legacyPaths = [
  path.join(projectRoot, 'backend', 'fim_log.txt'),
];

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

let cleared = 0;

for (const name of filesToRemove) {
  if (removeIfExists(path.join(projectRoot, name))) cleared += 1;
}

for (const name of dirsToRemove) {
  if (removeIfExists(path.join(projectRoot, name))) cleared += 1;
}

for (const legacyPath of legacyPaths) {
  if (removeIfExists(legacyPath)) cleared += 1;
}

const sessionId = crypto.randomUUID();
const sessionPath = path.join(projectRoot, '.fim-dev-session');
fs.writeFileSync(sessionPath, sessionId, 'utf8');

console.log(
  `\n[dev] Fresh session (${sessionId.slice(0, 8)}…). Cleared ${cleared} saved item${cleared === 1 ? '' : 's'} from the last run.\n`,
);
