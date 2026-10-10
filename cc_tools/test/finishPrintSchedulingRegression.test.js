import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as profiles from '../src/finishPrintProfiles.js';
import * as selection from '../src/finishPrintSelection.js';
import * as timing from '../src/timeWindow.js';
import * as schedule from '../src/finishPrintSchedule.js';
import { reconcileDailyPlans } from '../src/dailyProgress.js';
import { updateNextRunAfterExecution } from '../src/scheduler.js';

process.env.TZ = 'Europe/Madrid';
const instant = '2026-10-09T19:20:00.000Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return new Date(instant).getTime(); }
}
function functionsFrom(file, names) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  return names.map(name => {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert.ok(start >= 0, name);
    const next = source.slice(start + 1).search(/\n(?:export )?(?:async )?function /);
    return source.slice(start, next < 0 ? undefined : start + 1 + next);
  }).join('\n');
}
function harness(runs = []) {
  const context = vm.createContext({ ...profiles, ...selection, ...timing, ...schedule,
    Date: FixedDate, readRuns: async () => runs });
  vm.runInContext(functionsFrom('../src/server.js', [
    'applyFinishPrintProfilesConfig', 'countTodayFinishPrintStarts', 'windowDurationMinutes',
    'parseClock', 'dayKey', 'todayFinishPrintEvents', 'addPlannedTaskItems', 'effectivePendingPlan'
  ]), context);
  vm.runInContext(functionsFrom('../src/scheduler.js', [
    'ensureFinishPrintPlan', 'ensureFinishPrintProfilePlan', 'countTodayFinishPrintAttempts', 'advanceFinishPrintPlan'
  ]), context);
  return context;
}
const profile = () => ({ id: 'hab', printerName: 'HAb - Ender-3',
  windowStart: '21:30', windowEnd: '23:59', dailyLimit: 5, minIntervalMinutes: 10,
  cloudFiles: ['CCTools_Dev_v2.gcode'],
  cloudFileRecords: [{ id: 'v2', name: 'CCTools_Dev_v2.gcode', printTime: 0 }] });
const manual = (printerName, extra = {}) => ({ taskId: 'finishPrint', source: 'manual', status: 'success',
  finishedAt: '2026-10-09T18:20:00Z', details: { printId: 'p', manualSelection: true, printerName, ...extra } });
function config() {
  return { timezone: 'Europe/Madrid', tasks: { finishPrint: { enabled: true, printerProfiles: [],
    pendingVerification: { printId: 'ongoing', manualSelection: true, printerName: 'HAb - Ender-3' } } } };
}
async function save(runs) {
  const h = harness(runs), c = config();
  assert.equal(await h.applyFinishPrintProfilesConfig(c, { enabled: true, printerProfiles: [profile()] }), null);
  reconcileDailyPlans(c, runs, new FixedDate());
  return { h, c };
}

test('five manual starts on HA do not erase the new HAb plan, including after scheduler refresh', async () => {
  const runs = Array.from({ length: 5 }, () => manual('HA Ender-3'));
  const { h, c } = await save(runs);
  assert.equal(c.tasks.finishPrint.printPlan.length, 5);
  assert.ok(c.tasks.finishPrint.nextRunAt);
  for (const time of c.tasks.finishPrint.printPlan) {
    assert.ok(time >= '2026-10-09T19:30:00.000Z' && time < '2026-10-09T21:59:00.000Z');
  }
  const saved = JSON.stringify(c.tasks.finishPrint.printPlan);
  h.ensureFinishPrintPlan(c.tasks.finishPrint, runs, new FixedDate());
  h.ensureFinishPrintPlan(c.tasks.finishPrint, runs, new FixedDate());
  assert.equal(JSON.stringify(c.tasks.finishPrint.printPlan), saved);
  assert.equal(c.tasks.finishPrint.printPlanCursor, 0);
  assert.equal(c.tasks.finishPrint.pendingVerification.printId, 'ongoing');
  const items = [], p = c.tasks.finishPrint.printerProfiles[0];
  const events = h.todayFinishPrintEvents(runs, p, true);
  assert.equal(events.length, 0);
  h.addPlannedTaskItems({ items, taskConfig: { ...p, enabled: true, timezone: 'Europe/Madrid' },
    taskId: 'finishPrint', label: p.printerName, itemLabel: 'Impresion',
    planKey: 'printPlan', cursorKey: 'printPlanCursor', events, maxDailyLimit: 10 });
  assert.equal(items.filter(item => item.status === 'pending').length, 5);
  assert.equal(items[0].runAt, c.tasks.finishPrint.nextRunAt);
});

