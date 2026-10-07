import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeCaughtError } from '../src/crealityDiagnostics.js';

// Run the actual scheduling/notification functions with storage and Telegram mocked.
test('MakeNow notifica una sola caída y recuperación con la identidad Dev', async () => {
  const config = { telegram: { enabled: true }, tasks: { makeNow: { timezone: 'Europe/Madrid' } }, automationHealth: {} };
  const messages = [];
  const context = vm.createContext({ Date, process, normalizeCaughtError, console: { warn() {}, error() {} },
    readConfig: async () => config, writeConfig: async () => {},
    sendTelegram: async (_config, text) => { messages.push(text); } });
  const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  const failure = { code: 'CREALITY_SERVICE_UNAVAILABLE', message: 'Creality Cloud no disponible.' };
  const before = Date.now();
  await context.deferScheduledServiceFailure('makeNow', failure);
  assert.equal(messages.length, 0);
  assert.ok(Date.parse(config.tasks.makeNow.nextRunAt) >= before + 10 * 60000);
  await context.deferScheduledServiceFailure('makeNow', failure);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^⚠️ CC Tools Dev:/);
  await context.deferScheduledServiceFailure('makeNow', failure);
  assert.equal(messages.length, 1);
  await context.deferScheduledServiceFailure('makeNow', failure);
  assert.ok(Date.parse(config.tasks.makeNow.nextRunAt) >= before + 60 * 60000);
  assert.equal(messages.length, 1);
  config.automationHealth.pausedUntil = new Date(Date.now() - 1).toISOString();
  assert.equal(await context.holdForAutomationHealth(config), false);
  assert.equal(config.automationHealth.serviceUnavailableNotified, true);
  const result = { success: true, message: 'MakeNow: recompensa diaria confirmada.', details: { incident: null } };
  assert.equal(context.transientCrealityServiceFailure(result.details.incident), null);
  const recovery = context.updateAutomationHealth(config, 'makeNow', 'success', result);
  await context.notifyTaskResult(config, 'makeNow', 'success', result, recovery);
  assert.equal(messages.length, 3);
  assert.match(messages[1], /^✅ CC Tools Dev: Creality Cloud vuelve/);
  assert.match(messages[2], /^🎨 CC Tools Dev: MakeNow/);
  assert.equal(config.automationHealth.serviceFailureCount, 0);
  const next = context.updateAutomationHealth(config, 'makeNow', 'success', result);
  await context.notifyTaskResult(config, 'makeNow', 'success', result, next);
  assert.equal(messages.filter(text => text.startsWith('✅')).length, 1);
});
