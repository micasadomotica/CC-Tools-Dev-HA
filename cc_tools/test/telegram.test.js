import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegram } from '../src/telegram.js';

const config = profile => ({
  telegram: { enabled: true, botToken: 'test-token', chatId: 'test-chat' },
  crealityProfile: profile
});

test('todos los mensajes incluyen el perfil guardado sin modificar su contenido', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const message = '🎨 CC Tools Dev: MakeNow: recompensa diaria confirmada.';
  assert.equal((await sendTelegram(config({ name: 'MiCasaDomotica', userId: '42' }), message)).sent, true);
  assert.equal(payload.text, `${message}\n\n👤 Perfil CC: MiCasaDomotica`);
  assert.equal(payload.chat_id, 'test-chat');
});

test('escapa el nombre del perfil en HTML y conserva los enlaces del mensaje', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const message = 'CC Tools Dev: <a href="https://example.test/model">Modelo</a>';
  await sendTelegram(config({ name: 'Taller <3 & Casa\nPrincipal' }), message, { parseMode: 'HTML' });
  assert.equal(payload.parse_mode, 'HTML');
  assert.equal(payload.text, `${message}\n\n👤 Perfil CC: Taller &lt;3 &amp; Casa Principal`);
});

test('usa el ID si falta el nombre y señala si el perfil todavía no se conoce', async t => {
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    messages.push(JSON.parse(options.body).text);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  await sendTelegram(config({ name: ' ', userId: '42' }), 'Prueba');
  await sendTelegram(config(undefined), 'Prueba');
  assert.equal(messages[0], 'Prueba\n\n👤 Perfil CC: ID 42');
  assert.equal(messages[1], 'Prueba\n\n👤 Perfil CC: sin identificar');
});

test('Telegram desactivado no envía ninguna solicitud', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  const settings = config({ name: 'MiCasaDomotica' });
  settings.telegram.enabled = false;
  assert.equal((await sendTelegram(settings, 'Prueba')).sent, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});
