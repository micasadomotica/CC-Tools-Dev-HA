import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { installChallengeHandling, browserChallengeState } from '../src/browserChallenge.js';
import { inspectCrealityPage, normalizeCaughtError } from '../src/crealityDiagnostics.js';

test('conserva el proceso, contexto, cookies y almacenamiento entre módulos y descargas', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-tools-reuse-'));
  let launches = 0;
  const sandbox = vm.createContext({ process, URL, installChallengeHandling, browserChallengeState,
    inspectCrealityPage, normalizeCaughtError,
    confirmAuthenticatedSession: async () => {},
    launchFixture: async () => {
      launches++;
      const context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
        headless: true, acceptDownloads: true,
        ...(process.platform === 'win32' ? { channel: 'chrome' } : {})
      });
      await context.route('**/*', route => {
        if (route.request().url().endsWith('/download')) {
          return route.fulfill({ contentType: 'application/octet-stream',
            headers: { 'content-disposition': 'attachment; filename="model.stl"' }, body: 'solid test\nendsolid test' });
        }
        return route.fulfill({ contentType: 'text/html',
          body: '<title>Modelo de prueba</title><p>Contenido local de prueba.</p><a href="/download">Descargar</a>' });
      });
      return context;
    }
  });
  const source = (await fs.readFile(new URL('../src/browserManager.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, sandbox);
  vm.runInContext(`launchWithRecovery = launchFixture;
    assertAuthenticatedSession = async () => ({ confirmAuthenticated: true });`, sandbox);
  t.after(async () => { await sandbox.shutdownBrowser(); await fs.rm(root, { recursive: true, force: true }); });

  const downloadScope = vm.createContext({ fs, path });
  const downloadSource = (await fs.readFile(new URL('../src/modelDownloadTask.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(downloadSource, downloadScope);
  let firstContext;
  await sandbox.withAutomationBrowser({}, async context => {
    firstContext = context;
    const page = context.pages()[0];
    await page.goto('https://www.crealitycloud.com/es/test');
    await context.addCookies([{ name: 'session_test', value: 'kept', url: page.url() }]);
    await page.evaluate(() => localStorage.setItem('session_test', 'kept'));
    await context.newPage();
  });
  assert.equal(sandbox.browserManagerState().mode, 'idle');
  assert.equal(sandbox.browserManagerState().active, true);
  assert.equal(firstContext.pages().length, 1);
  assert.equal(firstContext.pages()[0].url(), 'about:blank');

  for (const batch of ['batch-one', 'batch-two']) {
    const dir = path.join(root, batch);
    await fs.mkdir(dir);
    await sandbox.withAutomationBrowser({ acceptDownloads: true }, async context => {
      assert.equal(context, firstContext);
      const page = context.pages()[0];
      await page.goto('https://www.crealitycloud.com/es/test');
      assert.equal((await context.cookies()).find(c => c.name === 'session_test').value, 'kept');
      assert.equal(await page.evaluate(() => localStorage.getItem('session_test')), 'kept');
      const pending = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Descargar' }).click();
      const download = await pending;
      await downloadScope.persistBrowserDownload(download, dir, 'test');
      assert.equal(await fs.readFile(path.join(dir, 'model.stl'), 'utf8'), 'solid test\nendsolid test');
    });
  }
  assert.equal(launches, 1);
  await sandbox.openInteractiveBrowser('https://www.crealitycloud.com/es/test');
  assert.equal(launches, 1);
  await assert.rejects(sandbox.withAutomationBrowser({}, () => {}), { code: 'REMOTE_BROWSER_OPEN' });
  await sandbox.closeInteractiveBrowser();
  assert.equal(sandbox.browserManagerState().active, false);
});
