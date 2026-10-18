import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isOwnModel } from '../src/modelOwnership.js';

const source = name => fs.readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');

function harness(completed = true) {
  const state = { launches: 0, availabilityChecks: 0, likes: 0, makeNow: 0 };
  const config = { crealityProfile: { userId: 'owner' } };
  const context = vm.createContext({ Date, console, isOwnModel,
    readRuns: async () => [{ taskId: 'modelBoosts', status: 'success', finishedAt: new Date().toISOString(), details: { boostConsumed: true } }],
    readDesigns: async () => [{ id: 'design', url: 'https://example.com/model', favoriteActive: true }],
    dailyProgress: () => ({ counters: { modelBoosts: +completed, modelLikes: 1, makeNow: 1 }, remaining: { modelBoosts: completed ? 0 : 1, modelLikes: 0, makeNow: 0 } }),
    withAutomationBrowser: async (_options, callback) => {
      state.launches++;
      return callback({ pages: () => [{ goto: async () => {}, waitForTimeout: async () => {} }] });
    },
    observeCrealityPage: () => ({ stop() {} }),
    runModelAction: async () => { state.likes++; return { success: true }; },
    runMakeNow: async () => { state.makeNow++; return { success: true }; },
    fixtureAvailability: async () => { state.availabilityChecks++; return { ticketsAvailable: 0 }; }
  });
  vm.runInContext(source('modelBoostTask'), context);
  vm.runInContext(source('scheduler'), context);
  // Replace external Creality calls only; exercise the real daily guards and dispatch.
  vm.runInContext(`
    resolveBoostTarget = async () => ({ permission: { ok: true, body: { code: 0 } }, authenticationHeaders: {} });
    readBoostAvailability = fixtureAvailability;
  `, context);
  return { state, run: (task, source) => context.executePendingTask(task, { timezone: 'Europe/Madrid' }, { source }, config) };
}

test('boost manual repetido atraviesa el objetivo completado y comprueba los boletos', async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) {
    const result = await h.run('modelBoosts', 'manual');
    assert.equal(result.skipped, true);
    assert.equal(result.details.ticketsAvailable, 0);
    assert.match(result.message, /No hay boletos/);
  }
  assert.equal(h.state.launches, 2);
  assert.equal(h.state.availabilityChecks, 2);
});

test('boost programado completado no abre navegador, incluso si el progreso aún no se sincronizó', async () => {
  for (const completed of [true, false]) {
    const h = harness(completed);
    const result = await h.run('modelBoosts', 'schedule');
    assert.equal(result.skipped, true);
    assert.equal(h.state.launches, 0);
  }
});

test('la excepción manual conserva MakeNow y no permite repetir otras tareas completas', async () => {
  const h = harness();
  assert.equal((await h.run('modelLikes', 'manual')).skipped, true);
  assert.equal(h.state.likes, 0);
  await h.run('makeNow', 'manual');
  assert.equal(h.state.makeNow, 1);
});
