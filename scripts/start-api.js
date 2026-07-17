const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const serverPath = path.join(projectRoot, 'backend', 'server.py');

const pythonCommands = process.platform === 'win32'
  ? [
      { command: 'py', args: ['-3', serverPath] },
      { command: 'python', args: [serverPath] },
      { command: 'python3', args: [serverPath] },
    ]
  : [
      { command: 'python3', args: [serverPath] },
      { command: 'python', args: [serverPath] },
    ];

function startApi(index = 0) {
  if (index >= pythonCommands.length) {
    console.error('\nCould not start the API server: Python 3 was not found.');
    console.error('Install Python 3.10+ from https://www.python.org/downloads/');
    console.error('Then run: pip install -r backend/requirements.txt\n');
    process.exit(1);
  }

  const { command, args } = pythonCommands[index];
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', () => startApi(index + 1));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });
}

startApi();
