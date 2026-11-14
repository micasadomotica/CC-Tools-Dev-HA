import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { updateAutomationHealth } from '../src/scheduler.js';
import { pauseForExpiredSession } from '../src/sessionHealth.js';

const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');

function harness({ mode = 'idle', challenge = false, verify = async () => ({ authenticated: false }) } = {}) {
  let stored = { automationHealth: { state: 'paused', reasonCode: 'SECURITY_CHALLENGE_CLOUDFLARE',
    pausedAt: '2026-11-14T20:00:00.000Z', lastIncidentAt: '2026-11-14T20:00:00.000Z', pauseTaskId: 'modelDownloads',
    pausedUntil: '2026-11-14T20:30:00.000Z', nextChallengeCheckAt: '' } };
  const calls = { checks: 0, writes: 0 };
  const sandbox = vm.createContext({ Date, console, pauseForExpiredSession,
    browserManagerState: () => ({ mode }), browserChallengeState: () => ({ active: challenge }),
    verifyPersistedSession: async () => { calls.checks++; return verify(); },
    readConfig: async () => structuredClone(stored),
    writeConfig: async config => { stored = structuredClone(config); calls.writes++; } });
  vm.runInContext(source, sandbox);
  return { calls, get: () => structuredClone(stored), set: value => { stored = value; },
    run: () => sandbox.holdForAutomationHealth(structuredClone(stored)) };
}

for (const code of ['SECURITY_CHALLENGE', 'SECURITY_CHALLENGE_TIMEOUT', 'SECURITY_CHALLENGE_CLOUDFLARE', 'SECURITY_CHALLENGE_DATADOME', 'CAPTCHA_REQUIRED']) {
  test(`${code}: programa la primera revisión cinco minutos después`, () => {
    const config = { automationHealth: {} }, before = Date.now();
    updateAutomationHealth(config, 'modelDownloads', 'error', { details: { incident: { code, systemic: true, message: 'Verificación' } } });
    assert.ok(Date.parse(config.automationHealth.nextChallengeCheckAt) >= before + 300000);
    assert.ok(Date.parse(config.automationHealth.nextChallengeCheckAt) <= Date.now() + 300000);
  });
}

test('una respuesta inconclusa mantiene la pausa y espera cinco minutos entre revisiones', async () => {
  const h = harness();
  assert.equal(await h.run(), true);
  const stored = h.get();
  assert.equal(stored.automationHealth.state, 'paused');
  assert.equal(Date.parse(stored.automationHealth.nextChallengeCheckAt) - Date.parse(stored.automationHealth.lastChallengeCheckAt), 300000);
  assert.equal(await h.run(), true);
  assert.equal(h.calls.checks, 1);
  stored.automationHealth.nextChallengeCheckAt = new Date(Date.now() - 1).toISOString(); h.set(stored);
  await h.run(); assert.equal(h.calls.checks, 2);
});

test('solo un perfil confirmado reanuda las automatizaciones', async () => {
  const h = harness({ verify: async () => ({ authenticated: true }) });
  assert.equal(await h.run(), false);
  assert.equal(h.get().automationHealth.state, 'active');
  assert.equal(h.get().automationHealth.nextChallengeCheckAt, '');
  assert.equal(h.get().crealitySession.authenticated, true);
});

for (const [mode, challenge] of [['interactive', false], ['automation', false], ['idle', true]]) {
  test(`no interviene con navegador ${mode} y espera activa ${challenge}`, async () => {
    const h = harness({ mode, challenge });
    assert.equal(await h.run(), true);
    assert.deepEqual(h.calls, { checks: 0, writes: 0 });
  });
}

for (const code of ['SECURITY_CHALLENGE', 'SECURITY_CHALLENGE_CANCELLED', 'SECURITY_CHALLENGE_TIMEOUT', 'SESSION_CHECK_UNAVAILABLE']) {
  test(`conserva la pausa ante ${code} sin lanzar otra revisión inmediata`, async () => {
    const h = harness({ verify: async () => { throw Object.assign(new Error('test'), { code }); } });
    assert.equal(await h.run(), true); assert.equal(await h.run(), true);
    assert.equal(h.calls.checks, 1);
    assert.equal(h.get().automationHealth.reasonCode, 'SECURITY_CHALLENGE_CLOUDFLARE');
  });
}

test('una sesión caducada cambia a pausa por login, sin reintentos de Cloudflare', async () => {
  const h = harness({ verify: async () => { throw Object.assign(new Error('Sesión cerrada'), { code: 'LOGIN_REQUIRED' }); } });
  assert.equal(await h.run(), true);
  assert.equal(h.get().automationHealth.reasonCode, 'LOGIN_REQUIRED');
  assert.equal(h.get().automationHealth.nextChallengeCheckAt, '');
  assert.equal(h.get().crealitySession.authenticated, false);
});

test('dos ticks concurrentes hacen una sola comprobación', async () => {
  let finish;
  const h = harness({ verify: () => new Promise(resolve => { finish = resolve; }) });
  const first = h.run();
  assert.equal(await h.run(), true);
  assert.equal(h.calls.checks, 1);
  finish({ authenticated: true }); assert.equal(await first, false);
});

for (const change of ['pause', 'resume', 'migration']) {
  test(`no sobrescribe un cambio ${change} ocurrido durante la comprobación`, async () => {
    const h = harness({ verify: async () => {
      const current = h.get();
      if (change === 'pause') current.automationHealth.reasonCode = 'RATE_LIMITED';
      if (change === 'resume') current.automationHealth.state = 'active';
      if (change === 'migration') current.migrationReview = { required: true };
      h.set(current); return { authenticated: true };
    } });
    assert.equal(await h.run(), true);
    assert.equal(h.calls.writes, 0);
  });
}
