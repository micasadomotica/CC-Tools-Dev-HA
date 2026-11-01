import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sessionCheckOutcome } from '../src/browserManager.js';

function harness({ mode = '', authenticated = false } = {}) {
  const calls = { confirmed: 0, closed: 0, launched: 0 };
  const page = { url: () => 'https://www.crealitycloud.com/es/workbench-beta/?type=1', goto: async () => {} };
  const fixtureContext = { pages: () => [page], browser: () => null, once() {}, close: async () => { calls.closed++; } };
  const context = vm.createContext({ process, URL, calls, fixtureContext, initialMode: mode,
    launchFixture: async () => { calls.launched++; return fixtureContext; },
    checkFixture: async () => sessionCheckOutcome(authenticated ? 'authenticated' : 'unknown'),
    confirmAuthenticatedSession: async () => { calls.confirmed++; return { authenticated: true }; }
  });
  const source = fs.readFileSync(new URL('../src/browserManager.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  vm.runInContext(`launchWithRecovery = launchFixture; assertAuthenticatedSession = checkFixture;
    activeMode = initialMode; activeContext = initialMode ? fixtureContext : null;`, context);
  return { context, calls };
}

for (const mode of ['', 'interactive']) {
  for (const authenticated of [false, true]) {
    test(`verificación persistente ${mode || 'sin navegador'}: perfil ${authenticated ? 'confirmado' : 'inconcluso'}`, async () => {
      const h = harness({ mode, authenticated });
      const result = await h.context.verifyPersistedSession();
      assert.equal(result.authenticated, authenticated);
      assert.equal(result.checked, authenticated);
      assert.equal(h.calls.confirmed, authenticated ? 1 : 0);
      if (!authenticated) assert.equal(result.reason, 'SESSION_CHECK_INCONCLUSIVE');
      assert.equal(h.calls.closed, mode ? 0 : 1);
    });
  }
}

for (const authenticated of [false, true]) {
  test(`recuperación recordada solo confirma con perfil positivo: ${authenticated}`, async () => {
    const h = harness({ authenticated });
    const result = await h.context.attemptRememberedSessionLogin();
    assert.equal(result.authenticated, authenticated);
    assert.equal(h.calls.confirmed, authenticated ? 1 : 0);
    assert.equal(h.calls.closed, 1);
  });
}

test('la tarea puede continuar con un perfil inconcluso sin confirmar la recuperación', async () => {
  const h = harness();
  let ran = 0;
  await h.context.withAutomationBrowser({}, async (_context, check) => {
    ran++;
    assert.equal(check.confirmAuthenticated, false);
  });
  assert.equal(ran, 1);
  assert.equal(h.calls.confirmed, 0);
  assert.equal(h.calls.closed, 1);
});

test('una automatización no cierra el navegador remoto ni ejecuta la tarea', async () => {
  const h = harness({ mode: 'interactive' });
  let ran = 0;
  await assert.rejects(h.context.withAutomationBrowser({}, async () => { ran++; }), { code: 'REMOTE_BROWSER_OPEN' });
  assert.equal(ran, 0);
  assert.deepEqual(h.calls, { confirmed: 0, closed: 0, launched: 0 });
  assert.equal(h.context.browserManagerState().mode, 'interactive');
});
