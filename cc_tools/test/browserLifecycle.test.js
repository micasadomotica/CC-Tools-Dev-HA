import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { bindBrowserDiagnostics, recordBrowserLifecycle } from '../src/browserLifecycle.js';
import { browserDiagnosticJournal } from '../src/browserDiagnosticJournal.js';
import { withBrowserTrace, browserTraceScope } from '../src/browserTrace.js';
const traceSnapshot = () => ({ ...browserTraceScope(), events: browserDiagnosticJournal.snapshot().events.filter(e => e.traceId === browserTraceScope().traceId) });

function harness(t) {
  t.mock.method(console, 'log', () => {});
  const contexts = [];
  const fixture = () => {
    const context = new EventEmitter(), browser = new EventEmitter();
    let closed = false, pages = [];
    browser.version = () => 'test';
    context.browser = () => browser;
    context.pages = () => [...pages];
    context.cookies = async () => { if (closed) throw Error('PRIVATE_ERROR'); return []; };
    context.newPage = async () => {
      const page = new EventEmitter();
      page.close = async () => { pages = pages.filter(p => p !== page); page.emit('close'); };
      page.goto = async () => {};
      page.url = () => 'https://www.crealitycloud.com/';
      pages.push(page); context.emit('page', page); return page;
    };
    context.close = async () => {
      if (closed) return; closed = true;
      for (const page of [...pages]) await page.close();
      context.emit('close'); browser.emit('disconnected');
    };
    contexts.push(context); return context;
  };
  const sandbox = vm.createContext({ process, URL,
    bindBrowserDiagnostics, recordBrowserLifecycle,
    installChallengeHandling: () => {}, browserChallengeState: () => ({ active: false }),
    inspectCrealityPage: async () => null, normalizeCaughtError: error => error,
    confirmAuthenticatedSession: async () => {}, launchFixture: async () => {
      const context = fixture(); await context.newPage(); return context;
    } });
  const source = fs.readFileSync(new URL('../src/browserManager.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, sandbox);
  vm.runInContext('launchWithRecovery = launchFixture; assertAuthenticatedSession = async () => ({});', sandbox);
  t.after(() => sandbox.shutdownBrowser());
  return { sandbox, contexts };
}

test('el cierre inesperado conserva la pérdida de reserva en el diagnóstico', async t => {
  const { sandbox } = harness(t);
  const trace = await withBrowserTrace('modelDownloads', async () => {
    await sandbox.withAutomationBrowser({}, async context => { await context.close(); });
    return traceSnapshot();
  });
  const events = browserDiagnosticJournal.snapshot().events.filter(e => e.traceId === trace.traceId);
  assert.ok(events.some(e => e.phase === 'context_closed' && e.reason === 'unrequested_close' && e.requested === false));
  assert.ok(events.some(e => e.phase === 'module_lease_lost'));
  assert.equal(events.some(e => e.phase === 'context_close_requested'), false);
  assert.equal(JSON.stringify(events).includes('PRIVATE_ERROR'), false);
});

test('los cierres entre tareas mantienen origen y contexto sin atribuirlos a la tarea siguiente', async t => {
  const { sandbox } = harness(t);
  const first = await withBrowserTrace('comments', async () => {
    await sandbox.withAutomationBrowser({}, async () => {});
    return traceSnapshot();
  });
  await sandbox.closeInteractiveBrowser();
  const second = await withBrowserTrace('makeNow', async () => {
    await sandbox.withAutomationBrowser({}, async () => {});
    return traceSnapshot();
  });
  const events = browserDiagnosticJournal.snapshot().events;
  const close = events.find(e => e.traceId === first.traceId && e.phase === 'context_closed');
  assert.equal(close.reason, 'task_completed');
  assert.equal(close.source, 'automation');
  assert.equal(close.requested, true);
  assert.notEqual(first.events[0].contextId, second.events[0].contextId);
  assert.equal(second.events.some(e => e.phase === 'context_before_close'), false);
});

test('no permite otra tarea mientras el proceso anterior está cerrando el perfil', async t => {
  const { sandbox } = harness(t);
  let closing, finish;
  const entered = new Promise(resolve => { closing = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  const task = sandbox.withAutomationBrowser({}, async context => {
    const close = context.close;
    context.close = async () => { closing(); await gate; await close(); };
  });
  await entered;
  await assert.rejects(sandbox.withAutomationBrowser({}, async () => {}), { code: 'BROWSER_BUSY' });
  finish(); await task;
  assert.equal(sandbox.browserManagerState().active, false);
  await sandbox.withAutomationBrowser({}, async () => {});
});

test('identifica cambios de opciones y verificaciones de sesión sin registrar sus valores', async t => {
  const { sandbox } = harness(t);
  await sandbox.withAutomationBrowser({}, async () => {});
  const before = browserDiagnosticJournal.snapshot().events.at(-1).sequence;
  await sandbox.withAutomationBrowser({ locale: 'PRIVATE_OPTION', diagnosticSource: 'progress_sync' }, async () => {});
  const events = browserDiagnosticJournal.snapshot().events.filter(e => e.sequence > before);
  const close = events.find(e => e.phase === 'context_close_requested');
  assert.equal(close.reason, 'task_completed');
  assert.equal(close.changedOptions, undefined);
  assert.equal(close.source, 'progress_sync');
  assert.equal(events.find(e => e.phase === 'context_created').contextId, close.contextId);
  assert.equal(JSON.stringify(events).includes('PRIVATE_OPTION'), false);
});

for (const reason of ['task_timeout', 'maintenance_timeout', 'task_cancelled', 'verification_cancelled', 'stale_task_timeout']) {
  test(`identifica la cancelación ${reason}`, async t => {
    const { sandbox } = harness(t);
    const trace = await withBrowserTrace('comments', async () => {
      await sandbox.withAutomationBrowser({}, async () => sandbox.abortAutomationBrowser(reason));
      return traceSnapshot();
    });
    const events = browserDiagnosticJournal.snapshot().events.filter(e => e.traceId === trace.traceId);
    assert.equal(events.find(e => e.phase === 'context_closed').reason, reason);
  });
}

test('un reinicio por página cerrada enlaza los contextos y termina en el nuevo contexto', async t => {
  const { sandbox } = harness(t);
  const trace = await withBrowserTrace('modelDownloads', async () => {
    await sandbox.withAutomationBrowser({}, async () => {
      const replacement = await sandbox.restartAutomationBrowser({}, 'download_page_closed');
      await replacement.close();
    });
    return traceSnapshot();
  });
  const events = browserDiagnosticJournal.snapshot().events.filter(e => e.traceId === trace.traceId);
  const replacement = events.find(e => e.phase === 'context_replacement');
  assert.equal(replacement.relatedContextId, trace.events[0].contextId);
  assert.equal(replacement.contextId, trace.events.at(-1).contextId);
  assert.notEqual(replacement.contextId, replacement.relatedContextId);
});

test('el registro descarta texto libre, URLs, opciones desconocidas y errores', t => {
  t.mock.method(console, 'log', () => {});
  const event = recordBrowserLifecycle({}, 'context_closed', { reason: 'PRIVATE_VALUE', source: 'PRIVATE_VALUE',
    error: 'PRIVATE_VALUE', url: 'PRIVATE_VALUE', changedOptions: ['PRIVATE_VALUE'] });
  assert.equal(JSON.stringify(event).includes('PRIVATE_VALUE'), false);
});

test('el diagnóstico de entorno y proceso solo acepta metadatos permitidos', () => {
  const event = recordBrowserLifecycle({}, 'browser_environment', { reason: 'environment_probe',
    connectionMode: 'external-cdp', browserVersion: '153.0.0.0', webdriver: false, webdriverBeforeConnect: false,
    cookie: 'PRIVATE_VALUE', headers: 'PRIVATE_VALUE' });
  assert.equal(event.webdriver, false); assert.equal(event.webdriverBeforeConnect, false);
  assert.equal(event.browserVersion, '153.0.0.0'); assert.equal(event.connectionMode, 'external-cdp');
  assert.equal(JSON.stringify(event).includes('PRIVATE_VALUE'), false);
  const invalid = recordBrowserLifecycle({}, 'process_exited', { reason: 'process_exit',
    browserVersion: 'PRIVATE_VALUE', signal: 'PRIVATE_VALUE', exitCode: 0, pid: 123 });
  assert.equal(invalid.exitCode, 0); assert.equal(JSON.stringify(invalid).includes('PRIVATE_VALUE'), false);
});
