const path = require('path');
const spawn = require('cross-spawn');
const { PYTHON_CANDIDATES } = require('./python');

const projectRoot = path.join(__dirname, '..');
const backendDir = path.join(projectRoot, 'backend');

function startApi(index = 0) {
  if (index >= PYTHON_CANDIDATES.length) {
    console.error('\nCould not start the API server: Python 3 was not found.');
    console.error('Install Python 3.10+ from https://www.python.org/downloads/');
    console.error('On Windows, check "Add Python to PATH" during install.');
    console.error('Then run: npm run setup:python\n');
    process.exit(1);
  }

  const { command, args } = PYTHON_CANDIDATES[index];

  console.log('\n[api] Starting monitoring server on http://127.0.0.1:8000 ...\n');

  const child = spawn(
    command,
    [...args, '-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: backendDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    }
  );

  child.on('error', () => startApi(index + 1));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }

    if (code && code !== 0) {
      console.error('\n[api] Server stopped unexpectedly.');
      console.error('Run from project root: npm run setup:python');
      console.error('Then: npm run dev\n');
    }

    process.exit(code ?? 0);
  });
}

startApi();
