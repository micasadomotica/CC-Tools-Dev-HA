import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { homeAssistantModels, homeAssistantModelsRoutes } from '../src/homeAssistantModels.js';
import { createUploadLibrary } from '../src/uploadDesignLibrary.js';
import { addModel } from './uploadDesignFixtures.js';

const config = () => ({ timezone: 'Europe/Madrid', crealityProfile: { userId: 'account' }, tasks: {
  uploadDesigns: { enabled: true, accountId: 'account', dailyLimit: 1, windowStart: '08:00', windowEnd: '12:00',
    cleanupEnabled: true, nextRunAt: '2026-10-25T09:00:00Z', lastRunAt: '2026-10-25T07:30:00Z', lastStatus: 'failed' },
} });

test('ledger summary survives cleanup, separates accounts, failures and rewards, and uses local day', () => {
  const state = { defaultCategory: { category: 'Impresoras 3D', subcategory: 'Otro' }, schedule: {}, inventory: [
    { modelHash: 'available', valid: true }, { modelHash: 'submitted', valid: true },
    { modelHash: 'uncertain', valid: true }, { modelHash: 'invalid', valid: false },
  ], ledger: { account: {
    cleaned: { name: 'Modelo limpiado', id: '42', url: 'https://www.crealitycloud.com/model/42', status: 'submitted',
      submittedAt: '2026-10-24T23:30:00Z', cleanedAt: '2026-10-25T05:00:00Z' },
    submitted: { status: 'submitted', submittedAt: '2026-10-24T21:30:00Z' },
    uncertain: { status: 'uncertain', updatedAt: '2026-10-25T06:00:00Z' },
    failed: { status: 'failed', updatedAt: '2026-10-25T07:00:00Z' },
  }, other: { another: { status: 'submitted', submittedAt: '2026-10-25T07:45:00Z' } } } };
  const result = homeAssistantModels(config(), state, new Date('2026-10-25T08:00:00Z'));
  assert.equal(result.models.uploadsToday, 1);
  assert.equal(result.models.lastModel.name, 'Modelo limpiado');
  assert.equal(result.models.lastUploadAt, '2026-10-24T23:30:00Z');
  assert.equal(result.models.availableCount, 1);
  assert.equal(result.models.nextUploadAt, '2026-10-25T09:00:00Z');
  assert.ok(!JSON.stringify(result).includes('ledger'));
  const paused = config(); paused.tasks.uploadDesigns.enabled = false;
  assert.equal(homeAssistantModels(paused, state).models.nextUploadAt, '');
  state.libraryError = 'Media unavailable';
  assert.equal(homeAssistantModels(paused, state).models.availableCount, null);
  const empty = homeAssistantModels(config(), { ...state, ledger: {} }).models;
  assert.equal(empty.lastModel, null); assert.equal(empty.lastUploadAt, ''); assert.equal(empty.uploadsToday, 0);
});

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-models-api-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'models'); await fs.mkdir(root);
  const library = createUploadLibrary({ root, dataDir: path.join(base, 'data') });
  const folder = await addModel(root, 'modelo');
  const item = (await library.scan()).inventory[0];
  await library.saveSchedule({ enabled: true, dailyLimit: 1, windowStart: '08:00', windowEnd: '12:00',
    selected: [item], cleanupEnabled: true });
  const savedConfig = config(); let writes = 0;
  const app = express(); app.use(express.json());
  app.use('/api/integration/models', homeAssistantModelsRoutes(library, {
    readConfig: async () => structuredClone(savedConfig),
    writeConfig: async value => { writes++; Object.assign(savedConfig, value); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/integration/models`;
  const toggle = enabled => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
  return { library, folder, item, config: savedConfig, toggle, url, writes: () => writes };
}

test('HTTP control resumes after cleanup without replacing selection or enabling another account', async t => {
  const f = await fixture(t);
  await f.library.record('account', f.item, { status: 'submitted', source: 'schedule', id: '42',
    submittedAt: '2026-10-24T12:00:00Z', submittedDay: '2026-10-24' });
  const before = (await f.library.status()).schedule;
  // Simulate an already cleaned local model; the delivery record must remain usable.
  await fs.rm(f.folder, { recursive: true });
  assert.equal((await f.toggle(false)).status, 200);
  assert.equal((await f.toggle(true)).status, 200);
  const after = (await f.library.status()).schedule;
  assert.deepEqual(after, before);
  assert.equal(f.config.tasks.uploadDesigns.cleanupEnabled, true);
  assert.equal(f.config.tasks.uploadDesigns.dailyLimit, 1);
  assert.ok(f.config.tasks.uploadDesigns.nextRunAt);
  const planned = f.config.tasks.uploadDesigns.nextRunAt;
  assert.equal((await f.toggle(true)).status, 200);
  assert.equal(f.config.tasks.uploadDesigns.nextRunAt, planned);
  const status = await (await fetch(f.url)).json();
  assert.equal(status.models.lastModel.id, '42');
  assert.equal(status.models.availableCount, 0);
  f.config.crealityProfile.userId = 'different';
  const writes = f.writes();
  assert.equal((await f.toggle(true)).status, 400);
  assert.equal(f.writes(), writes);
  assert.equal((await f.toggle(false)).status, 200);
  assert.equal((await f.toggle('yes')).status, 400);
});

test('missing initial files prevent enabling, but never prevent disabling', async t => {
  const f = await fixture(t);
  await fs.rm(f.folder, { recursive: true });
  assert.equal((await f.toggle(false)).status, 200);
  assert.equal((await f.toggle(true)).status, 409);
  assert.equal(f.config.tasks.uploadDesigns.enabled, false);
  assert.equal((await f.library.status()).schedule.enabled, false);
});

test('never-configured library cannot be activated', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-models-empty-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const library = createUploadLibrary({ root: path.join(base, 'media'), dataDir: path.join(base, 'data') });
  await assert.rejects(library.setScheduleEnabled(true, 'account'), /Configura/);
  assert.equal((await library.setScheduleEnabled(false, 'account')).schedule.enabled, false);
});
