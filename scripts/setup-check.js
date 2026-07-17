const { findPython, checkDependencies, pipCommand } = require('./python');

const python = findPython();

if (!python) {
  console.error('\n[setup] Python 3.10+ was not found.');
  console.error('Install Python from https://www.python.org/downloads/');
  console.error('On Windows, enable "Add Python to PATH" during install.\n');
  process.exit(1);
}

const deps = checkDependencies(python);
if (deps.status !== 0) {
  console.error('\n[setup] Python is installed but API dependencies are missing.');
  console.error(`Run this from the project root:\n  ${pipCommand(python)}\n`);
  process.exit(1);
}

console.log(`[setup] Ready (${python.command}${python.args.length ? ` ${python.args.join(' ')}` : ''})`);
