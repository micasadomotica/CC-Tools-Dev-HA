import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { installChallengeHandling, browserChallengeState, challengeEvents, challengeClock } from '../src/browserChallenge.js';
import { inspectCrealityPage, observeCrealityPage } from '../src/crealityDiagnostics.js';
import { executeWithTimeout } from '../src/scheduler.js';
import { withIsolatedBrowser } from '../src/browserManager.js';
import fs from 'node:fs';
import vm from 'node:vm';
import { captureCommentFeed } from '../src/commentFeed.js';
import { isOwnModel } from '../src/modelOwnership.js';

const target = 'https://www.crealitycloud.com/es/model-detail/local-test';
const readyHtml = '<title>Modelo de prueba | Creality Cloud</title><h1>Modelo de prueba</h1><p>Ficha disponible con archivos y descripción del modelo de prueba.</p>';
const challengeHtml = '<title>Un momento…</title><form id="challenge-form"><p>Verificación de seguridad en curso</p><button type="button" onclick="location.reload()">Resolver prueba local</button></form>';

async function fixture(t, options = {}) {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext();
  t.after(() => browser.close());
  const state = { solved: false, requests: 0, enabled: true };
  await context.route('**/*', async route => {
    state.requests++;
    await route.fulfill({ status: state.solved ? 200 : 429,
      contentType: 'text/html', body: state.solved ? readyHtml : challengeHtml,
      headers: state.solved ? {} : { 'cf-mitigated': 'challenge' } });
  });
  installChallengeHandling(context, { inspect: inspectCrealityPage, enabled: () => state.enabled,
    pollMs: 15, manualAfterMs: 25, timeoutMs: 5000, ...options });
  const page = await context.newPage();
  return { browser, context, page, state };
}

async function manualSignal() {
  while (true) {
    const [state] = await once(challengeEvents, 'change');
    if (state.phase === 'manual') return state;
  }
}

test('mantiene ventana y perfil, espera la intervención y continúa una sola vez', async t => {
  const { page, context, state } = await fixture(t);
  await context.addCookies([{ name: 'test_session', value: 'preserved', url: target }]);
  const observer = observeCrealityPage(page, 'fixture');
  const manual = manualSignal();
  let actions = 0;
  const task = page.goto(target).then(() => { actions++; });
  const notice = await manual;
  assert.equal(actions, 0);
  assert.equal(page.isClosed(), false);
  assert.equal(browserChallengeState().active, true);
  await assert.rejects(withIsolatedBrowser({}, () => assert.fail('No debe abrir otro navegador')), { code: 'BROWSER_BUSY' });
  assert.equal(notice.url, target);
  state.solved = true;
  await page.getByRole('button', { name: 'Resolver prueba local' }).click();
  await task;
  assert.equal(actions, 1);
  assert.equal(state.requests, 2);
  assert.equal((await context.cookies()).find(c => c.name === 'test_session').value, 'preserved');
  assert.equal(await inspectCrealityPage(page, observer), null, 'el 429 anterior no contamina el documento resuelto');
  assert.equal(browserChallengeState().active, false);
  observer.stop();
});

test('continúa cuando la página resuelve sola la verificación sin pulsar controles', async t => {
  const { page, context, state } = await fixture(t, { manualAfterMs: 2000 });
  await context.unroute('**/*');
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body:
    challengeHtml + `<script>setTimeout(() => { document.title = 'Creality Cloud'; document.body.innerHTML = ${JSON.stringify(readyHtml)}; }, 120)</script>` }));
  let actions = 0;
  await page.goto(target);
  actions++;
  assert.equal(actions, 1);
  assert.equal(browserChallengeState().active, false);
});

test('una página distinta no reanuda la tarea y el vencimiento libera el bloqueo', async t => {
  const { page, state } = await fixture(t, { timeoutMs: 550 });
  const manual = manualSignal();
  const task = assert.rejects(page.goto(target), { code: 'SECURITY_CHALLENGE_TIMEOUT' });
  await manual;
  state.solved = true;
  await page.evaluate(() => { location.href = '/es/otra-pagina'; });
  await task;
  assert.equal(browserChallengeState().active, false);
});

