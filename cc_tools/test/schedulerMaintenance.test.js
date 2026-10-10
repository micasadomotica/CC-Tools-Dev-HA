import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeCaughtError } from '../src/crealityDiagnostics.js';
import { countTodayComments, buildCommentKindPlan } from '../src/modelCommentTask.js';
import { isFinishPrintStartRun } from '../src/finishPrintSelection.js';
import { markShopOrdersRefreshError } from '../src/shopOrdersState.js';

function harness() {
  const state = { reservations: 0, launches: 0, aborts: 0, writes: 0, runs: [], waiting: false };
  const config = { setup: { assistantCompleted: true }, telegram: { enabled: false },
    tasks: { modelBoosts: { enabled: true, timezone: 'Europe/Madrid' } },
    shopGoal: { enabled: true, productId: 'test', points: 1 }, points: { total: 2 }, shopOrders: {} };
  const pending = () => new Promise(() => {});
  const operation = () => { state.launches++; return pending(); };
  const context = vm.createContext({ Date, Error, Promise, AbortController, setTimeout, clearTimeout, process,
    console: { log() {}, warn() {}, error() {} }, normalizeCaughtError, countTodayComments, buildCommentKindPlan,
    isFinishPrintStartRun, markShopOrdersRefreshError,
    pauseProgressSync: () => { state.reservations++; return () => { state.reservations--; }; },
    waitForProgressSync: async () => { if (state.waiting) await pending(); },
    abortAutomationBrowser: async () => { state.aborts++; },
    writeConfig: async () => { state.writes++; },
    appendRun: async run => { state.runs.push(run); },
    diagnoseTaskError: async (_error, _page, _observer, fallback) => fallback,
    shopOrdersRefreshDue: () => true,
    checkModelBoostAvailability: operation, readShopOrders: operation, redeemShopGoal: operation });
  const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  vm.runInContext('taskExecutionTimeoutMs = () => 30;', context);
  return { state, config, context };
}

for (const name of ['refreshDailyBoostAvailability', 'refreshScheduledShopOrders', 'redeemScheduledShopGoal']) {
  for (const waiting of [false, true]) {
    test(`${name}: libera el bloqueo al agotar el tiempo ${waiting ? 'esperando la sincronización' : 'consultando la web'}`, async () => {
      const h = harness();
      h.state.waiting = waiting;
      const run = h.context[name](h.config);
      assert.equal(h.context.schedulerState().running, true);
      assert.equal(h.state.reservations, 1);
      await run;
      assert.equal(h.state.launches, waiting ? 0 : 1);
      assert.equal(h.state.aborts, 1);
      assert.equal(h.state.reservations, 0);
      assert.equal(h.context.schedulerState().running, false);
      assert.equal(h.state.writes, name === 'redeemScheduledShopGoal' ? 2 : 1);
      if (name === 'refreshDailyBoostAvailability') assert.ok(Date.parse(h.config.tasks.modelBoosts.availabilityRetryAt) > Date.now());
      if (name === 'redeemScheduledShopGoal') {
        assert.equal(h.state.runs[0].details.diagnostics[0].code, 'TASK_EXECUTION_TIMEOUT');
        assert.equal(h.config.shopGoal.enabled, false);
        assert.equal(h.config.shopGoal.lastStatus, 'paused');
      }
    });
  }
}

test('recuperar una ejecución caducada libera su reserva y no permite que su limpieza borre otra nueva', async () => {
  const h = harness();
  const old = h.context.beginSchedulerRun('makeNow', 'schedule', 1, new Date(Date.now() - 1000));
  const signal = vm.runInContext('runningAbortController.signal', h.context);
  assert.equal(await h.context.recoverExpiredSchedulerRun(), true);
  assert.equal(signal.aborted, true);
  assert.equal(h.state.reservations, 0);
  const current = h.context.beginSchedulerRun('creality', 'manual', 60000);
  assert.equal(h.context.releaseSchedulerRun(old), false);
  assert.equal(h.context.schedulerState().runningTask, 'creality');
  assert.equal(h.state.reservations, 1);
  assert.throws(() => h.context.beginSchedulerRun('modelBoosts', 'availability-refresh', 60000), { code: 'TASK_ALREADY_RUNNING' });
  assert.equal(h.context.releaseSchedulerRun(current), true);
  assert.equal(h.state.reservations, 0);
});

test('los Logs de aplazamiento no consumen comentarios, descargas ni impresiones ni aparecen como ejecuciones en la agenda', () => {
  const h = harness();
  const now = new Date();
  const date = h.context.dayKey('Europe/Madrid', now);
  const runs = ['comments', 'modelDownloads', 'finishPrint'].map(taskId => ({ taskId, source: 'schedule',
    status: 'skipped', finishedAt: now.toISOString(), details: { deferredServiceFailure: true } }));
  const plan = [new Date(now.getTime() + 600000).toISOString()];
  const task = { timezone: 'Europe/Madrid', commentPlanDate: date, commentPlan: plan,
    commentKindPlan: ['text'], commentPlanCursor: 0, imageDailyLimit: 0, textDailyLimit: 1, nextRunAt: plan[0] };
  h.context.ensureCommentPlan(task, runs, now);
  assert.equal(task.commentPlanCursor, 0);
  assert.equal(task.commentPlanDoneCount, 0);
  assert.equal(task.nextRunAt, plan[0]);
  assert.equal(h.context.countTodayDownloadAttempts(runs, task), 0);
  assert.equal(h.context.countTodayFinishPrintAttempts(runs, task), 0);
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  for (const name of ['todayCommentEvents', 'todayDownloadEvents']) {
    const start = server.indexOf(`function ${name}(`);
    const end = server.indexOf('\nfunction ', start + 1);
    vm.runInContext(server.slice(start, end), h.context);
    assert.equal(h.context[name](runs, task).length, 0);
  }
});

test('un watchdog antiguo no cierra el navegador de una nueva ejecución', async () => {
  const h = harness();
  const old = h.context.beginSchedulerRun('modelBoosts', 'availability-refresh', 20);
  const pending = h.context.executeMaintenanceWithTimeout(() => new Promise(() => {}), { timeoutMs: 20 });
  const rejected = assert.rejects(pending, { code: 'TASK_EXECUTION_TIMEOUT' });
  h.context.releaseSchedulerRun(old);
  const current = h.context.beginSchedulerRun('makeNow', 'schedule', 60000);
  await rejected;
  assert.equal(h.state.aborts, 0);
  assert.equal(h.context.schedulerState().runningTask, 'makeNow');
  assert.equal(h.state.reservations, 1);
  h.context.releaseSchedulerRun(current);
});
