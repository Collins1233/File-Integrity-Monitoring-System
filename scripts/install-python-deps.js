const spawn = require('cross-spawn');
const { findPython, pipCommand } = require('./python');

const python = findPython();

if (!python) {
  console.error('\nPython 3.10+ was not found.');
  console.error('Install Python from https://www.python.org/downloads/\n');
  process.exit(1);
}

const install = spawn.sync(
  python.command,
  [...python.args, '-m', 'pip', 'install', '-r', 'backend/requirements.txt'],
  { stdio: 'inherit', shell: process.platform === 'win32', cwd: require('path').join(__dirname, '..') },
);

process.exit(install.status ?? 1);
