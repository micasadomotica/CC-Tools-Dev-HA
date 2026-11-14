import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudflareCookieMetadata, recordCookieDiagnostics, withCookieDiagnostics,
  cookieDiagnosticsSnapshot } from '../src/cookieDiagnostics.js';

const secret = 'COOKIE_VALUE_MUST_NEVER_BE_LOGGED';
const cookie = (extra = {}) => ({ name: 'cf_clearance', domain: '.crealitycloud.com',
  value: secret, expires: 1900000000, secure: true, httpOnly: true, sameSite: 'None', ...extra });

test('solo recoge metadatos permitidos, sin leer el valor ni copiar campos adicionales', () => {
  const input = cookie({ path: `/${secret}`, partitionKey: `https://${secret}.example`,
    extra: secret });
  // Define the getter after fixture creation so it is not accessed by object spread.
  Object.defineProperty(input, 'value', { get() { assert.fail('No debe leer el valor'); } });
  const metadata = cloudflareCookieMetadata([input,
    cookie({ name: 'login_session' }), cookie({ domain: '.unrelated.example' })], 1800000000000);
  assert.equal(metadata.length, 1);
  assert.deepEqual(metadata[0], { name: 'cf_clearance', domain: '.crealitycloud.com',
    expiresAt: new Date(1900000000000).toISOString(), session: false, expired: false,
    secure: true, httpOnly: true, sameSite: 'None', partitioned: true });
  assert.equal(JSON.stringify(metadata).includes(secret), false);
});

test('compara presencia entre módulos sin identificar el contenido de la cookie', async t => {
  const output = [];
  t.mock.method(console, 'log', (...args) => output.push(args));
  let cookies = [];
  const context = { cookies: async () => cookies };
  const first = await withCookieDiagnostics('comments', async () => {
    await recordCookieDiagnostics(context, 'module_start', { reused: false });
    cookies = [cookie()];
    await recordCookieDiagnostics(context, 'challenge_after', { url: `https://www.crealitycloud.com/private/${secret}?token=${secret}` });
    await recordCookieDiagnostics(context, 'module_end');
    return cookieDiagnosticsSnapshot();
  });
  assert.equal(first.events[0].clearancePresent, false);
  assert.deepEqual(first.events[1].appeared, ['cf_clearance@.crealitycloud.com']);
  assert.equal(first.events[1].origin, 'https://www.crealitycloud.com');
  cookies = [cookie({ value: 'ANOTHER_PRIVATE_VALUE' })];
  const second = await withCookieDiagnostics('modelDownloads', async () => {
    await recordCookieDiagnostics(context, 'module_start', { reused: true });
    cookies = [];
    await recordCookieDiagnostics(context, 'module_end');
    return cookieDiagnosticsSnapshot();
  });
  assert.equal(second.events[0].sameContext, true);
  assert.equal(second.events[0].sameMetadata, true, 'No afirma comparar los valores');
  assert.equal(second.events[0].previous.taskId, 'comments');
  assert.deepEqual(second.events[1].disappeared, ['cf_clearance@.crealitycloud.com']);
  assert.notEqual(first.traceId, second.traceId);
  assert.equal(cookieDiagnosticsSnapshot(), null);
  const serialized = JSON.stringify([first, second, output]);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('ANOTHER_PRIVATE_VALUE'), false);
});

test('lecturas fallidas no se confunden con ausencia ni filtran mensajes de error', async t => {
  const output = [];
  t.mock.method(console, 'log', (...args) => output.push(args));
  let fail = false;
  const context = { cookies: async () => { if (fail) throw new Error(secret); return [cookie()]; } };
  const trace = await withCookieDiagnostics('makeNow', async () => {
    await recordCookieDiagnostics(context, 'challenge_before');
    fail = true;
    await recordCookieDiagnostics(context, 'challenge_unsolved');
    fail = false;
    await recordCookieDiagnostics(context, 'module_end');
    return cookieDiagnosticsSnapshot();
  });
  assert.equal(trace.events[1].readStatus, 'unavailable');
  assert.equal('clearancePresent' in trace.events[1], false);
  assert.equal(trace.events[2].sameMetadata, true);
  assert.equal(trace.events[2].previous.phase, 'challenge_before');
  assert.equal(JSON.stringify([trace, output]).includes(secret), false);
});

test('un contexto nuevo se distingue y las trazas concurrentes permanecen separadas', async t => {
  t.mock.method(console, 'log', () => {});
  const a = { cookies: async () => [cookie()] }, b = { cookies: async () => [] };
  const [first, second] = await Promise.all([['comments', a], ['modelDownloads', b]].map(([task, ctx]) =>
    withCookieDiagnostics(task, async () => {
      await recordCookieDiagnostics(ctx, 'module_start');
      await new Promise(resolve => setImmediate(resolve));
      return cookieDiagnosticsSnapshot();
    })));
  assert.equal(first.taskId, 'comments');
  assert.equal(second.taskId, 'modelDownloads');
  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 1);
  assert.notEqual(first.events[0].contextId, second.events[0].contextId);
  assert.equal(second.events[0].sameContext, false);
});

test('una lectura bloqueada vence sin detener el módulo ni registrar una cookie ausente', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = withCookieDiagnostics('comments', async () => {
    await recordCookieDiagnostics({ cookies: () => new Promise(() => {}) }, 'module_start');
    return cookieDiagnosticsSnapshot();
  });
  t.mock.timers.tick(2000);
  const trace = await pending;
  assert.equal(trace.events[0].readStatus, 'unavailable');
  assert.equal('clearancePresent' in trace.events[0], false);
});

test('limita el tamaño de la traza y distingue caducidad, sesión y fechas inválidas', async t => {
  t.mock.method(console, 'log', () => {});
  const meta = cloudflareCookieMetadata([cookie({ expires: 1 }), cookie({ expires: -1 }), cookie({ expires: Infinity })]);
  assert.ok(meta.some(c => c.expired === true));
  assert.ok(meta.some(c => c.session && c.expiresAt === null));
  assert.ok(meta.some(c => !c.session && c.expiresAt === null && c.expired === null));
  const trace = await withCookieDiagnostics('comments', async () => {
    const context = { cookies: async () => [] };
    for (let n = 0; n < 103; n++) await recordCookieDiagnostics(context, 'module_start');
    return cookieDiagnosticsSnapshot();
  });
  assert.equal(trace.events.length, 100);
  assert.equal(trace.omittedEvents, 3);
});
