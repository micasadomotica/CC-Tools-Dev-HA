import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withCookieDiagnostics, recordCookieDiagnostics } from '../src/cookieDiagnostics.js';

test('guarda el diagnóstico saneado en Datos técnicos sin contaminar otras ejecuciones', async t => {
  t.mock.method(console, 'log', () => {});
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-cookie-logs-'));
  const previousDirectory = process.env.CCTOOLS_DATA_DIR;
  process.env.CCTOOLS_DATA_DIR = directory;
  const { appendRun, readRuns } = await import(`../src/storage.js?cookie-test=${Date.now()}`);
  t.after(async () => {
    if (previousDirectory === undefined) delete process.env.CCTOOLS_DATA_DIR;
    else process.env.CCTOOLS_DATA_DIR = previousDirectory;
    await fs.rm(directory, { recursive: true, force: true });
  });
  const sentinel = 'PRIVATE_COOKIE_SENTINEL';
  await withCookieDiagnostics('comments', async () => {
    await recordCookieDiagnostics({ cookies: async () => [{ name: 'cf_clearance',
      domain: '.crealitycloud.com', expires: 1900000000, value: sentinel }] }, 'challenge_after');
    await appendRun({ taskId: 'comments', status: 'success', details: { kept: true } });
  });
  await appendRun({ taskId: 'modelDownloads', status: 'failed', details: { kept: true } });
  const runs = await readRuns();
  assert.equal(runs[1].details.kept, true);
  assert.equal(runs[1].details.cookieDiagnostics.taskId, 'comments');
  assert.equal(runs[1].details.cookieDiagnostics.events[0].clearancePresent, true);
  assert.equal('cookieDiagnostics' in runs[0].details, false);
  assert.equal((await fs.readFile(path.join(directory, 'runs.json'), 'utf8')).includes(sentinel), false);
});
