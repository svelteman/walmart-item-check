#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
} else if (command === 'stop') {
  const pid = getPid();
  if (!pid) {
    console.log('Server is not running');
    process.exit(0);
  }

  try {
    process.kill(pid);
    removePid();
    console.log(`Server stopped (was PID: ${pid})`);
  } catch (err) {
    console.error(`Error stopping server: ${err.message}`);
    removePid();
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
  console.log('Commands: start, stop, status, restart');
  process.exit(1);
}

