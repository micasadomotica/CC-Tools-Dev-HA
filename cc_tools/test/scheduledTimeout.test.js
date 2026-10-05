import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { activateFinishPrintProfile, activateNextFinishPrintProfile, normalizeFinishPrintProfiles, syncActiveFinishPrintProfile } from '../src/finishPrintProfiles.js';
import { isFinishPrintStartRun } from '../src/finishPrintSelection.js';

// Exercise the scheduler's error path without a live browser, account or Telegram.
function harness(code = 'TASK_EXECUTION_TIMEOUT') {
  const now = Date.now();
  const task = {
    activePrinterProfileId: 'printer-1',
    printerProfiles: [{
      id: 'printer-1', printerName: 'Test printer', dailyLimit: 3,
      printPlan: [now - 60000, now, now + 1200000].map(time => new Date(time).toISOString()),
      printPlanCursor: 1, printPlanDoneCount: 1, nextRunAt: new Date(now).toISOString()
    }]
  };
  activateFinishPrintProfile(task, 'printer-1');
  const config = { tasks: { finishPrint: task }, automationHealth: { state: 'active' } };
  const state = { runs: [], notifications: [], healthUpdates: 0, released: false };
  const error = Object.assign(new Error('Tiempo de ejecución agotado'), { code });
  const context = vm.createContext({
    Date, Promise, AbortController, setTimeout, clearTimeout, process,
    console: { log() {}, error() {} },
    pauseProgressSync: () => () => { state.released = true; },
    waitForProgressSync: async () => {},
    readConfig: async () => config, writeConfig: async () => {},
    appendRun: async run => state.runs.push(run),
    diagnoseTaskError: async (_error, _page, _observer, details) => details,
    activateFinishPrintProfile, activateNextFinishPrintProfile,
    normalizeFinishPrintProfiles, syncActiveFinishPrintProfile,
    executeFixture: async () => { throw error; },
    notifyFixture: async (...args) => state.notifications.push(args),
    healthFixture: () => { state.healthUpdates++; return {}; }
  });
  const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  vm.runInContext(`
    executePendingTask = executeFixture;
    notifyTaskResult = notifyFixture;
    updateAutomationHealth = healthFixture;
    updateNextRunAfterExecution = () => {};
  `, context);
  return { context, config, state, error, now };
}

test('un timeout programado conserva el diagnóstico y aplaza la impresión sin consumir el plan ni alertar', async () => {
  const h = harness();
  const originalPlan = [...h.config.tasks.finishPrint.printPlan];
  const result = await h.context.runTaskNow('finishPrint', 'schedule');
  assert.equal(result.status, 'skipped');
  assert.match(result.message, /Se reintentará automáticamente/);
  assert.equal(h.state.runs.length, 1);
  assert.equal(h.state.runs[0].status, 'skipped');
  assert.equal(h.state.runs[0].details.diagnostics[0].code, 'TASK_EXECUTION_TIMEOUT');
  assert.equal(isFinishPrintStartRun(h.state.runs[0]), false);
  const task = h.config.tasks.finishPrint;
  assert.equal(task.lastStatus, 'skipped');
  assert.equal(task.printPlanCursor, 1);
  assert.equal(task.printPlanDoneCount, 1);
  assert.equal(task.printPlan[0], originalPlan[0]);
  assert.ok(Date.parse(task.nextRunAt) >= h.now + 10 * 60000);
  assert.equal(Date.parse(task.printPlan[2]) - Date.parse(task.printPlan[1]), 1200000);
  assert.equal(task.printerProfiles[0].nextRunAt, task.nextRunAt);
  assert.equal(task.printerProfiles[0].printPlanCursor, 1);
  assert.equal(h.state.notifications.length, 0);
  assert.equal(h.state.healthUpdates, 0);
  assert.equal(h.context.schedulerState().running, false);
  assert.equal(h.state.released, true);
});

for (const [source, code] of [['manual', 'TASK_EXECUTION_TIMEOUT'], ['schedule', 'TASK_EXECUTION_ERROR']]) {
  test(`el error ${code} de origen ${source} conserva su registro y notificación`, async () => {
    const h = harness(code);
    await assert.rejects(h.context.runTaskNow('finishPrint', source), { code });
    assert.equal(h.state.runs[0].status, 'error');
    assert.equal(h.config.tasks.finishPrint.lastStatus, 'error');
    assert.equal(h.state.notifications.length, 1);
    assert.equal(h.state.healthUpdates, 1);
    assert.equal(h.state.released, true);
  });
}
