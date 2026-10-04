import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('una configuración 1.0.18 recibe MakeNow desactivado y conserva sus ajustes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cctools-makenow-migration-'));
  const previous = process.env.CCTOOLS_DATA_DIR;
  let storage;
  try {
    process.env.CCTOOLS_DATA_DIR = directory;
    storage = await import(`../src/storage.js?makenow-migration=${Date.now()}`);
  } finally {
    if (previous === undefined) delete process.env.CCTOOLS_DATA_DIR;
    else process.env.CCTOOLS_DATA_DIR = previous;
  }
  try {
    await fs.writeFile(path.join(directory, 'config.json'), JSON.stringify({
      timezone: 'Europe/Madrid',
      tasks: { creality: { enabled: true, windowStart: '09:17', windowEnd: '10:43' } },
      telegram: { enabled: false, notifyOnSuccess: false }
    }));
    const config = await storage.readConfig();
    assert.equal(config.tasks.makeNow.enabled, false);
    assert.equal(config.tasks.makeNow.dailyLimit, 1);
    assert.equal(config.tasks.creality.enabled, true);
    assert.equal(config.tasks.creality.windowStart, '09:17');
    assert.equal(config.telegram.notifyOnSuccess, false);
    config.tasks.makeNow.lastAttemptAt = '2026-10-04T10:00:00Z';
    await storage.writeConfig(config);
    assert.equal((await storage.readConfig()).tasks.makeNow.lastAttemptAt, config.tasks.makeNow.lastAttemptAt);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
