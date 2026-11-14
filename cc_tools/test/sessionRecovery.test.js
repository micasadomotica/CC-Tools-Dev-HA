import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sessionCheckOutcome } from '../src/browserManager.js';

function harness({ mode = '', authenticated = false, userId = '', accounts, expired = false } = {}) {
  const calls = { confirmed: 0, closed: 0, launched: 0 };
  const appUrl = 'https://www.crealitycloud.com/es/workbench-beta/?type=1';
  let currentUrl = appUrl;
  let stored = accounts === undefined ? undefined : JSON.stringify(accounts);
  const page = {
    url: () => currentUrl,
    async goto(url) {
      if (stored === undefined) return;
      if (url === appUrl) {
        currentUrl = 'https://id.creality.com/connect?client_id=cloud&redirect_uri=https%3A%2F%2Fwww.crealitycloud.com%2Foauth';
      } else {
        calls.oauthUrl = url;
        currentUrl = expired ? url : appUrl;
      }
    },
    async evaluate(_callback, value) {
      if (value === undefined) return stored;
      stored = value;
      calls.accounts = JSON.parse(value);
    },
    async waitForURL() {}
  };
  let pages = [page];
  page.close = async () => { pages = pages.filter(p => p !== page); };
  const fixtureContext = { pages: () => [...pages], browser: () => null, once() {},
    newPage: async () => {
      const fresh = { ...page, close: async () => { pages = pages.filter(p => p !== fresh); } };
      pages.push(fresh);
      return fresh;
    }, close: async () => { calls.closed++; } };
  const context = vm.createContext({ process, URL, calls, fixtureContext, initialMode: mode,
    installChallengeHandling: () => {}, browserChallengeState: () => ({ active: false }),
    inspectCrealityPage: async () => null,
    normalizeCaughtError: error => error,
    launchFixture: async () => { calls.launched++; return fixtureContext; },
    checkFixture: async () => ({ ...sessionCheckOutcome(authenticated ? 'authenticated' : 'unknown'), userId }),
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
      assert.equal(h.calls.closed, 0);
    });
  }
}

for (const authenticated of [false, true]) {
  test(`recuperación recordada solo confirma con perfil positivo: ${authenticated}`, async () => {
    const h = harness({ authenticated });
    const result = await h.context.attemptRememberedSessionLogin();
    assert.equal(result.authenticated, authenticated);
    assert.equal(h.calls.confirmed, authenticated ? 1 : 0);
    assert.equal(h.calls.closed, authenticated ? 0 : 1);
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
  assert.equal(h.calls.closed, 0);
});

test('la recuperación exige confirmar el ID de la cuenta configurada', async () => {
  for (const userId of ['configured', 'other', '']) {
    const h = harness({ authenticated: true, userId });
    const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: 'configured' });
    assert.equal(result.authenticated, userId === 'configured');
    assert.equal(h.calls.confirmed, userId === 'configured' ? 1 : 0);
    assert.equal(h.calls.closed, userId === 'configured' ? 0 : 1);
    if (userId === 'other') assert.equal(result.reason, 'MANUAL_LOGIN_REQUIRED');
    if (!userId) assert.equal(result.reason, 'SESSION_CHECK_INCONCLUSIVE');
  }
});

test('el acceso OAuth prioriza la cuenta configurada y comprueba el perfil de retorno', async () => {
  const h = harness({ authenticated: true, userId: 'configured', accounts: [
    { userId: 'other', time: 20 }, { userId: 'configured', time: 10 }
  ] });
  const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: 'configured' });
  assert.equal(result.authenticated, true);
  const url = new URL(h.calls.oauthUrl);
  assert.equal(url.searchParams.get('auto_login'), '1');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://www.crealitycloud.com/oauth');
  assert.equal(h.calls.accounts[0].time, 20);
  assert.ok(h.calls.accounts[1].time > 20);
  assert.equal(h.calls.confirmed, 1);
  assert.equal(h.calls.closed, 0);
});

test('no confirma ni reanuda una recuperación ambigua, ajena o caducada', async () => {
  for (const scenario of [
    { accounts: [] },
    { accounts: [{ userId: 'other' }], expectedUserId: 'configured' },
    { accounts: [{ userId: 'one' }, { userId: 'two' }] },
    { accounts: [{ userId: 'configured' }], expectedUserId: 'configured', expired: true }
  ]) {
    const h = harness({ ...scenario, authenticated: true, userId: 'configured' });
    const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: scenario.expectedUserId });
    assert.equal(result.authenticated, false);
    assert.equal(result.reason, 'MANUAL_LOGIN_REQUIRED');
    assert.equal(h.calls.confirmed, 0);
    assert.equal(h.calls.closed, 1);
  }
});

