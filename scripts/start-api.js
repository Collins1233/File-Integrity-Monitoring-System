const path = require('path');
const spawn = require('cross-spawn');
const { PYTHON_CANDIDATES } = require('./python');

const projectRoot = path.join(__dirname, '..');
const serverPath = path.join(projectRoot, 'backend', 'server.py');

function startApi(index = 0) {
  if (index >= PYTHON_CANDIDATES.length) {
    console.error('\nCould not start the API server: Python 3 was not found.');
    console.error('Install Python 3.10+ from https://www.python.org/downloads/');
    console.error('Then run: npm run setup:python\n');
    process.exit(1);
  }

  const { command, args } = PYTHON_CANDIDATES[index];
  const child = spawn(command, [...args, serverPath], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('error', () => startApi(index + 1));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }

    if (code && code !== 0) {
      console.error('\nAPI server stopped unexpectedly.');
      console.error('If dependencies are missing, run: npm run setup:python\n');
    }

    process.exit(code ?? 0);
  });
}

startApi();
