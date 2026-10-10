import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// A separate, empty data directory and a frozen clock keep every print in the future.
// No browser, Cloud account, printer or notification service is used.
test('the real server saves and exposes one remaining print for a daily target of three with account progress 2/10', { timeout: 30000 }, async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cctools-print-api-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  const bootstrap = `
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-09T19:45:00Z'])); }
      static now() { return new RealDate('2026-10-09T19:45:00Z').getTime(); }
    };
    const { readConfig, writeConfig, appendRun } = await import('./src/storage.js');
    const config = await readConfig();
    config.setup.assistantCompleted = false;
    config.dailyProgress = { tasks: { finishPrint: { found: true, done: 2, valid: 10,
      checkedAt: new Date().toISOString() } } };
    for (const task of Object.values(config.tasks)) task.enabled = false;
    await writeConfig(config);
    for (let index = 0; index < 2; index++) await appendRun({ taskId: 'finishPrint', source: 'manual',
      status: 'success', finishedAt: '2026-10-09T19:00:00Z', details: { printId: 'manual-' + index,
      manualSelection: true, printerName: 'HAb - Ender-3' } });
    await import('./src/server.js');
  `;
  let server, logs = '';
  try {
    server = spawn(process.execPath, ['--input-type=module', '--eval', bootstrap], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true,
      env: { ...process.env, TZ: 'Europe/Madrid', CCTOOLS_HOST: '127.0.0.1',
        CCTOOLS_PORT: String(port), CCTOOLS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', data => { logs += data; });
    server.stderr.on('data', data => { logs += data; });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      ready = await fetch(baseUrl + '/api/status').then(r => r.ok).catch(() => false);
      if (ready || server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const response = await fetch(baseUrl + '/api/config', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finishPrint: {
        enabled: true, printerProfiles: [{ id: 'hab', printerName: 'HAb - Ender-3', printerDeviceName: 'test-device',
          printerInterName: 'Ender-3', printerDeviceType: 5, windowStart: '22:00', windowEnd: '23:59',
          dailyLimit: 3, minIntervalMinutes: 10, printMode: 'random', cloudFiles: ['CCTools_Dev_v2.gcode'],
          cloudFileRecords: [{ id: 'test-gcode', name: 'CCTools_Dev_v2.gcode', printTime: 0 }] }]
      } }) });
    const saved = await response.json();
    assert.equal(response.status, 200, JSON.stringify(saved));
    assert.equal(saved.config.tasks.finishPrint.printPlan.length, 1);
    assert.ok(saved.nextExecutions.finishPrint);
    const status = await fetch(baseUrl + '/api/status').then(r => r.json());
    assert.equal(status.dailyCounters.finishPrint, 2);
    assert.equal(status.dailyLimits.finishPrint, 10);
    assert.equal(status.config.tasks.finishPrint.printPlan.length, 1);
    assert.equal(status.nextExecutions.finishPrint, saved.nextExecutions.finishPrint);
    const preview = await fetch(baseUrl + '/api/schedule/preview').then(r => r.json());
    const pending = preview.items.filter(item => item.taskId === 'finishPrint' && item.status === 'pending');
    assert.equal(pending.length, 1, JSON.stringify(preview));
    assert.equal(pending[0].runAt, status.nextExecutions.finishPrint);
    for (const slot of pending) assert.ok(slot.runAt >= '2026-10-09T20:00:00.000Z' && slot.runAt < '2026-10-09T21:59:00.000Z');
    const disk = JSON.parse(await fs.readFile(path.join(dataDir, 'config.json'), 'utf8'));
    assert.equal(disk.tasks.finishPrint.printerProfiles[0].printPlan.length, 1);
    // Reaching the target empties today's plan; increasing it must regenerate it.
    for (const [target, expected] of [[2, 0], [4, 2], [3, 1]]) {
      const profile = { ...disk.tasks.finishPrint.printerProfiles[0], dailyLimit: target };
      const changed = await fetch(baseUrl + '/api/config', { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finishPrint: {
          enabled: true, printerProfiles: [profile]
        } }) }).then(r => r.json());
      assert.equal(changed.config.tasks.finishPrint.totalDailyLimit, target);
      assert.equal(changed.config.tasks.finishPrint.printPlan.length, expected);
      assert.equal(Boolean(changed.nextExecutions.finishPrint), expected > 0);
      const agenda = await fetch(baseUrl + '/api/schedule/preview').then(r => r.json());
      assert.equal(agenda.items.filter(item => item.taskId === 'finishPrint' && item.status === 'pending').length, expected);
    }

  } finally {
    if (server && server.exitCode === null) {
      const closed = once(server, 'exit'); server.kill(); await closed;
    }
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
