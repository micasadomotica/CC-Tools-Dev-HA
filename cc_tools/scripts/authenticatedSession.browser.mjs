import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertAuthenticatedSession } from '../src/browserManager.js';

const authenticated = { code: 0, result: { profileUserInfo: { base: { userId: 'test-user' } } } };

const cases = [
  { name: 'perfil positivo', payload: authenticated },
  { name: 'perfil positivo con todos los botones de login ocultos', payload: authenticated, html: '<button hidden>Log In</button><button hidden>Log In</button>' },
  { name: 'respuesta JSON inválida', raw: '<html>Error</html>', code: 'SESSION_CHECK_UNAVAILABLE' },
  { name: 'respuesta desconocida HTTP 503', status: 503, payload: { code: 503 }, code: 'SESSION_CHECK_UNAVAILABLE' },
  { name: 'petición de perfil sin respuesta', noResponse: true, code: 'SESSION_CHECK_UNAVAILABLE' },
  { name: 'token inválido', payload: { code: 4, msg: 'Invalid Token' }, code: 'LOGIN_REQUIRED' },
  { name: 'verificación de seguridad con perfil positivo', payload: authenticated, html: '<h1>Verify you are human</h1>', code: 'SECURITY_CHALLENGE' }
];
for (const tag of ['span', 'button', 'a']) {
  for (const label of ['Log In', 'Iniciar sesión']) {
    cases.push({ name: `segundo ${tag} visible: ${label}`, payload: authenticated,
      html: `<${tag} style="display:none">${label}</${tag}><${tag}>${label}</${tag}>`, code: 'LOGIN_REQUIRED' });
  }
}

test('comprueba la sesión con páginas y respuestas de navegador controladas', async t => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  try {
    for (const scenario of cases) {
      await t.test(scenario.name, async () => {
        const context = await browser.newContext();
        try {
          // All requests are fulfilled or aborted locally. No real account or service is used.
          await context.route('**/*', route => {
            if (route.request().url().includes('/api/cxy/v3/user/getInfo')) {
              if (scenario.noResponse) return route.abort();
              return route.fulfill({ status: scenario.status || 200, contentType: 'application/json',
                body: scenario.raw || JSON.stringify(scenario.payload) });
            }
            if (route.request().resourceType() !== 'document') return route.abort();
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<meta charset="utf-8"><title>Creality Cloud</title>
              ${scenario.html || '<main>Workbench</main>'}
              <script>fetch('/api/cxy/v3/user/getInfo').catch(() => {});</script>` });
          });
          if (scenario.code) {
            await assert.rejects(assertAuthenticatedSession(context), error => {
              assert.equal(error.code, scenario.code);
              if (scenario.code === 'SESSION_CHECK_UNAVAILABLE') {
                assert.equal(error.silentRetry, true);
                assert.equal(error.systemic, false);
              }
              return true;
            });
          } else {
            await assertAuthenticatedSession(context);
          }
        } finally { await context.close(); }
      });
    }
  } finally { await browser.close(); }
});
