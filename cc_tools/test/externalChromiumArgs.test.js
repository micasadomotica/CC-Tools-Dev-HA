import test from 'node:test';
import assert from 'node:assert/strict';
import { externalChromiumArgs } from '../src/externalChromium.js';

test('oculta el aviso de opción no compatible sin activar el sandbox', () => {
  const args = externalChromiumArgs('/data/browser-session/chromium', 9222);
  assert.ok(args.includes('--no-sandbox'));
  assert.ok(args.includes('--test-type'));
});

test('conserva perfil, depuración local, idioma y página inicial', () => {
  const args = externalChromiumArgs('/data/browser-session/chromium', 9333, { locale: 'en-US' });
  assert.ok(args.includes('--user-data-dir=/data/browser-session/chromium'));
  assert.ok(args.includes('--remote-debugging-port=9333'));
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--lang=en-US'));
  assert.equal(args.at(-1), 'about:blank');
  assert.ok(!args.includes('--headless=new'));
  assert.ok(externalChromiumArgs('/p', 1, { headless: true }).includes('--headless=new'));
});
