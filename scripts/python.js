const spawn = require('cross-spawn');

const PYTHON_CANDIDATES = process.platform === 'win32'
  ? [
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    ]
  : [
      { command: 'python3', args: [] },
      { command: 'python', args: [] },
    ];

function runPython(command, args, script) {
  return spawn.sync(command, [...args, '-c', script], {
    encoding: 'utf8',
    shell: false,
  });
}

function findPython() {
  for (const candidate of PYTHON_CANDIDATES) {
    const versionCheck = runPython(
      candidate.command,
      candidate.args,
      'import sys; print(sys.version_info[:2])',
    );

    if (versionCheck.status !== 0) {
      continue;
    }

    const match = versionCheck.stdout.match(/\((\d+),\s*(\d+)\)/);
    if (!match) {
      continue;
    }

    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major < 3 || (major === 3 && minor < 10)) {
      continue;
    }

    return candidate;
  }

  return null;
}

function checkDependencies(python) {
  return runPython(
    python.command,
    python.args,
    'import fastapi, uvicorn',
  );
}

function pipCommand(python) {
  if (python.command === 'py') {
    return 'py -3 -m pip install -r backend/requirements.txt';
  }
  return `${python.command} -m pip install -r backend/requirements.txt`;
}

module.exports = {
  PYTHON_CANDIDATES,
  findPython,
  checkDependencies,
  pipCommand,
};
