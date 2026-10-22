import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { isOwnModel } from '../src/modelOwnership.js';
import { forwardAuthenticationHeaders } from '../src/finishPrintDiscovery.js';

test('recognizes normal and repeated boost controls without consuming a ticket during discovery', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext();
  let label = '', permissions = 0;
  const observations = [];
  // Every request is fulfilled locally; no account, ticket or remote service is used.
  await context.route('**/*', async route => {
    if (route.request().url().endsWith('/api/cxy/v2/boost/checkPermission')) {
      permissions++;
      return route.fulfill({ json: { code: 0, result: { failType: 0 } } });
    }
    if (route.request().resourceType() !== 'document') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: `<button id="boost">${label}</button>
      <script>document.querySelector('#boost').onclick = () => fetch('/api/cxy/v2/boost/checkPermission', {
        method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({modelGroupId: 'model-3d-desk'})
      });</script>` });
  });
  const page = await context.newPage();
  const h = vm.createContext({ Date, console, isOwnModel, forwardAuthenticationHeaders,
    inspectCrealityPage: async () => null, readModelOwnership: async () => ({ ownerUserId: 'external' }),
    updateDesignOwnership: async () => {}, markDesignBoosted: async (id, options) => observations.push({ id, ...options })
  });
  const source = fs.readFileSync(new URL('../src/modelBoostTask.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, h);
  const design = { id: '3d-desk', url: 'https://www.crealitycloud.com/es/model-detail/3d-desk' };
  try {
    for (label of ['Impulso', 'Impulsar', 'Boost']) {
      assert.equal((await h.resolveBoostTarget(page, design, null, 'own')).modelGroupId, 'model-3d-desk');
    }
    for (label of ['Impulsar de<br>nuevo', 'Impulsar nuevamente', 'Volver a impulsar', 'Boost again', 'Boost it again']) {
      const before = permissions;
      assert.equal((await h.resolveBoostTarget(page, design, null, 'own')).alreadyBoosted, true);
      assert.equal(permissions, before);
      assert.equal(observations.at(-1).previouslyApplied, true);
      assert.equal((await h.resolveBoostTarget(page, design, null, 'own', { allowRepeat: true })).modelGroupId, 'model-3d-desk');
      assert.equal(permissions, before + 1);
    }
    label = 'No disponible';
    assert.equal(await h.resolveBoostTarget(page, design, null, 'own'), null);

    // Exercise the application's real daily-lock renderer with two available tickets.
    await page.setContent('<button id="run-boosts-now">Impulsar diseños</button><p id="boosts-daily-status"></p><button id="save-boosts-config"><span>Programar</span></button>');
    const app = fs.readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
    const start = app.indexOf('function renderBoostDailyLimit()');
    const end = app.indexOf('\nasync function runBoostsWithProgress', start);
    assert.ok(start >= 0 && end > start);
    await page.addScriptTag({ content: `const $ = selector => document.querySelector(selector);
      const state = { dailyCounters: { modelBoosts: 0 }, config: { tasks: { modelBoosts: { availableBoosts: 2 } } } };
      ${app.slice(start, end)}; renderBoostDailyLimit();` });
    assert.equal(await page.locator('#run-boosts-now').isDisabled(), false);
    assert.match(await page.locator('#boosts-daily-status').textContent(), /Boletos disponibles: 2/);
    await page.evaluate('state.dailyCounters.modelBoosts = 1; renderBoostDailyLimit();');
    assert.equal(await page.locator('#run-boosts-now').isDisabled(), true);
    assert.match(await page.locator('#boosts-daily-status').textContent(), /bloqueadas hasta mañana/);
    assert.equal(await page.locator('#save-boosts-config span').textContent(), 'Programar desde mañana');
    await page.evaluate('state.dailyCounters.modelBoosts = 0; renderBoostDailyLimit();');
    assert.equal(await page.locator('#run-boosts-now').isDisabled(), false);
    assert.equal(await page.locator('#save-boosts-config span').textContent(), 'Programar');
  } finally { await context.close(); await browser.close(); }
});
