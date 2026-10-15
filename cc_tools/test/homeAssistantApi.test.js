import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHomeAssistantEvents,
  buildHomeAssistantState,
  earnedPointsToday,
  internalTaskId
} from '../src/homeAssistantApi.js';

test('crea una instantánea estable para Home Assistant', () => {
  const config = fixtureConfig();
  const runs = [{
    id: 'run-print',
    taskId: 'finishPrint',
    status: 'success',
    source: 'schedule',
    createdAt: new Date().toISOString(),
    details: { printId: 'print-1', printerProfileId: 'ender-3', file: { name: 'pieza.gcode' } }
  }];
  const state = buildHomeAssistantState({
    config,
    runs,
    scheduler: {
      running: true,
      runningTask: 'modelDownloads',
      runningSource: 'schedule',
      startedAt: '2026-09-27T09:58:00.000Z',
      timeoutAt: '2026-09-27T10:08:00.000Z',
      stale: false
    },
    browser: { active: true, mode: 'automation' },
    dailyCounters: { finishPrint: 1, modelDownloads: 2 },
    nextExecutions: { modelDownloads: '2026-09-27T10:00:00.000Z' },
    schedule: [
      {
        taskId: 'modelDownloads',
        label: 'Descarga de diseños',
        detail: 'Diseño 3 de 30',
        runAt: '2026-09-27T10:00:00.000Z',
        status: 'pending'
      },
      {
        taskId: 'comments',
        label: 'Comentarios',
        detail: 'Comentario 1 de 6',
        runAt: '2026-09-27T10:20:00.000Z',
        status: 'pending'
      },
      {
        taskId: 'modelLikes',
        label: 'Dar me gusta',
        detail: 'Ejecución de hoy',
        runAt: '2026-09-27T09:00:00.000Z',
        status: 'done'
      }
    ],
    health: { state: 'active', successRate: 100 }
  });

  assert.equal(state.apiVersion, 1);
  assert.equal(state.account.name, 'Aguacatec');
  assert.equal(state.session.state, 'open');
  assert.equal(state.session.authenticated, true);
  assert.equal(state.tasks.downloads.dailyCount, 2);
  assert.equal(state.scheduler.runningTask, 'downloads');
  assert.equal(state.scheduler.runningSource, 'schedule');
  assert.equal(state.scheduler.startedAt, '2026-09-27T09:58:00.000Z');
  assert.equal(state.scheduler.stale, false);
  assert.deepEqual(state.schedule.pending.map((item) => item.task), ['downloads', 'comments']);
  assert.equal(state.schedule.pending[0].plannedAt, '2026-09-27T10:00:00.000Z');
  assert.match(state.schedule.revision, /^[a-f0-9]{16}$/);
  assert.equal(state.printers[0].lastGcode, 'pieza.gcode');
  assert.equal(state.orders.pending, 1);
  assert.equal(state.orders.latest.status, 'Pendiente');
  assert.equal(state.orders.latest.title, 'Producto');
});

test('mantiene la revisión de planificación al consultar de nuevo o cambiar la ejecución activa', () => {
  const config = fixtureConfig();
  const schedule = [{ taskId: 'uploadDesigns', label: 'Subir diseños', detail: 'Un diseño', runAt: '2026-10-12T10:00:00.000Z', status: 'pending' }];
  const first = buildHomeAssistantState({ config, schedule });
  const active = buildHomeAssistantState({ config, schedule, scheduler: {
    running: true, runningTask: 'uploadDesigns', runningSource: 'manual',
    startedAt: '2026-10-11T10:00:00.000Z', timeoutAt: '2026-10-11T10:10:00.000Z', stale: true
  } });
  assert.deepEqual(first.schedule, active.schedule);
  assert.equal(active.schedule.pending[0].task, 'uploadDesigns');
  assert.equal(active.scheduler.runningTask, 'uploadDesigns');
  assert.equal(active.scheduler.stale, true);
  assert.equal(active.scheduler.timeoutAt, '2026-10-11T10:10:00.000Z');
  assert.equal(active.scheduler.runningSource, 'manual');
});

test('actualiza la revisión al reprogramar o completar una tarea', () => {
  const config = fixtureConfig();
  const item = { taskId: 'modelDownloads', detail: 'Diseño 1', runAt: '2026-10-12T10:00:00.000Z', status: 'pending' };
  const initial = buildHomeAssistantState({ config, schedule: [item] }).schedule;
  const moved = buildHomeAssistantState({ config, schedule: [{ ...item, runAt: '2026-10-12T11:00:00.000Z' }] }).schedule;
  const completed = buildHomeAssistantState({ config, schedule: [{ ...item, status: 'done' }] }).schedule;
  assert.notEqual(initial.revision, moved.revision);
  assert.notEqual(initial.pending[0].id, moved.pending[0].id);
  assert.notEqual(initial.revision, completed.revision);
  assert.deepEqual(completed.pending, []);
});

test('expone valores seguros sin ejecución ni planificación válida', () => {
  const config = fixtureConfig();
  const empty = buildHomeAssistantState({ config });
  assert.equal(empty.scheduler.stale, false);
  assert.equal(empty.scheduler.startedAt, '');
  assert.equal(empty.scheduler.timeoutAt, '');
  assert.deepEqual(empty.schedule.pending, []);
  assert.deepEqual(buildHomeAssistantState({ config, schedule: null }).schedule, empty.schedule);
  assert.deepEqual(buildHomeAssistantState({ config, schedule: [null, { status: 'pending' }] }).schedule, empty.schedule);
});

