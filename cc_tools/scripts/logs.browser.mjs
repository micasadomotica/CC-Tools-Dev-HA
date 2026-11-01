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
import { requireMigrationReview } from '../src/migrationReview.js';

let browser, server, dataDir, baseUrl;
before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cctools-setup-'));
  await fs.writeFile(path.join(dataDir, 'runs.json'), JSON.stringify(Array.from({ length: 45 }, (_, index) => ({
    id: 'log-' + index, taskId: 'makeNow', status: 'success', source: 'manual',
    message: 'Registro ' + index, finishedAt: new Date(Date.now() - index * 1000).toISOString(), details: {}
  }))));
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
  if (dataDir) { assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir())); await fs.rm(dataDir, { recursive: true, force: true }); }
});

test('pedidos: refresco manual muestra carga, evita duplicados y conserva datos ante un error', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let forced = 0, releaseResponse;
  const orders = { items: [{ id: 'test-order', title: 'Pedido de prueba', status: 'Pendiente', statusKind: 'pending', quantity: 1 }] };
  await page.route('**/*', route => route.request().url().startsWith(baseUrl) ? route.continue() : route.abort());
  await page.route('**/api/status?*', async route => {
    const response = await route.fetch(); const status = await response.json();
    status.config.setup.assistantCompleted = true;
    await route.fulfill({ json: status });
  });
  for (const pattern of ['**/api/creality/profile/refresh', '**/api/progress/refresh', '**/api/points/**', '**/api/shop/**']) {
    await page.route(pattern, route => route.fulfill({ json: { ok: false } }));
  }
  await page.route('**/api/shop/orders/refresh*', async route => {
    if (!route.request().url().includes('force=1')) {
      return route.fulfill({ json: { ok: true, orders } });
    }
    forced++;
    await new Promise(resolve => { releaseResponse = resolve; });
    await route.fulfill({ status: 409, json: { ok: false, error: 'SHOP_ORDERS_REFRESH_FAILED', orders } });
  });
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#creality-session-indicator').title.startsWith('Sesión:'));
    await page.locator('#points-counter').click();
    await page.waitForFunction(() => document.querySelector('#points-shop-orders-list').textContent.includes('Pedido de prueba'));
    const button = page.locator('#refresh-shop-orders');
    await page.waitForFunction(() => !document.querySelector('#refresh-shop-orders').disabled);
    await button.click();
    await page.waitForFunction(() => document.querySelector('#refresh-shop-orders').classList.contains('is-loading'));
    assert.equal(await button.isDisabled(), true);
    assert.equal(forced, 1);
    releaseResponse();
    await page.waitForFunction(() => !document.querySelector('#refresh-shop-orders').disabled);
    assert.equal(await button.evaluate(el => el.classList.contains('is-loading')), false);
    assert.match(await page.locator('#points-shop-orders-list').innerText(), /Pedido de prueba/);
    assert.deepEqual(errors, []);
  } finally {
    releaseResponse?.();
    await page.unrouteAll({ behavior: 'wait' });
    await page.close();
  }
});