test('manual starts on the same printer do not consume the automatic budget', async () => {
  const { c } = await save([manual('HAb - Ender-3')]);
  assert.equal(c.tasks.finishPrint.printPlan.length, 5);
});

test('manual printer identity overrides an inherited active profile id', async () => {
  const { c } = await save(Array.from({ length: 5 }, () => manual('HA Ender-3', { printerProfileId: 'hab' })));
  assert.equal(c.tasks.finishPrint.printPlan.length, 5);
});

test('known scheduled profiles stay authoritative and anonymous legacy runs only go to the first profile', () => {
  assert.equal(profiles.finishPrintRunMatchesProfile({ details: { printerProfileId: 'other', printerName: 'HAb - Ender-3' } }, profile(), true), false);
  assert.equal(profiles.finishPrintRunMatchesProfile({ details: {} }, profile(), true), true);
  assert.equal(profiles.finishPrintRunMatchesProfile({ details: {} }, profile(), false), false);
  assert.equal(profiles.finishPrintRunMatchesProfile({ details: { printerName: 'HA Ender-3' } }, profile(), true), false);
});

test('credited account progress reduces the configured daily target', async () => {
  const { c } = await save([]);
  const credited = { taskId: 'finishPrint', status: 'success', finishedAt: instant,
    details: { printRecord: { completed: true }, rewardVerification: { status: 'credited' } } };
  reconcileDailyPlans(c, [credited], new FixedDate());
  assert.equal(c.tasks.finishPrint.printPlan.length, 4);
  reconcileDailyPlans(c, Array.from({ length: 4 }, () => credited), new FixedDate());
  assert.equal(c.tasks.finishPrint.printPlan.length, 1);
  reconcileDailyPlans(c, Array.from({ length: 10 }, () => credited), new FixedDate());
  assert.equal(c.tasks.finishPrint.nextRunAt, '');
});

test('saving updates the next execution immediately and reports the actual pending count', async () => {
  const { c } = await save([]);
  let message = '', renderedNext = '';
  const state = { config: {}, nextExecutions: {} };
  const result = { ok: true, config: c, nextExecutions: { finishPrint: c.tasks.finishPrint.nextRunAt } };
  const h = vm.createContext({ state, fields: { finishPrintEnabled: { checked: true } },
    collectFinishPrinterProfiles: () => [profile()], windowDurationMinutes: () => 149,
    $: () => ({ disabled: false }), api: async () => result,
    finishPrintProfilesFromConfig: () => state.config.tasks.finishPrint.printerProfiles,
    render: () => { renderedNext = state.nextExecutions.finishPrint; },
    renderFinishPrinterProfiles() {}, toast: value => { message = value; } });
  vm.runInContext(functionsFrom('../public/assets/app.js', ['saveFinishPrinterProfiles']), h);
  assert.equal(await h.saveFinishPrinterProfiles(), true);
  assert.equal(renderedNext, result.nextExecutions.finishPrint);
  assert.match(message, /5 impresi/);
  c.tasks.finishPrint.printerProfiles[0].printPlan = [];
  result.nextExecutions = {};
  await h.saveFinishPrinterProfiles();
  assert.match(message, /sin ejecuciones pendientes/);
  assert.equal(state.nextExecutions.finishPrint, undefined);
});