test('convierte ejecuciones en eventos deduplicables', () => {
  const events = buildHomeAssistantEvents([
    {
      id: 'order-1', taskId: 'shopOrders', status: 'success', source: 'schedule',
      message: 'Pedido enviado', createdAt: '2026-09-27T10:00:00.000Z',
      details: { order: { id: '42', title: 'Filamento', status: 'Enviado' } }
    },
    {
      id: 'download-1', taskId: 'modelDownloads', status: 'failed', source: 'schedule',
      message: 'Falló', createdAt: '2026-09-27T09:00:00.000Z', details: {}
    },
    { id: 'ignored', taskId: 'favoriteProfiles', status: 'success', details: {} }
  ]);

  assert.deepEqual(events.map((event) => event.type), ['order_shipped', 'task_failed']);
  assert.equal(events[0].related.title, 'Filamento');
  assert.equal(events[1].task, 'downloads');
});

test('solo emite la finalización verificada de una impresión', () => {
  const events = buildHomeAssistantEvents([
    {
      id: 'print-completed', taskId: 'finishPrint', status: 'success', source: 'schedule',
      message: 'Impresión verificada', createdAt: '2026-09-27T10:30:00.000Z',
      details: { file: { id: 'gcode-1', name: 'pieza.gcode' }, printRecord: { completed: true } }
    },
    {
      id: 'print-started', taskId: 'finishPrint', status: 'success', source: 'schedule',
      message: 'Impresión iniciada', createdAt: '2026-09-27T10:00:00.000Z',
      details: { file: { id: 'gcode-1', name: 'pieza.gcode' } }
    }
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'print-completed');
  assert.equal(events[0].related.title, 'pieza.gcode');
});

test('traduce identificadores públicos de tareas', () => {
  assert.equal(internalTaskId('checkin'), 'creality');
  assert.equal(internalTaskId('likes'), 'modelLikes');
  assert.equal(internalTaskId('collections'), 'modelCollections');
  assert.equal(internalTaskId('unknown'), '');
});

test('expone los mismos puntos positivos del día que el badge de CC Tools', () => {
  const points = {
    earnedToday: 60,
    transactions: [
      { date: '2026-10-15', amount: 100 },
      { date: '2026-10-15', amount: -40 },
      { date: '2026-10-14', amount: 25 }
    ]
  };

  assert.equal(
    earnedPointsToday(points, 'Europe/Madrid', new Date('2026-10-15T12:00:00.000Z')),
    100
  );
});

function fixtureConfig() {
  const task = (extra = {}) => ({
    enabled: true,
    dailyLimit: 1,
    lastRunAt: '',
    lastStatus: 'never',
    lastMessage: '',
    nextRunAt: '',
    ...extra
  });
  return {
    timezone: 'Europe/Madrid',
    setup: { assistantCompleted: true },
    crealityProfile: { userId: '7963944884', name: 'Aguacatec', avatarUrl: '' },
    points: { total: 1000, earnedToday: 10, status: 'current', updatedAt: '' },
    shopOrders: {
      items: [{
        id: '1', orderNumber: 'CC-1', title: 'Producto', status: 'Pendiente',
        statusKind: 'pending', points: 1200, quantity: 1,
        createdAt: '2026-09-27T10:00:00.000Z', archived: false
      }],
      updatedAt: ''
    },
    tasks: {
      creality: task(),
      finishPrint: task({
        printerProfiles: [{
          id: 'ender-3', printerName: 'Ender 3', dailyLimit: 10,
          cloudFiles: ['pieza.gcode'], cloudFileRecords: [{ name: 'pieza.gcode' }]
        }]
      }),
      modelDownloads: task({ dailyLimit: 30 }),
      comments: task({ dailyLimit: 6 }),
      modelBoosts: task({ availableBoosts: 2 }),
      modelLikes: task(),
      modelCollections: task()
    }
  };
}

test('expone colecciones con progreso, programación, ejecución activa y eventos', () => {
  const next = '2026-09-29T09:00:00.000Z';
  const state = buildHomeAssistantState({
    config: fixtureConfig(), dailyCounters: { modelCollections: 1 },
    nextExecutions: { modelCollections: next },
    scheduler: { running: true, runningTask: 'modelCollections' }
  });
  assert.equal(state.tasks.collections.name, 'Añadir a la colección');
  assert.equal(state.tasks.collections.enabled, true);
  assert.equal(state.tasks.collections.dailyCount, 1);
  assert.equal(state.tasks.collections.dailyLimit, 1);
  assert.equal(state.tasks.collections.nextRunAt, next);
  assert.equal(state.scheduler.runningTask, 'collections');
  const events = buildHomeAssistantEvents(['success', 'failed', 'skipped'].map(status => ({
    id: status, taskId: 'modelCollections', status,
    details: { acted: [{ id: 'model', title: 'Modelo', url: 'https://example.test/model' }] }
  })));
  assert.deepEqual(events.map(event => event.type), ['task_completed', 'task_failed']);
  assert.ok(events.every(event => event.task === 'collections'));
  assert.equal(events[0].related.id, 'model');
});