test('Logs pagina, conserva la página al refrescar y descarga solo los registros visibles', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/status?*', async route => {
    const response = await route.fetch(); const status = await response.json();
    status.config.setup.assistantCompleted = true;
    await route.fulfill({ json: status });
  });
  await page.route('**/api/creality/profile/refresh', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/progress/refresh', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/points/**', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/shop/**', route => route.fulfill({ json: { ok: false } }));
  try {
    const request = async query => (await fetch(baseUrl + '/api/runs?' + query)).json();
    const first = await request('page=1&pageSize=20');
    assert.equal(first.total, 45); assert.equal(first.totalPages, 3); assert.equal(first.items.length, 20);
    const bounded = await request('page=999&pageSize=20');
    assert.equal(bounded.page, 3); assert.equal(bounded.items.length, 5);
    assert.equal((await request('page=-1&pageSize=999')).pageSize, 100);
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#creality-session-indicator').title.startsWith('Sesión:'));
    await page.locator('#creality-user-avatar').click();
    await page.locator('#creality-menu-logs').click();
    await page.waitForFunction(() => document.querySelector('#logs-page').textContent === 'Página 1 de 3');
    assert.equal(await page.locator('#runs .run').count(), 20);
    assert.equal(await page.locator('#logs-prev').isDisabled(), true);
    await page.locator('#logs-next').click();
    await page.waitForFunction(() => document.querySelector('#logs-page').textContent === 'Página 2 de 3');
    assert.match(await page.locator('#runs').innerText(), /Registro 20/);
    await page.waitForResponse(response => response.url().includes('/api/runs?page=2'), { timeout: 15000 });
    assert.equal(await page.locator('#logs-page').innerText(), 'Página 2 de 3');
    const downloaded = page.waitForEvent('download');
    await page.locator('#download-visible-logs').click();
    const download = await downloaded;
    const content = await fs.readFile(await download.path(), 'utf8');
    assert.match(content, /Página: 2 de 3/); assert.match(content, /Registro 20/);
    assert.doesNotMatch(content, /Registro 0\n/);
    await page.locator('#logs-next').click();
    await page.waitForFunction(() => document.querySelector('#logs-page').textContent === 'Página 3 de 3');
    assert.equal(await page.locator('#runs .run').count(), 5);
    assert.equal(await page.locator('#logs-next').isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await page.close();
  }
});

test('el indicador del avatar y la API de HA coinciden al abrir y perder la sesión', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(baseUrl) ? route.continue() : route.abort());
  await page.route('**/api/status?*', async route => {
    const response = await route.fetch();
    const status = await response.json();
    status.config.setup.assistantCompleted = true;
    await route.fulfill({ json: status });
  });
  await page.route('**/api/creality/profile/refresh', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/progress/refresh', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/points/**', route => route.fulfill({ json: { ok: false } }));
  await page.route('**/api/shop/**', route => route.fulfill({ json: { ok: false } }));
  const configPath = path.join(dataDir, 'config.json');
  const original = await fs.readFile(configPath, 'utf8');
  try {
    const config = JSON.parse(original);
    config.crealityProfile = { userId: '123', name: 'Perfil de prueba', avatarUrl: '', updatedAt: new Date().toISOString() };
    const checkedAt = '2026-10-15T08:00:00.000Z';
    for (const scenario of [
      { authenticated: null, open: true },
      { authenticated: false, open: false },
      { authenticated: true, open: true },
      { authenticated: true, healthClosed: true, open: false }
    ]) {
      config.crealitySession = { authenticated: scenario.authenticated, checkedAt, reason: scenario.authenticated === false ? 'Sesión caducada' : '' };
      config.automationHealth = { state: scenario.healthClosed ? 'paused' : 'active', reasonCode: scenario.healthClosed ? 'LOGIN_REQUIRED' : '', reason: scenario.healthClosed ? 'Sesión caducada' : '' };
      await fs.writeFile(configPath, JSON.stringify(config));
      const integration = await (await fetch(baseUrl + '/api/integration/status')).json();
      assert.equal(integration.session.authenticated, scenario.open);
      assert.equal(integration.session.state, scenario.open ? 'open' : 'closed');
      assert.equal(integration.session.checkedAt, checkedAt);
      assert.equal(integration.session.reason, scenario.open ? '' : 'Sesión caducada');
      await page.goto(baseUrl);
      await page.waitForFunction(() => document.querySelector('#creality-session-indicator').title.startsWith('Sesión:'));
      const label = scenario.open ? 'Sesión: Abierta' : 'Sesión: Cerrada';
      await page.waitForFunction(expected => document.querySelector('#creality-session-indicator').title === expected, label);
      const indicator = page.locator('#creality-session-indicator');
      assert.equal(await indicator.evaluate(element => element.classList.contains('is-open')), scenario.open);
      assert.equal(await indicator.evaluate(element => getComputedStyle(element).backgroundColor), scenario.open ? 'rgb(46, 232, 107)' : 'rgb(255, 64, 87)');
      assert.equal(await indicator.evaluate(element => element.parentElement.id === 'creality-user-avatar'), false);
      assert.match(await page.locator('#creality-user-avatar').getAttribute('aria-label'), scenario.open ? /Sesión abierta/ : /Sesión cerrada/);
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await page.close();
    await fs.writeFile(configPath, original);
  }
});

