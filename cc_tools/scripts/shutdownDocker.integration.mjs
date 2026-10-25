// Only disposable CI containers; never use a Home Assistant installation here.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'linux') {
  throw new Error('This check requires an isolated Linux GitHub Actions runner.');
}
const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-stop-docker-'));
const name = `cc-tools-stop-${process.pid}`;
let created = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = args => exec('docker', args, { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
async function waitFor(check, message) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await sleep(500);
  }
  throw new Error(`${message}\n${(await docker(['logs', name])).stdout}`);
}
try {
  await fs.writeFile(path.join(root, 'options.json'), JSON.stringify({ timezone: 'UTC', migration_source: 'No migrar', migration_confirm: false }));
  await fs.writeFile(path.join(root, 'config.json'), JSON.stringify({ setup: { assistantCompleted: false } }));
  await docker(['run', '-d', '--name', name, '--network', 'none',
    '--mount', `type=bind,source=${root},target=/data`, 'cc-tools-ci:amd64']);
  created = true;
  await waitFor(async () => (await docker(['logs', name])).stdout.includes('escuchando'), 'App did not start');
  const command = (await docker(['exec', name, 'cat', '/proc/1/cmdline'])).stdout.split('\0');
  assert.equal(path.basename(command[0]), 'node', 'Node must be the main process, without npm');
  assert.equal(command[1], '/app/src/server.js');
  // Keep the real browser proxy connected while stopping the app.
  await docker(['exec', '-d', name, 'node', '--input-type=module', '-e', `
    import fs from 'node:fs';
    await fetch('http://127.0.0.1:8080/novnc/');
    const socket = new WebSocket('ws://127.0.0.1:8080/novnc/websockify', ['binary']);
    socket.addEventListener('open', () => fs.writeFileSync('/tmp/cc-stop-ws-ready', 'ready'));
    socket.addEventListener('error', () => process.exit(1));
  `]);
  await waitFor(async () => {
    try { await docker(['exec', name, 'test', '-f', '/tmp/cc-stop-ws-ready']); return true; }
    catch { return false; }
  }, 'noVNC WebSocket did not connect');
  await docker(['stop', '--time', '10', name]);
  const state = JSON.parse((await docker(['inspect', '--format', '{{json .State}}', name])).stdout);
  const logs = (await docker(['logs', name])).stdout;
  assert.equal(state.ExitCode, 0, logs);
  assert.equal(state.OOMKilled, false);
  assert.match(logs, /Cierre completado\. Código de salida 0\./);
  JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
  console.log('PASS: production image, Node PID 1, open noVNC WebSocket, Docker SIGTERM and exit code 0.');
} finally {
  if (created) await docker(['rm', '-f', name]);
  await fs.rm(root, { recursive: true, force: true });
}
