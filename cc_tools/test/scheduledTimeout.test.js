import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeCaughtError } from '../src/crealityDiagnostics.js';
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
    Date, Promise, AbortController, setTimeout, clearTimeout, process, normalizeCaughtError,
    console: { log() {}, error() {}, warn() {} },
    pauseProgressSync: () => () => { state.released = true; },
    waitForProgressSync: async () => {},
    readConfig: async () => config, writeConfig: async () => { state.onWrite?.(); await state.writeGate; },
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

for (const returnedIncident of [false, true]) {
  test(`guarda el reintento antes de liberar la ejecución (${returnedIncident ? 'resultado HTTP' : 'error de sesión'})`, async () => {
    const h = harness('SESSION_CHECK_UNAVAILABLE');
    if (returnedIncident) h.context.executePendingTask = async () => ({ success: false,
      details: { incident: { code: 'CREALITY_HTTP_ERROR', httpStatus: 503, message: 'HTTP 503' } } });
    let releaseWrite, enteredWrite;
    h.state.writeGate = new Promise(resolve => { releaseWrite = resolve; });
    const writing = new Promise(resolve => { enteredWrite = resolve; });
    h.state.onWrite = enteredWrite;
    const run = h.context.runTaskNow('finishPrint', 'schedule');
    try {
      await writing;
      assert.equal(h.context.schedulerState().running, true);
      assert.equal(h.state.released, false);
      await assert.rejects(h.context.runTaskNow('makeNow', 'manual'), { code: 'TASK_ALREADY_RUNNING' });
    } finally { releaseWrite(); }
    assert.equal((await run).status, 'skipped');
    assert.equal(h.config.tasks.finishPrint.printPlanCursor, 1);
    assert.equal(h.config.tasks.finishPrint.printerProfiles[0].nextRunAt, h.config.tasks.finishPrint.nextRunAt);
    assert.equal(h.context.schedulerState().running, false);
    assert.equal(h.state.released, true);
  });
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

for (const [source, code] of [['manual', 'TASK_EXECUTION_TIMEOUT'], ['schedule', 'TASK_EXECUTION_ERROR'], ['manual', 'SESSION_CHECK_UNAVAILABLE']]) {
  test(`el error ${code} de origen ${source} conserva su registro y notificación`, async () => {
    const h = harness(code);
    if (code === 'SESSION_CHECK_UNAVAILABLE') h.error.silentRetry = true;
    await assert.rejects(h.context.runTaskNow('finishPrint', source), { code });
    assert.equal(h.state.runs[0].status, 'error');
    assert.equal(h.config.tasks.finishPrint.lastStatus, 'error');
    assert.equal(h.state.notifications.length, 1);
    assert.equal(h.state.healthUpdates, 1);
    assert.equal(h.state.released, true);
  });
}

for (const taskId of ['modelDownloads', 'makeNow']) {
  test(`una sesión sin respuesta aplaza ${taskId} diez minutos sin consumir el turno ni avisar`, async () => {
    const h = harness('SESSION_CHECK_UNAVAILABLE');
    h.error.silentRetry = true;
    h.error.message = 'Creality Cloud no respondió al comprobar la sesión.';
    const plan = [h.now - 60000, h.now, h.now + 1200000].map(time => new Date(time).toISOString());
    h.config.tasks[taskId] = { enabled: true, timezone: 'Europe/Madrid', nextRunAt: plan[1],
      downloadPlan: [...plan], downloadPlanCursor: 1, lastAttemptAt: '', projectAccounts: {} };
    const result = await h.context.runTaskNow(taskId, 'schedule');
    assert.equal(result.status, 'skipped');
    assert.match(result.message, /Se reintentará automáticamente/);
    const task = h.config.tasks[taskId];
    assert.ok(Date.parse(task.nextRunAt) >= h.now + 10 * 60000);
    assert.equal(task.downloadPlanCursor, 1);
    assert.equal(task.downloadPlan[0], plan[0]);
    if (taskId === 'modelDownloads') {
      assert.equal(task.downloadPlan[1], task.nextRunAt);
      assert.equal(Date.parse(task.downloadPlan[2]) - Date.parse(task.downloadPlan[1]), 1200000);
    }
    assert.equal(task.lastAttemptAt, '');
    assert.equal(Object.keys(task.projectAccounts).length, 0);
    assert.equal(h.state.runs.length, 0);
    assert.equal(h.state.notifications.length, 0);
    assert.equal(h.state.healthUpdates, 0);
    assert.equal(h.state.released, true);
    assert.equal(h.context.schedulerState().running, false);
  });
}

for (const failure of [null, undefined, { code: 'PAGE_INCOMPLETE', systemic: true }]) {
  test(`una descarga con ${failure?.code || String(failure)} conserva y aplaza su turno`, async () => {
    const h = harness();
    const plan = [h.now - 60000, h.now, h.now + 1200000].map(time => new Date(time).toISOString());
    h.config.tasks.modelDownloads = { timezone: 'Europe/Madrid', downloadPlan: [...plan], downloadPlanCursor: 1 };
    h.context.executePendingTask = async () => {
      if (failure) return { success: false, details: { incident: failure } };
      throw failure;
    };
    const result = await h.context.runTaskNow('modelDownloads', 'schedule');
    assert.equal(result.status, 'skipped');
    const task = h.config.tasks.modelDownloads;
    assert.equal(task.downloadPlanCursor, 1);
    assert.equal(task.downloadPlan[0], plan[0]);
    assert.ok(Date.parse(task.nextRunAt) >= h.now + 10 * 60000);
    assert.equal(task.downloadPlan[1], task.nextRunAt);
    assert.equal(Date.parse(task.downloadPlan[2]) - Date.parse(task.downloadPlan[1]), 1200000);
    assert.equal(h.config.automationHealth.serviceFailureCount, 1);
    assert.equal(h.state.notifications.length, 0);
    assert.equal(h.state.released, true);
  });
}
