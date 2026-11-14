import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

let browser, server, dataDir, baseUrl;
before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cctools-setup-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    windowsHide: true,
    env: { ...process.env, CCTOOLS_HOST: '127.0.0.1', CCTOOLS_PORT: String(port), CCTOOLS_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  server.stdout.on('data', data => { logs += data; });
  server.stderr.on('data', data => { logs += data; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await (await fetch(`${baseUrl}/api/status`)).json()).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, logs);
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit');
    server.kill();
    await closed;
  }
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

test('el aviso de verificación abre la ventana existente sin iniciar login ni cancelar la tarea', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let active = true, views = 0, logins = 0, cancels = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/browser/status*', route => route.fulfill({ json: { ok: true,
    browser: { mode: 'automation', active: true, challenge: { active, phase: 'manual',
      message: 'Completa la verificación en el navegador. La tarea continuará al cargar la página de destino.' } } } }));
  await context.route('**/api/browser/open', route => { views++; return route.fulfill({ json: { ok: true, url: '/novnc/test-viewer' } }); });
  await context.route('**/api/tasks/creality/login/open', route => { logins++; return route.fulfill({ json: { ok: false } }); });
  await context.route('**/api/browser/challenge/cancel', route => { cancels++; active = false; return route.fulfill({ json: { ok: true, cancelled: true } }); });
  await context.route('**/novnc/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Visor de prueba</p>' }));
  try {
    await page.goto(baseUrl);
    await page.waitForSelector('#security-challenge-banner:not([hidden])');
    assert.equal(await page.locator('#close-login').isDisabled(), true);
    assert.equal(await page.locator('#security-challenge-open').isVisible(), true);
    assert.equal(views, 0);
    if (process.env.CCTOOLS_QA_DIR) await page.screenshot({ path: path.join(process.env.CCTOOLS_QA_DIR, 'verification-banner.png') });
    const popup = page.waitForEvent('popup');
    await page.locator('#security-challenge-open').click();
    await (await popup).waitForURL('**/novnc/test-viewer');
    assert.equal(views, 1);
    assert.equal(logins, 0);
    assert.equal(cancels, 0);
    await page.locator('#security-challenge-cancel').click();
    await page.waitForSelector('#security-challenge-banner', { state: 'hidden' });
    assert.equal(cancels, 1);
    assert.equal(await page.locator('#close-login').isDisabled(), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Telegram conserva el paso del asistente y las descargas parten de 10', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // All account actions are simulated: no Telegram message or Creality login is sent.
  await page.route('**/api/tasks/creality/login/close', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/creality/profile/refresh', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/points/**', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/shop/**', route => route.fulfill({ json: { ok: false } }));
  let telegramTests = 0;
  await page.route('**/api/telegram/test', route => {
    telegramTests++;
    return route.fulfill({ json: { ok: true } });
  });
  try {
    await page.goto(baseUrl);
    await page.waitForSelector('#wizard-modal:not([hidden])');
    await page.locator('#wizard-next').click();
    await page.waitForSelector('[data-wizard-step="2"].is-visible');
    await page.locator('#wizard-telegram-token').fill('test-token');
    await page.locator('#wizard-telegram-chat').fill('12345');
    await page.locator('#wizard-test-telegram').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Mensaje enviado.');
    assert.equal(telegramTests, 1);
    assert.equal(await page.locator('[data-wizard-step="2"]').isVisible(), true);
    await page.locator('#wizard-next').click();
    await page.waitForSelector('[data-wizard-step="3"].is-visible');
    await page.locator('#wizard-next').click();
    await page.waitForSelector('#wizard-modal', { state: 'hidden' });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#models-daily-limit').value === '10');
    assert.equal(await page.locator('#wizard-modal').isVisible(), false);
    await page.locator('#open-models-config svg').click();
    assert.equal(await page.locator('#models-daily-limit').inputValue(), '10');
    assert.equal(await page.locator('#models-window-end').inputValue(), '14:00');
    await page.locator('#close-models-config').click();
    await page.locator('#open-collections-config svg').click();
    assert.equal(await page.locator('#run-collections-now').isVisible(), true);
    await page.locator('#close-collections-config').click();
    await page.route('**/api/tasks/finish-print/discover-printers', route => route.fulfill({ json: { ok: true, printers: [{ name: 'Test printer', deviceId: 'test-printer' }] } }));
    await page.locator('#open-finish-print-config').click();
    await page.locator('#toggle-finish-print-setup').click();
    await page.locator('[data-finish-profile-action="discover-printers"]').click();
    await page.locator('[data-finish-printer-picker]').selectOption('Test printer');
    await page.locator('[data-finish-profile-action="add"]').click();
    assert.equal(await page.locator('[data-finish-profile-field="dailyLimit"]').inputValue(), '10');
    await page.locator('#close-finish-print-config').click();
    await page.locator('#creality-user-avatar').click();
    await page.locator('#creality-menu-settings').click();
    assert.equal(await page.locator('#session-auto-login').isChecked(), false);
    await page.locator('#session-auto-login').check();
    const savedSession = page.waitForResponse(response => response.url().endsWith('/api/config') && response.request().method() === 'PATCH');
    await page.locator('#save-session').click();
    assert.equal((await savedSession).ok(), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#session-auto-login').checked === true);
    await page.locator('#creality-user-avatar').click();
    await page.locator('#creality-menu-settings').click();
    await page.locator('[data-tab="notifications"]').click();
    const toggles = [
      ['#notify-model-collection', 'notifyOnModelCollection'],
      ['#notify-model-collection-error', 'notifyOnModelCollectionError'],
      ['#notify-makenow', 'notifyOnMakeNow'],
      ['#notify-makenow-error', 'notifyOnMakeNowError'],
      ['#notify-upload-design', 'notifyOnUploadDesign'],
      ['#notify-upload-design-error', 'notifyOnUploadDesignError']
    ];
    for (const [selector] of toggles) {
      assert.equal(await page.locator(selector).isVisible(), true);
      await page.locator(selector).uncheck();
    }
    let saved = page.waitForResponse(response => response.url().endsWith('/api/config') && response.request().method() === 'PATCH');
    await page.locator('#save-telegram').click();
    assert.equal((await saved).ok(), true);
    let stored = JSON.parse(await fs.readFile(path.join(dataDir, 'config.json'), 'utf8'));
    for (const [, key] of toggles) assert.equal(stored.telegram[key], false);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#notify-upload-design').checked === false);
    for (const [selector] of toggles) assert.equal(await page.locator(selector).isChecked(), false);
    await page.locator('#creality-user-avatar').click();
    await page.locator('#creality-menu-settings').click();
    await page.locator('[data-tab="notifications"]').click();
    await page.locator('#notify-all-success').check();
    await page.locator('#notify-all-error').check();
    saved = page.waitForResponse(response => response.url().endsWith('/api/config') && response.request().method() === 'PATCH');
    await page.locator('#save-telegram').click();
    assert.equal((await saved).ok(), true);
    stored = JSON.parse(await fs.readFile(path.join(dataDir, 'config.json'), 'utf8'));
    for (const [, key] of toggles) assert.equal(stored.telegram[key], true);
    if (process.env.CCTOOLS_QA_SCREENSHOT) await page.locator('#tab-notifications').screenshot({ path: process.env.CCTOOLS_QA_SCREENSHOT });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