test('2/10 credited and a target of three creates one remaining print from 22:00', async () => {
  const runs = [manual('HAb - Ender-3'), manual('HAb - Ender-3')];
  const h = harness(runs), c = config();
  c.tasks.finishPrint.pendingVerification = null;
  c.dailyProgress = { tasks: { finishPrint: { found: true, done: 2, valid: 10, checkedAt: instant } } };
  const requested = { ...profile(), dailyLimit: 3, windowStart: '22:00' };
  await h.applyFinishPrintProfilesConfig(c, { enabled: true, printerProfiles: [requested] });
  reconcileDailyPlans(c, runs, new FixedDate());
  assert.equal(c.tasks.finishPrint.printPlan.length, 1);
  assert.ok(c.tasks.finishPrint.nextRunAt);
  for (const time of c.tasks.finishPrint.printPlan) {
    assert.ok(time >= '2026-10-09T20:00:00.000Z' && time < '2026-10-09T21:59:00.000Z');
  }
  h.ensureFinishPrintPlan(c.tasks.finishPrint, runs, new FixedDate());
  reconcileDailyPlans(c, runs, new FixedDate());
  assert.equal(c.tasks.finishPrint.printPlanCursor, 0);
  assert.equal(c.tasks.finishPrint.printPlan.length, 1);
});


test('a manual start preserves the plan while an automatic start advances it once', async () => {
  const { c } = await save([]);
  const task = c.tasks.finishPrint;
  const initial = task.nextRunAt;
  updateNextRunAfterExecution(task, 'finishPrint', 'manual', { details: { printId: 'manual-print' } });
  assert.equal(task.printPlanCursor, 0);
  assert.equal(task.printPlanDoneCount, 0);
  assert.equal(task.nextRunAt, initial);
  updateNextRunAfterExecution(task, 'finishPrint', 'schedule', { details: { printId: 'automatic-print' } });
  assert.equal(task.printPlanCursor, 1);
  assert.equal(task.printPlanDoneCount, 1);
  assert.equal(task.nextRunAt, task.printPlan[1]);
});

test('reprogramming subtracts previous automatic starts without counting their verification twice', async () => {
  const start = { ...manual('HAb - Ender-3'), source: 'schedule', details: {
    printId: 'auto', printerProfileId: 'hab', printerName: 'HAb - Ender-3' } };
  const verification = { ...start, details: { ...start.details, printRecord: { completed: true },
    rewardVerification: { status: 'credited' } } };
  const { h, c } = await save([start, verification, manual('HAb - Ender-3')]);
  assert.equal(c.tasks.finishPrint.printPlan.length, 4);
  assert.equal(c.tasks.finishPrint.printPlanDoneCount, 1);
  h.ensureFinishPrintPlan(c.tasks.finishPrint, [start, verification], new FixedDate());
  assert.equal(c.tasks.finishPrint.printPlanCursor, 0);
  assert.equal(c.tasks.finishPrint.printPlan.length, 4);
});


test('the print card shows the configured target immediately, including zero, rather than the Cloud quota', () => {
  const fields = Object.fromEntries(['creality','finishPrint','models','comments','boosts','likes','makeNow','collections']
    .map(key => [key + 'DailyBadge', { textContent: '', classList: { toggle() {} } }]));
  const tasks = Object.fromEntries(['finishPrint','modelDownloads','comments','modelBoosts','modelLikes','modelCollections'].map(key => [key, {}]));
  tasks.finishPrint = { totalDailyLimit: 3, dailyLimit: 3 };
  const state = { config: { tasks }, dailyCounters: { finishPrint: 2 }, dailyLimits: { finishPrint: 10 } };
  const h = vm.createContext({ state, fields });
  vm.runInContext(functionsFrom('../public/assets/app.js', ['renderDailyCounters', 'renderDailyBadge']), h);
  h.renderDailyCounters();
  assert.equal(fields.finishPrintDailyBadge.textContent, '2/3');
  assert.match(fields.finishPrintDailyBadge.title, /10/);
  tasks.finishPrint.totalDailyLimit = 4;
  h.renderDailyCounters();
  assert.equal(fields.finishPrintDailyBadge.textContent, '2/4');
  tasks.finishPrint.totalDailyLimit = 0;
  h.renderDailyCounters();
  assert.equal(fields.finishPrintDailyBadge.textContent, '2/0');
});
