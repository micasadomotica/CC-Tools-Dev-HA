import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { launchExternalChromium, externalConnectionDiagnostics } from '../src/externalChromium.js';
import { installChallengeHandling, browserChallengeState } from '../src/browserChallenge.js';
import { inspectCrealityPage, normalizeCaughtError } from '../src/crealityDiagnostics.js';
import { bindBrowserDiagnostics, recordBrowserLifecycle } from '../src/browserLifecycle.js';
import { browserDiagnosticJournal } from '../src/browserDiagnosticJournal.js';
import { recordCookieDiagnostics, withCookieDiagnostics, cookieDiagnosticsSnapshot } from '../src/cookieDiagnostics.js';

for (const mode of ['standard', 'external-cdp']) {
test(`${mode}: conserva el proceso, contexto, cookies y almacenamiento entre módulos y descargas`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-tools-reuse-'));
  let launches = 0;
  const sandbox = vm.createContext({ process, URL, fs, path, chromium, setTimeout, clearTimeout,
    browserSessionDir: () => root, installChallengeHandling, browserChallengeState,
    recordCookieDiagnostics, bindBrowserDiagnostics, recordBrowserLifecycle, externalConnectionDiagnostics,
    inspectCrealityPage, normalizeCaughtError,
    confirmAuthenticatedSession: async () => {},
    launchFixture: async (profile = path.join(root, 'profile'), _options = {}, onExit = () => {}) => {
      launches++;
      if (typeof profile !== 'string') profile = path.join(root, 'profile');
      const context = mode === 'external-cdp' ? await launchExternalChromium(profile, {
        executablePath: process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined
      }, onExit) : await chromium.launchPersistentContext(profile, {
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
  vm.runInContext(`${mode === 'external-cdp' ? 'launchExternalChromium' : 'launchWithRecovery'} = launchFixture;
    assertAuthenticatedSession = async () => ({ confirmAuthenticated: true });`, sandbox);
  t.after(async () => { await sandbox.shutdownBrowser(); await fs.rm(root, { recursive: true, force: true }); });
  await sandbox.setBrowserConnectionMode(mode);

  const downloadScope = vm.createContext({ fs, path });
  const downloadSource = (await fs.readFile(new URL('../src/modelDownloadTask.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(downloadSource, downloadScope);
  let firstContext;
  const firstTrace = await withCookieDiagnostics('comments', async () => {
    await sandbox.withAutomationBrowser({}, async context => {
      firstContext = context;
      const page = context.pages()[0];
      await page.goto('https://www.crealitycloud.com/es/test');
      await context.addCookies([{ name: 'session_test', value: 'kept', url: page.url() }]);
      await context.addCookies([{ name: 'cf_clearance', value: 'PRIVATE_TEST_CLEARANCE', url: page.url(),
        expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: true }]);
      await page.evaluate(() => localStorage.setItem('session_test', 'kept'));
      await context.newPage();
    });
    return cookieDiagnosticsSnapshot();
  });
  assert.equal(firstTrace.events.find(e => e.phase === 'module_start').clearancePresent, false);
  assert.equal(firstTrace.events.find(e => e.phase === 'module_end').clearancePresent, true);
  assert.equal(sandbox.browserManagerState().mode, 'idle');
  assert.equal(sandbox.browserManagerState().active, true);
  assert.equal(sandbox.browserManagerState().environment.webdriver, mode !== 'external-cdp');
  assert.equal(firstContext.pages().length, 1);
  assert.equal(firstContext.pages()[0].url(), 'about:blank');

  for (const batch of ['batch-one', 'batch-two']) {
    const dir = path.join(root, batch);
    await fs.mkdir(dir);
    const nextTrace = await withCookieDiagnostics('modelDownloads', async () => {
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
      return cookieDiagnosticsSnapshot();
    });
    const start = nextTrace.events.find(e => e.phase === 'module_start');
    assert.equal(start.clearancePresent, true);
    assert.equal(start.sameContext, true);
    assert.equal(start.sameMetadata, true);
    assert.equal(start.reused, true);
    assert.equal(start.contextId, firstTrace.events[0].contextId);
    assert.equal(JSON.stringify(nextTrace).includes('PRIVATE_TEST_CLEARANCE'), false);
  }
  assert.equal(launches, 1);
  await sandbox.openInteractiveBrowser('https://www.crealitycloud.com/es/test');
  assert.equal(launches, 1);
  await assert.rejects(sandbox.withAutomationBrowser({}, () => {}), { code: 'REMOTE_BROWSER_OPEN' });
  await sandbox.closeInteractiveBrowser();
  assert.equal(sandbox.browserManagerState().active, false);
  const reopened = await withCookieDiagnostics('makeNow', async () => {
    await sandbox.withAutomationBrowser({}, async context => {
      assert.notEqual(context, firstContext);
    });
    return cookieDiagnosticsSnapshot();
  });
  const restarted = reopened.events.find(e => e.phase === 'module_start');
  assert.equal(launches, 2);
  assert.equal(restarted.clearancePresent, true, 'la cookie persistente sobrevive al cierre del perfil');
  assert.equal(restarted.reused, false);
  assert.equal(restarted.sameContext, false);
  assert.equal(restarted.sameMetadata, true);
  assert.equal(JSON.stringify(reopened).includes('PRIVATE_TEST_CLEARANCE'), false);
  const journal = browserDiagnosticJournal.snapshot();
  const manualClose = journal.events.find(e => e.phase === 'context_closed' && e.reason === 'manual_close'
    && e.contextId === firstTrace.events[0].contextId);
  assert.equal(manualClose.contextId, firstTrace.events[0].contextId);
  assert.equal(manualClose.requested, true);
  assert.equal(JSON.stringify(journal).includes('PRIVATE_TEST_CLEARANCE'), false);
  const externalClose = await withCookieDiagnostics('comments', async () => {
    await sandbox.withAutomationBrowser({}, context => context.close());
    return cookieDiagnosticsSnapshot();
  });
  assert.equal(externalClose.events.at(-1).phase, 'module_end');
  assert.equal(externalClose.events.at(-1).readStatus, 'unavailable');
  assert.ok(browserDiagnosticJournal.snapshot().events.some(e => e.traceId === externalClose.traceId
    && e.phase === 'context_closed' && e.reason === 'unrequested_close'));
});
}