test('el aviso de migración enlaza a Logs sin reanudar hasta pulsar el botón', async () => {
  const configPath = path.join(dataDir, 'config.json');
  const original = await fs.readFile(configPath, 'utf8');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let resumes = 0;
  page.on('request', request => { if (request.url().endsWith('/api/automation/resume')) resumes++; });
  try {
    const config = JSON.parse(original);
    config.setup.assistantCompleted = true;
    for (const task of Object.values(config.tasks)) task.enabled = false;
    requireMigrationReview(config, 'local_cc_tools');
    // Reproduce installations that still have the old persisted warning.
    config.automationHealth.reason = 'Datos migrados. Revisa el perfil, las programaciones y las entregas antes de pulsar Reanudar automatizaciones.';
    await fs.writeFile(configPath, JSON.stringify(config));
    await page.route('**/*', route => route.request().url().startsWith(baseUrl) ? route.continue() : route.abort());
    for (const pattern of ['**/api/creality/profile/refresh', '**/api/progress/refresh', '**/api/points/**', '**/api/shop/**']) {
      await page.route(pattern, route => route.fulfill({ json: { ok: false } }));
    }
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#creality-session-indicator').title.startsWith('Sesión:'));
    // The button is triangular: its bounding-box center is on the clipped edge.
    await page.locator('#open-comments-config').click({ position: { x: 50, y: 50 } });
    await page.locator('#run-comments-now').click();
    const link = page.locator('#progress-message a');
    await link.waitFor();
    assert.equal(await link.innerText(), 'Logs');
    assert.match(await page.locator('#progress-message').innerText(), /Una vez revisado, puedes ir a Logs y pulsar «Reanudar automatizaciones»/);
    if (process.env.CCTOOLS_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.CCTOOLS_TEST_SCREENSHOTS, '1.0.55-migration-warning.png') });
    await link.click();
    assert.equal(await page.locator('#run-progress-modal').isVisible(), false);
    assert.equal(await page.locator('#view-logs').isVisible(), true);
    const resume = page.locator('[data-action="resume-automations"]');
    assert.equal(await resume.isVisible(), true);
    assert.equal(resumes, 0);
    assert.equal(JSON.parse(await fs.readFile(configPath, 'utf8')).migrationReview.required, true);
    await resume.click();
    await page.waitForFunction(() => !document.querySelector('[data-action="resume-automations"]'));
    assert.equal(resumes, 1);
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.equal(saved.migrationReview.required, false);
    assert.ok(saved.migrationReview.reviewedAt);
    assert.equal(saved.automationHealth.state, 'active');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await fs.writeFile(configPath, original);
  }
});

test('la papelera oculta pedidos solo localmente y muestra puntos sin decimales', async () => {
  const configPath = path.join(dataDir, 'config.json');
  const original = await fs.readFile(configPath, 'utf8');
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const makeOrder = (id, status, statusKind) => ({ id, title: 'Pedido ' + id, status, statusKind, statusKey: id, points: 17.6, quantity: 1 });
  try {
    const config = JSON.parse(original);
    config.setup.assistantCompleted = true;
    for (const task of Object.values(config.tasks)) task.enabled = false;
    config.shopOrders = { items: [makeOrder('available','Disponible','available'), makeOrder('cancelled','Cancelado','neutral'), makeOrder('pending','Pendiente','pending')] };
    await fs.writeFile(configPath, JSON.stringify(config));
    await page.route('**/*', route => route.request().url().startsWith(baseUrl) ? route.continue() : route.abort());
    for (const pattern of ['**/api/creality/profile/refresh', '**/api/progress/refresh', '**/api/points/**']) {
      await page.route(pattern, route => route.fulfill({ json: { ok: false } }));
    }
    await page.route('**/api/shop/**', async route => {
      if (route.request().url().endsWith('/dismiss')) return route.continue();
      const status = await (await fetch(baseUrl + '/api/status')).json();
      return route.fulfill({ json: { ok: true, orders: status.config.shopOrders, products: [] } });
    });
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#creality-session-indicator').title.startsWith('Sesión:'));
    await page.locator('#points-counter').click();
    await page.locator('[data-dismiss-shop-order="available"]').waitFor();
    assert.equal(await page.locator('[data-dismiss-shop-order]').count(), 2);
    assert.match(await page.locator('.points-shop-order-price').first().innerText(), /18 puntos/);
    await page.locator('[data-dismiss-shop-order="available"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-dismiss-shop-order="available"]'));
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const hidden = saved.shopOrders.items.find(order => order.id === 'available');
    assert.equal(hidden.archived, true);
    assert.equal(hidden.points, 17.6);
    const rejected = await fetch(baseUrl + '/api/shop/orders/pending/dismiss', { method: 'PATCH' });
    assert.equal(rejected.status, 404);
    assert.equal((await rejected.json()).error, 'SHOP_ORDER_NOT_DISMISSIBLE');
    await page.reload();
    await page.locator('#points-counter').click();
    await page.locator('[data-dismiss-shop-order="cancelled"]').waitFor();
    assert.equal(await page.locator('[data-dismiss-shop-order="available"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await fs.writeFile(configPath, original);
  }
});
