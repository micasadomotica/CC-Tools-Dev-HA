import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { printerBusyFromTelemetry } from '../src/finishPrintExecution.js';

const now = new Date('2026-11-28T18:00:00.000Z');
const attributes = (values) => ({ result: Object.entries(values).map(([key, value]) => ({ key, value, lastUpdateTs: 1 })) });
const leftTime = (seconds) => ({ result: { printLeftTime: [{ ts: 1, value: 9999 }, { ts: 2, value: seconds }] } });

test('detects a printer that is printing or paused and waits for the print to end', () => {
  const printing = printerBusyFromTelemetry(attributes({ state: 1, connect: 1, printId: 'p1', print: 'Tapa.3mf' }), leftTime(1800), now);
  assert.equal(printing.paused, false);
  assert.equal(printing.fileName, 'Tapa.3mf');
  assert.equal(printing.remainingSeconds, 1800);
  // 30 min left + 2 min margin.
  assert.equal(printing.retryAt, '2026-11-28T18:32:00.000Z');

  const paused = printerBusyFromTelemetry(attributes({ state: 5 }), null, now);
  assert.equal(paused.paused, true);
  assert.equal(paused.retryAt, '2026-11-28T18:10:00.000Z', 'at least 10 minutes');

  const long = printerBusyFromTelemetry(attributes({ state: 1 }), leftTime(10 * 3600), now);
  assert.equal(long.retryAt, '2026-11-28T21:00:00.000Z', 'at most 3 hours');
});

test('does not block idle, finished, disconnected or unreadable printers', () => {
  assert.equal(printerBusyFromTelemetry(attributes({ state: 0 }), null, now), null);
  assert.equal(printerBusyFromTelemetry(attributes({ state: 2 }), null, now), null);
  assert.equal(printerBusyFromTelemetry(attributes({ state: 3 }), null, now), null);
  assert.equal(printerBusyFromTelemetry(attributes({ state: 1, connect: 0 }), null, now), null);
  assert.equal(printerBusyFromTelemetry(null, null, now), null);
});

test('a busy printer moves the pending print slot instead of consuming it', async () => {
  const config = { tasks: { finishPrint: {
    timezone: 'Europe/Madrid',
    printPlan: ['2026-11-28T18:00:00.000Z', '2026-11-28T19:00:00.000Z'],
    printPlanCursor: 0,
    nextRunAt: '2026-11-28T18:00:00.000Z'
  } } };
  const runs = [];
  const calls = [];
  const context = vm.createContext({ Date, console: { log() {}, warn() {}, error() {} },
    readConfig: async () => config, writeConfig: async () => {},
    appendRun: async (run) => runs.push(run),
    syncActiveFinishPrintProfile: () => calls.push('sync'),
    activateNextFinishPrintProfile: () => calls.push('activate') });
  const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);

  const result = { success: true, skipped: true, details: { printerBusy: true, retryAt: '2026-11-28T18:32:00.000Z' } };
  const outcome = await context.deferBusyFinishPrint(result, 'La impresora está imprimiendo', '2026-11-28T18:00:01.000Z', '2026-11-28T18:00:00.000Z');

  const task = config.tasks.finishPrint;
  assert.equal(outcome.status, 'skipped');
  assert.equal(task.printPlanCursor, 0, 'the slot is not consumed');
  assert.deepEqual([...task.printPlan], ['2026-11-28T18:32:00.000Z', '2026-11-28T19:32:00.000Z']);
  assert.equal(task.nextRunAt, '2026-11-28T18:32:00.000Z');
  assert.deepEqual([...calls], ['sync', 'activate']);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'skipped');
  assert.equal(runs[0].details.printerBusy, true);
});

test('the scheduled task passes the printer telemetry id to the busy check', () => {
  const source = fs.readFileSync(new URL('../src/finishPrintTask.js', import.meta.url), 'utf8');
  assert.match(source, /telemetryId: taskConfig\.printerTelemetryId/);
  const scheduler = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8');
  assert.match(scheduler, /taskId === 'finishPrint' && result\.details\?\.printerBusy\)[\s\S]{0,80}deferBusyFinishPrint/);
});
