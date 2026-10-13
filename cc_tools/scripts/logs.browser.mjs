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
  } finally { await page.close(); }
});
