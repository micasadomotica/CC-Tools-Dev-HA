import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { assertAuthenticatedSession } from '../src/browserManager.js';
import { resumeAfterAuthenticatedLogin } from '../src/sessionHealth.js';

const authenticated = { code: 0, result: { profileUserInfo: { base: { userId: 'test-user' } } } };

function sessionPage({ payload = authenticated, status = 200, missingResponse = false, invalidJson = false, navigationError = null, body = '', login = false } = {}) {
  let url = 'about:blank';
  return {
    url: () => url,
    title: async () => 'Creality Cloud',
    frames: () => [],
    goto: async target => { if (navigationError) throw navigationError; url = target; },
    waitForTimeout: async () => {},
    waitForResponse: async predicate => {
      if (missingResponse) throw new Error('Response timeout');
      const response = {
        url: () => 'https://www.crealitycloud.com/api/cxy/v3/user/getInfo',
        status: () => status,
        json: async () => { if (invalidJson) throw new SyntaxError('Invalid JSON'); return payload; }
      };
      assert.equal(predicate(response), true);
      assert.equal(predicate({ url: () => 'https://www.crealitycloud.com/unrelated' }), false);
      return response;
    },
    locator: selector => ({
      innerText: async () => body,
      first: () => ({ isVisible: async () => false }),
      count: async () => login && selector === 'button:has-text("Log In")' ? 2 : 0,
      nth: index => ({ isVisible: async () => index === 1 })
    })
  };
}

for (const [name, options] of [
  ['sin respuesta del perfil', { missingResponse: true }],
  ['JSON inválido', { invalidJson: true }],
  ['perfil nulo', { payload: null }],
  ['respuesta vacía', { payload: {} }],
  ['servicio temporalmente no disponible', { status: 503, payload: { code: 503, msg: 'Unavailable' } }],
  ['navegación agotada', { navigationError: new Error('Navigation timeout') }]
]) {
  test(`no confirma la sesión: ${name}`, async () => {
    await assert.rejects(assertAuthenticatedSession({ pages: () => [sessionPage(options)] }), error => {
      assert.equal(error.code, 'SESSION_CHECK_UNAVAILABLE');
      assert.equal(error.systemic, false);
      assert.equal(error.silentRetry, true);
      return true;
    });
  });
}

for (const [name, options] of [
  ['token inválido', { payload: { code: 4, msg: 'Invalid Token' } }],
  ['perfil cerrado', { payload: { code: 0, result: null } }],
  ['HTTP 401', { status: 401 }],
  ['HTTP 403', { status: 403 }],
  ['segundo botón visible aunque el perfil sea positivo', { login: true }]
]) {
  test(`exige iniciar sesión: ${name}`, async () => {
    await assert.rejects(assertAuthenticatedSession({ pages: () => [sessionPage(options)] }), { code: 'LOGIN_REQUIRED', systemic: true });
  });
}

test('una verificación de seguridad impide confirmar incluso un perfil positivo', async () => {
  await assert.rejects(assertAuthenticatedSession({ pages: () => [sessionPage({ body: 'Verify you are human' })] }), { code: 'SECURITY_CHALLENGE' });
});

test('confirma un perfil positivo y utiliza la página preferida', async () => {
  await assertAuthenticatedSession({ pages: () => { throw new Error('No debe usar otra página'); } }, sessionPage());
});

test('crea una página si el contexto todavía no tiene ninguna', async () => {
  let created = 0;
  await assertAuthenticatedSession({ pages: () => [], newPage: async () => { created++; return sessionPage(); } });
  assert.equal(created, 1);
});

for (const [name, options, held] of [
  ['sin respuesta', { missingResponse: true }, true],
  ['respuesta desconocida', { payload: { code: 503 } }, true],
  ['perfil confirmado', {}, false]
]) {
  test(`la pausa por sesión cerrada se conserva hasta confirmar el perfil: ${name}`, async () => {
    const config = { automationHealth: { state: 'paused', reasonCode: 'LOGIN_REQUIRED', pausedUntil: '' }, crealityProfile: {} };
    const original = structuredClone(config);
    const scheduler = vm.createContext({
      Date, console, resumeAfterAuthenticatedLogin,
      automaticLoginDue: () => false,
      verifyPersistedSession: async () => {
        await assertAuthenticatedSession({ pages: () => [sessionPage(options)] });
        return { authenticated: true };
      }
    });
    // Exercise the real scheduler decision with an isolated session check and no disk writes.
    const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
      .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, scheduler);
    assert.equal(await scheduler.holdForAutomationHealth(config), held);
    if (held) assert.deepEqual(config, original);
    else assert.equal(config.automationHealth.state, 'active');
  });
}
