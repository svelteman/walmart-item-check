#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { execSync } = require('child_process');

const PID_FILE = path.join(__dirname, '..', '.server.pid');
const LOG_FILE = path.join(__dirname, '..', '.server.log');

function getPid() {
  try {
    return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
  } catch {
    return null;
  }
}

function savePid(pid) {
  fs.writeFileSync(PID_FILE, pid.toString());
}

function removePid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getServerPort() {
  const port = Number(process.env.PORT) || 7429;
  return Number.isFinite(port) && port > 0 ? port : 7429;
}

function getListeningPidsByPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
      return [...new Set(
        output
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && /\bLISTENING\b/i.test(line))
          .map(line => line.split(/\s+/).pop())
          .map(value => Number(value))
          .filter(Number.isInteger)
      )];
    }

    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' });
    return [...new Set(
      output
        .split('\n')
        .map(value => Number(value.trim()))
        .filter(Number.isInteger)
    )];
  } catch {
    return [];
  }
}

function stopByPort(port, skipPids = new Set()) {
  const listeningPids = getListeningPidsByPort(port)
    .filter(pid => !skipPids.has(pid))
    .filter(pid => pid !== process.pid);

  let stoppedCount = 0;
  const errors = [];
  for (const pid of listeningPids) {
    try {
      process.kill(pid);
      stoppedCount += 1;
      console.log(`Stopped process on port ${port} (PID: ${pid})`);
    } catch (err) {
      errors.push(`Unable to stop PID ${pid} on port ${port}: ${err.message}`);
    }
  }

  return { stoppedCount, errors };
}

const command = process.argv[2];

if (command === 'start') {
  const existingPid = getPid();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Server is already running (PID: ${existingPid})`);
    process.exit(0);
  }

  removePid();
  
  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true
  });

  savePid(server.pid);
  console.log(`Server started (PID: ${server.pid})`);
  server.unref();
} else if (command === 'stop' || command === 'stop-dev') {
  const pid = getPid();
  const skipPids = new Set();
  let stoppedAny = false;
  let hadErrors = false;

  if (command === 'stop' && pid) {
    try {
      process.kill(pid);
      skipPids.add(pid);
      removePid();
      stoppedAny = true;
      console.log(`Server stopped (was PID: ${pid})`);
    } catch (err) {
      hadErrors = true;
      console.error(`Error stopping server: ${err.message}`);
      removePid();
    }
  } else if (command === 'stop') {
    removePid();
  }

  const { stoppedCount, errors } = stopByPort(getServerPort(), skipPids);
  if (stoppedCount > 0) stoppedAny = true;
  if (errors.length) {
    hadErrors = true;
    for (const message of errors) console.error(message);
  }

  if (!stoppedAny) {
    console.log('Server is not running');
  }

  if (hadErrors) {
    process.exit(1);
  }
} else if (command === 'status') {
  const pid = getPid();
  if (!pid) {
    console.log('Server is not running');
    process.exit(1);
  }

  if (isProcessRunning(pid)) {
    console.log(`Server is running (PID: ${pid})`);
    process.exit(0);
  } else {
    console.log(`Server is not running (stale PID: ${pid})`);
    removePid();
    process.exit(1);
  }
} else if (command === 'restart') {
  const existingPid = getPid();
  if (existingPid && isProcessRunning(existingPid)) {
    try {
      process.kill(existingPid);
    } catch {}
  }
  removePid();

  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true
  });

  savePid(server.pid);
  console.log(`Server restarted (PID: ${server.pid})`);
  server.unref();
} else {
  console.log('Usage: npm run [command]');
  console.log('Commands: start, stop, stop-dev, status, restart');
  process.exit(1);
}
