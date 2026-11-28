import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

test('Favoritos: pregunta, seguir después, revisión independiente, quitar y cambio de cuenta', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cctools-follow-ui-'));
  process.env.CCTOOLS_DATA_DIR = dataDir;
  const { readConfig } = await import('../src/storage.js');
  const config = await readConfig();
  config.setup.assistantCompleted = true;
  config.crealityProfile = { userId: '100', name: 'Cuenta de prueba', updatedAt: new Date().toISOString() };
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(publicDir, relative);
      if (!file.startsWith(publicDir)) { res.writeHead(403).end(); return; }
      const body = await fs.readFile(file);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1180, height: 950 } });
    const errors = [], mutations = [];
    let job = { running: false }, polls = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
      let response = { ok: false };
      if (request.method() !== 'GET') mutations.push({ endpoint, method: request.method() });
      if (endpoint === '/api/status') response = { ok: true, config, browser: { mode: 'idle' }, scheduler: { running: false }, favoriteFollowing: job };
      if (endpoint === '/api/creality/favorites' && request.method() === 'POST') {
        const userId = request.postDataJSON().url.match(/user\/(\d+)/)[1];
        config.crealityFavorites.push({ userId, name: `Autor ${userId}`, profileUrl: `https://www.crealitycloud.com/es/user/${userId}`, indexStatus: 'ready', indexedModelCount: 8 });
        response = { ok: true, favorites: config.crealityFavorites, userId };
      }
      if (endpoint.endsWith('/follow')) {
        job = { running: true, kind: 'follow', userId: endpoint.split('/').at(-2), total: 1, completed: 0 };
        response = { ok: true, job };
      }
      if (endpoint === '/api/creality/favorites/following/refresh') {
        job = { running: true, kind: 'review', total: config.crealityFavorites.length, completed: 0 };
        response = { ok: true, job };
      }
      if (endpoint === '/api/creality/favorites/following') {
        polls++;
        response = { ok: true, job, following: config.crealityFavoriteFollowing };
      }
      if (endpoint === '/api/creality/favorites/refresh') response = { ok: true, favorites: config.crealityFavorites };
      if (request.method() === 'DELETE') {
        config.crealityFavorites = config.crealityFavorites.filter(p => p.userId !== endpoint.split('/').at(-1));
        response = { ok: true, favorites: config.crealityFavorites };
      }
      await route.fulfill({ json: response });
    });
    const open = async () => {
      await page.goto(base);
      await page.locator('#creality-user-avatar').click();
      await page.locator('#creality-menu-settings').click();
      await page.locator('[data-tab="favorites"]').click();
    };
    const card = id => page.locator('.favorite-profile-card').filter({ has: page.locator(`a[href$="/user/${id}"]`) });
    const add = async (id, follow) => {
      page.once('dialog', async dialog => {
        assert.match(dialog.message(), /seguirlo también/);
        await (follow ? dialog.accept() : dialog.dismiss());
      });
      await page.locator('#favorite-profile-url').fill(`https://www.crealitycloud.com/es/user/${id}/model`);
      await page.locator('#add-favorite-profile').click();
      await card(id).waitFor();
    };
    const finish = (id, status = 'following') => {
      config.crealityFavoriteFollowing[id] = { accountUserId: '100', status, checkedAt: new Date().toISOString(), error: '' };
      job = { ...job, running: false, completed: job.total, errors: 0 };
    };
    await open();
    await add('200', false);
    assert.equal(mutations.filter(x => x.endpoint.endsWith('/follow')).length, 0);
    assert.match(await card('200').innerText(), /Sin comprobar/);
    await add('201', true);
    await page.waitForFunction(() => document.querySelector('#review-favorite-following').disabled);
    assert.equal(await card('201').getByText('Seguido', { exact: true }).count(), 0);
    assert.equal(await card('200').getByRole('button', { name: 'Seguir a Autor 200' }).isDisabled(), true);
    finish('201');
    await card('201').getByText('Seguido', { exact: true }).waitFor();
    assert.equal(mutations.filter(x => x.endpoint.endsWith('/follow')).length, 1);
    await card('200').getByRole('button', { name: 'Seguir a Autor 200' }).click();
    await page.waitForFunction(() => document.querySelector('#review-favorite-following').disabled);
    finish('200');
    await card('200').getByText('Seguido', { exact: true }).waitFor();
    const beforeReview = mutations.filter(x => x.endpoint.endsWith('/follow')).length;
    await page.locator('#review-favorite-following').click();
    await page.waitForFunction(() => document.querySelector('#review-favorite-following').disabled);
    finish('200', 'not_following');
    await card('200').getByText('No seguido', { exact: true }).waitFor();
    assert.equal(mutations.filter(x => x.endpoint.endsWith('/follow')).length, beforeReview);

    const beforeDesignUpdate = polls;
    await page.locator('#refresh-favorite-profiles').click();
    await page.waitForFunction(() => !document.querySelector('#refresh-favorite-profiles').disabled);
    assert.equal(polls, beforeDesignUpdate, 'actualizar diseños no comprueba seguimiento');
    await card('201').getByRole('button', { name: 'Eliminar Autor 201 de favoritos' }).click();
    await card('201').waitFor({ state: 'detached' });
    assert.equal(config.crealityFavoriteFollowing['201'].status, 'following');
    assert.equal(mutations.filter(x => x.endpoint.endsWith('/follow')).length, beforeReview);
    assert.equal(mutations.some(x => /unfollow/.test(x.endpoint)), false);

    if (process.env.CCTOOLS_TEST_SCREENSHOT_DIR) {
      const dir = process.env.CCTOOLS_TEST_SCREENSHOT_DIR;
      await fs.mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'favorite-follow-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(dir, 'favorite-follow-mobile.png'), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    config.crealityFavoriteFollowing['200'].status = 'following';
    config.crealityProfile.userId = '999';
    await open();
    assert.equal(await card('200').getByText('Seguido', { exact: true }).count(), 0);
    assert.match(await card('200').innerText(), /Sin comprobar/);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir()));
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
