const killPort = require('kill-port');

const PORTS = [8000, 5173, 5174];

async function freePorts() {
  for (const port of PORTS) {
    try {
      await killPort(port);
      console.log(`Freed port ${port}`);
    } catch {
      // Port was not in use.
    }
  }
}

freePorts();
