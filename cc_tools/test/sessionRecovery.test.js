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

    bindBrowserDiagnostics: () => {}, recordBrowserLifecycle: () => {},
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

test('la recuperación exige confirmar el ID de la cuenta configurada', async () => {
  for (const userId of ['configured', 'other', '']) {
    const h = harness({ authenticated: true, userId });
    const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: 'configured' });
    assert.equal(result.authenticated, userId === 'configured');
    assert.equal(h.calls.confirmed, userId === 'configured' ? 1 : 0);
    assert.equal(h.calls.closed, 1);
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
  assert.equal(h.calls.closed, 1);
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

test('dos módulos cierran Chromium entre tareas y mantienen la exclusión mutua', async () => {
  const h = harness();
  await h.context.withAutomationBrowser({}, async () => {
    await assert.rejects(h.context.withAutomationBrowser({}, () => {}), { code: 'BROWSER_BUSY' });
  });
  assert.equal(h.context.browserManagerState().mode, 'idle');
  assert.equal(h.context.browserManagerState().active, false);
  assert.equal(h.calls.closed, 1);
  await h.context.withAutomationBrowser({ acceptDownloads: true }, async () => {});
  assert.equal(h.calls.launched, 2);
  assert.equal(h.calls.closed, 2);
  await h.context.shutdownBrowser();
  assert.equal(h.calls.closed, 2);
});

test('abrir el navegador inicia una sesión interactiva independiente y cerrar la libera', async () => {
  const h = harness();
  await h.context.withAutomationBrowser({}, async () => {});
  await h.context.openInteractiveBrowser('https://www.crealitycloud.com/check-in');
  assert.equal(h.calls.launched, 2);
  assert.equal(h.context.browserManagerState().mode, 'interactive');
  await assert.rejects(h.context.withAutomationBrowser({}, () => {}), { code: 'REMOTE_BROWSER_OPEN' });
  assert.equal(await h.context.closeInteractiveBrowser(), true);
  assert.equal(h.calls.closed, 2);
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

test('cada tarea inicia Chromium con sus opciones', async () => {
  const h = harness();
  await h.context.withAutomationBrowser({}, async () => {});
  await h.context.withAutomationBrowser({ locale: 'en-US' }, async () => {
    assert.equal(h.context.browserManagerState().mode, 'automation');
  });
  assert.equal(h.calls.launched, 2);
  assert.equal(h.calls.closed, 2);
});

// Since November 2026 the workbench loads without a session instead of redirecting
// to id.creality.com. Recovery must open the login entry itself.
function workbenchWithoutRedirect({ loginButton = true, userId = 'configured' } = {}) {
  const calls = { visited: [], clicked: 0, confirmed: 0, closed: 0 };
  const appUrl = 'https://www.crealitycloud.com/es/workbench-beta/?type=1';
  const homeUrl = 'https://www.crealitycloud.com/es';
  const buttonUrl = 'https://id.creality.com/?lang=es-ES&client_id=cloud&redirect_uri=https%3A%2F%2Fwww.crealitycloud.com%2Fes';
  let currentUrl = 'about:blank', loggedIn = false;
  let stored = JSON.stringify([{ userId, time: 10 }]);
  const page = {
    url: () => currentUrl,
    async goto(url) {
      calls.visited.push(url);
      const target = new URL(url);
      if (target.hostname === 'id.creality.com' && target.searchParams.get('auto_login') === '1') {
        calls.oauthUrl = url;
        loggedIn = true;
        currentUrl = homeUrl;
      } else currentUrl = url;
    },
    getByText(pattern) {
      return { first: () => ({ click: async () => {
        if (!loginButton) throw new Error('not found');
        assert.ok(pattern.test('Iniciar sesión'));
        calls.clicked++;
        currentUrl = buttonUrl;
      } }) };
    },
    async evaluate(_callback, value) {
      if (value === undefined) return stored;
      stored = value;
    },
    async waitForURL() {}
  };
  const fixtureContext = { pages: () => [page], browser: () => null, once() {}, newPage: async () => page,
    close: async () => { calls.closed++; } };
  const context = vm.createContext({ process, URL, calls, fixtureContext,
    bindBrowserDiagnostics: () => {}, recordBrowserLifecycle: () => {},
    installChallengeHandling: () => {}, browserChallengeState: () => ({ active: false }),
    inspectCrealityPage: async () => null, normalizeCaughtError: error => error,
    launchFixture: async () => fixtureContext,
    checkFixture: async () => {
      if (!loggedIn) throw Object.assign(new Error('La sesión de Creality Cloud ha caducado o no está iniciada.'), { code: 'LOGIN_REQUIRED' });
      return { ...sessionCheckOutcome('authenticated'), userId };
    },
    confirmAuthenticatedSession: async () => { calls.confirmed++; return { authenticated: true }; }
  });
  const source = fs.readFileSync(new URL('../src/browserManager.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  vm.runInContext('launchWithRecovery = launchFixture; assertAuthenticatedSession = checkFixture;', context);
  return { context, calls, appUrl, homeUrl };
}

test('sin redirección del banco de trabajo abre el acceso con el botón Iniciar sesión', async () => {
  const h = workbenchWithoutRedirect();
  const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: 'configured' });
  assert.equal(result.authenticated, true);
  assert.equal(h.calls.clicked, 1);
  assert.deepEqual(h.calls.visited.slice(0, 2), [h.appUrl, h.homeUrl]);
  const url = new URL(h.calls.oauthUrl);
  assert.equal(url.hostname, 'id.creality.com');
  assert.equal(url.searchParams.get('auto_login'), '1');
  assert.equal(h.calls.confirmed, 1);
});

test('sin botón de acceso utiliza la dirección del centro de cuentas', async () => {
  const h = workbenchWithoutRedirect({ loginButton: false });
  const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: 'configured' });
  assert.equal(result.authenticated, true);
  assert.equal(h.calls.clicked, 0);
  const fallbackUrl = vm.runInContext('CREALITY_LOGIN_FALLBACK_URL', h.context);
  assert.ok(h.calls.visited.includes(fallbackUrl));
  const fallback = new URL(fallbackUrl);
  assert.equal(fallback.searchParams.get('redirect_uri'), h.appUrl);
  assert.equal(h.calls.confirmed, 1);
});

test('con la sesión ya iniciada no abre el acceso', async () => {
  const h = workbenchWithoutRedirect();
  h.context.assertAuthenticatedSession = async () => ({ ...sessionCheckOutcome('authenticated'), userId: 'configured' });
  const result = await h.context.attemptRememberedSessionLogin({ expectedUserId: 'configured' });
  assert.equal(result.authenticated, true);
  assert.equal(h.calls.clicked, 0);
  assert.deepEqual(h.calls.visited, [h.appUrl]);
});
