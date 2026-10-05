import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMakeNow, attemptedToday, countMakeNowRun, MAKENOW_TITLE } from '../src/makeNowTask.js';
import { updateNextRunAfterExecution } from '../src/scheduler.js';
import { buildHealthMetrics } from '../src/healthMetrics.js';
import { buildHomeAssistantState, buildHomeAssistantEvents, internalTaskId } from '../src/homeAssistantApi.js';

const before = { found: true, done: 0, valid: 1, completed: false };
const after = { found: true, done: 1, valid: 1, completed: true };
function harness(initial = before, final = after) {
  const calls = [];
  return { calls, dependencies: {
    readProgress: async (_page, _observer, title, options) => {
      assert.equal(title, MAKENOW_TITLE);
      assert.equal(options.requireTaskList, true);
      calls.push('read'); return initial;
    },
    openProject: async (_page, _observer, { record, reserveAttempt }) => {
      await reserveAttempt(); calls.push('click'); record('New Project');
    },
    reserveAttempt: async () => { calls.push('reserve'); },
    waitProgress: async () => { calls.push('verify'); return final; }
  } };
}

test('MakeNow reserva, pulsa una vez y solo confirma éxito al avanzar la recompensa', async () => {
  const { calls, dependencies } = harness();
  const result = await executeMakeNow({}, {}, {}, dependencies);
  assert.deepEqual(calls, ['read', 'reserve', 'click', 'verify']);
  assert.equal(result.success, true);
  assert.equal(result.details.rewardVerification.status, 'credited');
  assert.equal(result.details.newProjectClicked, true);
  assert.equal(countMakeNowRun({ details: result.details }), 1);
  assert.ok(result.details.events.every(event => event.at && event.message));
});

test('MakeNow ya completado no abre herramientas ni proyectos', async () => {
  const { calls, dependencies } = harness(after);
  const result = await executeMakeNow({}, {}, {}, dependencies);
  assert.deepEqual(calls, ['read']);
  assert.equal(result.skipped, true);
  assert.equal(countMakeNowRun(result), 1);
});

test('sin recompensa conocida se detiene antes de abrir un proyecto', async () => {
  const { calls, dependencies } = harness({ found: false });
  await assert.rejects(executeMakeNow({}, {}, {}, dependencies), { code: 'INCENTIVE_TASK_NOT_FOUND' });
  assert.deepEqual(calls, ['read']);
});

for (const final of [before, { found: false }]) {
  test(`un clic sin acreditar no cuenta como éxito: ${final.found}`, async () => {
    const { calls, dependencies } = harness(before, final);
    const result = await executeMakeNow({}, {}, {}, dependencies);
    assert.equal(result.success, false);
    assert.equal(countMakeNowRun(result), 0);
    assert.equal(calls.filter(x => x === 'click').length, 1);
  });
}

test('un reinicio o reintento el mismo día vuelve a verificar sin crear proyectos', async () => {
  const { calls, dependencies } = harness();
  dependencies.now = new Date('2026-10-04T14:00:00Z');
  const result = await executeMakeNow({}, {}, { lastAttemptAt: '2026-10-04T10:00:00Z' }, dependencies);
  assert.equal(result.success, false);
  assert.deepEqual(calls, ['read']);
});

test('el siguiente día permite un nuevo intento según la zona horaria', async () => {
  assert.equal(attemptedToday('2026-10-04T21:59:00Z', 'Europe/Madrid', new Date('2026-10-04T22:01:00Z')), false);
  assert.equal(attemptedToday('2026-10-04T22:01:00Z', 'Europe/Madrid', new Date('2026-10-05T07:00:00Z')), true);
  assert.equal(attemptedToday('invalid'), false);
  const { calls, dependencies } = harness();
  dependencies.now = new Date('2026-10-05T12:00:00Z');
  await executeMakeNow({}, {}, { lastAttemptAt: '2026-10-04T12:00:00Z' }, dependencies);
  assert.ok(calls.includes('click'));
});

test('si no se puede guardar el intento, no se pulsa New Project', async () => {
  const { calls, dependencies } = harness();
  dependencies.reserveAttempt = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(executeMakeNow({}, {}, {}, dependencies), /storage unavailable/);
  assert.deepEqual(calls, ['read']);
});

test('MakeNow participa en la planificación diaria y las métricas', () => {
  const task = { enabled: true, timezone: 'Europe/Madrid', windowStart: '08:00', windowEnd: '12:00' };
  updateNextRunAfterExecution(task, 'makeNow', 'manual', { success: true }, new Date('2026-10-04T08:00:00Z'));
  assert.equal(new Date(task.nextRunAt).getUTCDate(), 5);
  const metrics = buildHealthMetrics({}, [{ taskId: 'makeNow', status: 'failed', finishedAt: new Date().toISOString() }]);
  assert.equal(metrics.failures, 1);
});

test('la API HA expone configuración, ejecución y eventos MakeNow', () => {
  assert.equal(internalTaskId('makenow'), 'makeNow');
  const state = buildHomeAssistantState({
    config: { tasks: { makeNow: { enabled: true, dailyLimit: 1 } } },
    dailyCounters: { makeNow: 1 }, scheduler: { running: true, runningTask: 'makeNow' }
  });
  assert.equal(state.tasks.makenow.dailyCount, 1);
  assert.equal(state.tasks.makenow.enabled, true);
  assert.equal(state.scheduler.runningTask, 'makenow');
  const events = buildHomeAssistantEvents([{ id: 'make-1', taskId: 'makeNow', status: 'success' }]);
  assert.equal(events[0].taskName, 'Crear un proyecto');
  assert.equal(events[0].type, 'task_completed');
});
