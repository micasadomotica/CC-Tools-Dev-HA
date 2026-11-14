import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { automaticLoginDue, markAutomaticLoginAttempt, resumeAfterAuthenticatedLogin } from '../src/sessionHealth.js';
import { automaticLoginFailureMessage, sessionClosedNotification } from '../src/sessionRecovery.js';

function harness(login) {
  let calls = 0;
  const config = { automationHealth: { state: 'paused', reasonCode: 'LOGIN_REQUIRED', pausedAt: '2026-11-14T17:01:00Z' },
    crealitySession: { autoLoginEnabled: true, autoLoginLastAttemptAt: '2026-11-14T17:00:00Z' }, crealityProfile: { userId: 'expected' } };
  const context = vm.createContext({ Date, console, automaticLoginDue, markAutomaticLoginAttempt, resumeAfterAuthenticatedLogin,
    writeConfig: async () => {}, attemptRememberedSessionLogin: async options => {
      calls++;
      assert.equal(options.expectedUserId, 'expected');
      return login();
    } });
  const source = fs.readFileSync(new URL('../src/sessionRecovery.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { config, recover: options => context.attemptAutomaticSessionRecovery(config, options), calls: () => calls };
}

test('cada nueva caducidad se recupera inmediatamente y solo tras confirmar la cuenta', async () => {
  const h = harness(() => ({ authenticated: true, checkedAt: '2026-11-14T17:02:00Z' }));
  const result = await h.recover({ now: new Date('2026-11-14T17:02:00Z') });
  assert.equal(result.recovered, true);
  assert.equal(h.calls(), 1);
  assert.equal(h.config.automationHealth.state, 'active');
});

test('una comprobación inconclusa conserva la pausa y comunica el motivo real', async () => {
  const h = harness(() => ({ authenticated: false, reason: 'SESSION_CHECK_INCONCLUSIVE' }));
  const result = await h.recover({ force: true });
  assert.equal(result.recovered, false);
  assert.equal(h.config.automationHealth.state, 'paused');
  assert.match(h.config.crealitySession.autoLoginLastMessage, /confirmar la sesión/);
  assert.match(sessionClosedNotification(result), /volverá a intentar/);
  assert.match(automaticLoginFailureMessage({ reason: 'BROWSER_BUSY' }), /ocupado/);
});

test('no lanza recuperaciones simultáneas ni ignora la preferencia desactivada', async () => {
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  const a = h.recover({ force: true });
  const b = h.recover({ force: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls(), 1);
  release({ authenticated: false, reason: 'MANUAL_LOGIN_REQUIRED', message: 'Cuenta caducada' });
  await Promise.all([a, b]);
  h.config.crealitySession.autoLoginEnabled = false;
  assert.equal((await h.recover({ force: true })).reason, 'AUTO_LOGIN_DISABLED');
  assert.equal(h.calls(), 1);
});
