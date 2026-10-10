import { Router } from 'express';
import { uploadLibrary } from './uploadDesignLibrary.js';
import { readConfig, writeConfig } from './storage.js';
import { runTaskNow } from './scheduler.js';
import { scheduleNextRun } from './timeWindow.js';
import { dailyProgress } from './dailyProgress.js';

export function uploadDesignRoutes(library = uploadLibrary, services = {}) {
  const read = services.readConfig || readConfig, write = services.writeConfig || writeConfig;
  const run = services.runTaskNow || runTaskNow;
  const router = Router();
  const json = action => async (req, res) => {
    try { res.json({ ok: true, ...await action(req) }); }
    catch (error) { res.status(error.status || 400).json({ ok: false, message: error.message }); }
  };
  async function view(state) {
    const config = await read(), task = config.tasks.uploadDesigns;
    const ledger = state.ledger?.[config.crealityProfile?.userId] || {};
    return { ...state, ledger: undefined, schedule: { ...state.schedule, enabled: task?.enabled === true },
      nextRunAt: task?.nextRunAt || '', lastRunAt: task?.lastRunAt || '',
      lastStatus: task?.lastStatus || '', timezone: config.timezone,
      rewardCount: dailyProgress(config).counters.uploadDesigns || 0,
      inventory: state.inventory.map(item => ({ ...item, delivery: ledger[item.modelHash],
        available: item.valid && !['submitting', 'submitted', 'uncertain'].includes(ledger[item.modelHash]?.status) })) };
  }
  router.get('/', json(async () => view(await library.status())));
  router.post('/scan', json(async () => view(await library.scan())));
  router.post('/library', json(() => library.ensureRoot()));
  router.post('/imports', json(() => library.beginImport()));
  router.put('/imports/:token/:kind', json(req => library.importFile(req.params.token, req.params.kind,
    decodeURIComponent(req.get('X-File-Name') || ''), req)));
  router.post('/imports/:token/finish', json(async req => view(await library.finishImport(req.params.token))));
  router.delete('/imports/:token', json(req => library.cancelImport(req.params.token)));
  router.put('/manual', json(async req => view(await library.saveManual(req.body?.selected))));
  router.post('/run', json(async req => {
    if (!req.body?.selected?.length) throw new Error('Selecciona al menos un diseño.');
    const state = await library.saveManual(req.body.selected);
    const result = await run('uploadDesigns', 'manual', { selected: state.manual });
    return { ...await view(await library.status()), result };
  }));
  router.put('/schedule', json(async req => {
    const config = await read();
    if (!config.crealityProfile?.userId) throw new Error('Actualiza el perfil de Creality antes de programar diseños.');
    const state = await library.saveSchedule(req.body || {});
    const task = config.tasks.uploadDesigns;
    Object.assign(task, { enabled: state.schedule.enabled, dailyLimit: state.schedule.dailyLimit,
      windowStart: state.schedule.windowStart, windowEnd: state.schedule.windowEnd, cleanupEnabled: state.schedule.cleanupEnabled,
      timezone: config.timezone, accountId: config.crealityProfile.userId });
    task.nextRunAt = task.enabled ? scheduleNextRun(task) : '';
    await write(config); return view(state);
  }));
  router.post('/schedule/disable', json(async () => {
    const config = await read(); config.tasks.uploadDesigns.enabled = false;
    config.tasks.uploadDesigns.nextRunAt = ''; await write(config);
    return view(await library.disableSchedule());
  }));
  router.post('/preview', json(async () => view(await library.preview())));
  router.get('/cover/:id', async (req, res) => {
    try {
      const { data, type } = await library.cover(req.params.id);
      res.set('X-Content-Type-Options', 'nosniff').type(type).send(data);
    } catch (error) { res.status(error.status || 404).json({ ok: false, message: 'Portada no disponible.' }); }
  });
  return router;
}