test('una automatización no cierra el navegador remoto ni ejecuta la tarea', async () => {
  const h = harness({ mode: 'interactive' });
  let ran = 0;
  await assert.rejects(h.context.withAutomationBrowser({}, async () => { ran++; }), { code: 'REMOTE_BROWSER_OPEN' });
  assert.equal(ran, 0);
  assert.deepEqual(h.calls, { confirmed: 0, closed: 0, launched: 0 });
  assert.equal(h.context.browserManagerState().mode, 'interactive');
});

test('la limpieza de una tarea cancelada no cierra el navegador abierto después', async () => {
  const h = harness();
  let finish, entered;
  const gate = new Promise(resolve => { finish = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const task = h.context.withAutomationBrowser({}, async () => { entered(); await gate; });
  await started;
  await h.context.abortAutomationBrowser();
  await h.context.openInteractiveBrowser('https://www.crealitycloud.com/check-in');
  finish();
  await task;
  assert.equal(h.calls.closed, 1);
  assert.equal(h.context.browserManagerState().mode, 'interactive');
  assert.equal(h.context.browserManagerState().active, true);
});

test('dos módulos reutilizan Chromium, liberan las pestañas y mantienen la exclusión mutua', async () => {
  const h = harness();
  let firstContext, firstPage;
  await h.context.withAutomationBrowser({}, async context => {
    firstContext = context;
    firstPage = context.pages()[0];
    await context.newPage();
    await assert.rejects(h.context.withAutomationBrowser({}, () => {}), { code: 'BROWSER_BUSY' });
  });
  assert.equal(h.context.browserManagerState().mode, 'idle');
  assert.equal(h.context.browserManagerState().active, true);
  assert.equal(firstContext.pages().length, 1);
  assert.notEqual(firstContext.pages()[0], firstPage);
  await h.context.withAutomationBrowser({ acceptDownloads: true }, async context => {
    assert.equal(context, firstContext);
  });
  assert.equal(h.calls.launched, 1);
  assert.equal(h.calls.closed, 0);
  await h.context.shutdownBrowser();
  assert.equal(h.calls.closed, 1);
  assert.equal(h.context.browserManagerState().active, false);
});

test('abrir el navegador conservado reserva la sesión interactiva y cerrar lo libera', async () => {
  const h = harness();
  await h.context.withAutomationBrowser({}, async () => {});
  await h.context.openInteractiveBrowser('https://www.crealitycloud.com/check-in');
  assert.equal(h.calls.launched, 1);
  assert.equal(h.context.browserManagerState().mode, 'interactive');
  await assert.rejects(h.context.withAutomationBrowser({}, () => {}), { code: 'REMOTE_BROWSER_OPEN' });
  assert.equal(await h.context.closeInteractiveBrowser(), true);
  assert.equal(h.calls.closed, 1);
});

test('un error de ejecución descarta el navegador y la tarea siguiente inicia uno nuevo', async () => {
  const h = harness();
  await assert.rejects(h.context.withAutomationBrowser({}, async () => {
    throw Object.assign(new Error('fallo de prueba'), { code: 'TEST_FAILURE' });
  }), { code: 'TEST_FAILURE' });
  assert.equal(h.calls.closed, 1);
  await h.context.withAutomationBrowser({}, async () => {});
  assert.equal(h.calls.launched, 2);
});

test('un cambio de opciones incompatibles sustituye Chromium antes de la siguiente tarea', async () => {
  const h = harness();
  await h.context.withAutomationBrowser({}, async () => {});
  await h.context.withAutomationBrowser({ locale: 'en-US' }, async () => {
    assert.equal(h.context.browserManagerState().mode, 'automation');
  });
  assert.equal(h.calls.launched, 2);
  assert.equal(h.calls.closed, 1);
});

test('abrir el visor sustituye un contexto que arrancó sin pantalla como respaldo', async () => {
  const h = harness();
  await h.context.withAutomationBrowser({}, async () => {});
  vm.runInContext('headlessFallbackContexts.add(activeContext)', h.context);
  await h.context.openInteractiveBrowser('https://www.crealitycloud.com/check-in');
  assert.equal(h.calls.launched, 2);
  assert.equal(h.calls.closed, 1);
  assert.equal(h.context.browserManagerState().mode, 'interactive');
});