test('cerrar la pestaña cancela la espera sin ejecutar la acción', async t => {
  const { page } = await fixture(t);
  const manual = manualSignal();
  let acted = false;
  const task = assert.rejects(page.goto(target).then(() => { acted = true; }));
  await manual;
  await page.close();
  await task;
  assert.equal(acted, false);
  assert.equal(browserChallengeState().active, false);
});

test('una página de error tras la verificación no reanuda la acción', async t => {
  const { page, context } = await fixture(t);
  const manual = manualSignal();
  let acted = false;
  const task = assert.rejects(page.goto(target).then(() => { acted = true; }), { code: 'CREALITY_HTTP_ERROR' });
  await manual;
  await context.unroute('**/*');
  await context.route('**/*', route => route.fulfill({ status: 503, contentType: 'text/html',
    body: '<title>Servicio no disponible</title><p>El servicio no puede atender la petición en este momento. Inténtalo más tarde.</p>' }));
  await page.getByRole('button').click();
  await task;
  assert.equal(acted, false);
  assert.equal(browserChallengeState().active, false);
});

test('el watchdog excluye el tiempo de intervención y vuelve a controlar la ejecución', async t => {
  const { page, state } = await fixture(t);
  const manual = manualSignal();
  const navigation = page.goto(target);
  await manual;
  const initialClock = challengeClock();
  let timedOut = false;
  const task = executeWithTimeout(navigation, { timeoutMs: 350, onTimeout: () => { timedOut = true; } });
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(timedOut, false);
  state.solved = true;
  await page.getByRole('button').click();
  await task;
  assert.ok(challengeClock() - initialClock >= 450);
  await assert.rejects(executeWithTimeout(new Promise(() => {}), { timeoutMs: 10 }), { code: 'TASK_EXECUTION_TIMEOUT' });
});

test('comentarios conserva el historial tras más de 15 segundos de verificación y evita duplicados', async t => {
  const { page, context, state } = await fixture(t, { timeoutMs: 25000 });
  await context.unroute('**/*');
  let posted = 0;
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.url().includes('/api/cxy/comment/postComment')) {
      posted++;
      return route.fulfill({ json: { code: 0 } });
    }
    if (request.url().includes('/api/cxy/comment/modelFeedList')) {
      return route.fulfill({ json: { code: 0, result: { count: 1, list: [
        { comment: { id: 'existing-comment', userId: 'current-user', createTime: 1790422091 } }
      ] } } });
    }
    return route.fulfill({ status: state.solved ? 200 : 429, contentType: 'text/html',
      headers: state.solved ? {} : { 'cf-mitigated': 'challenge' },
      body: state.solved ? readyHtml + `<script>
        fetch('/api/cxy/comment/modelFeedList', { method: 'POST', headers: {'content-type':'application/json'},
          body: JSON.stringify({modelGroupId:'fixture-model',page:1,pageSize:10}) });
      </script>` : challengeHtml });
  });
  const marked = [];
  const sandbox = vm.createContext({ Date, captureCommentFeed, isOwnModel,
    readDesigns: async () => [{ id: 'fixture-model', url: target, downloadVerified: true }],
    readRuns: async () => [],
    withAutomationBrowser: async (_options, callback) => callback(context),
    observeCrealityPage, inspectCrealityPage,
    readIncentiveProgress: async () => ({ found: true, completed: false }),
    readModelOwnership: async () => ({ ownerUserId: 'another-author' }),
    updateDesignOwnership: async () => null,
    markDesignCommented: async (id, evidence) => { marked.push({ id, ...evidence }); },
    diagnoseTaskError: async error => { throw error; }
  });
  const source = fs.readFileSync(new URL('../src/modelCommentTask.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, sandbox);
  const manual = manualSignal();
  const task = sandbox.runModelComment({ textDailyLimit: 1, prioritizeFavorites: false,
    comments: [{ id: 'text-1', text: 'Comentario de prueba' }] }, { ownUserId: 'current-user' });
  await manual;
  await new Promise(resolve => setTimeout(resolve, 15500));
  assert.equal(marked.length, 0);
  state.solved = true;
  await page.getByRole('button', { name: 'Resolver prueba local' }).click();
  const result = await task;
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.match(result.message, /ya tenían un comentario/);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].actionState, 'already_applied');
  assert.equal(posted, 0);
  assert.equal(page.listenerCount('request'), 0, 'libera la captura al omitir el diseño');
});
