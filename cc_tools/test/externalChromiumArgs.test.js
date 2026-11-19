import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { externalChromiumArgs, externalChromiumDownloadsDir } from '../src/externalChromium.js';

test('oculta los avisos de opción no compatible y de Chrome for Testing sin activar el sandbox', () => {
  const args = externalChromiumArgs('/data/browser-session/chromium', 9222);
  assert.ok(args.includes('--no-sandbox'));
  // Chromium only skips the Chrome for Testing infobar with the "gpu" value.
  assert.ok(args.includes('--test-type=gpu'));
  assert.ok(!args.includes('--test-type'));
  // An app restart may stop Chromium abruptly; no "Restore pages?" bubble.
  assert.ok(args.includes('--hide-crash-restore-bubble'));
});

test('las descargas CDP van a una carpeta del perfil que se puede vaciar', () => {
  assert.equal(externalChromiumDownloadsDir('/data/browser-session/chromium'),
    path.join('/data/browser-session/chromium', 'cdp-downloads'));
  assert.equal(externalChromiumDownloadsDir('/p', { downloadsPath: '/tmp/d' }), '/tmp/d');
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
