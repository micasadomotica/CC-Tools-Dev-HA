import { Router } from 'express';
import { progressDay } from './dailyProgress.js';
import { uploadLibrary } from './uploadDesignLibrary.js';
import { readConfig, writeConfig } from './storage.js';
import { scheduleNextRun } from './timeWindow.js';

// Use the durable delivery ledger, including models removed by automatic cleanup.
export function homeAssistantModels(config, state, now = new Date()) {
  const accountId = String(config.crealityProfile?.userId || '');
  const task = config.tasks?.uploadDesigns || {};
  const timezone = config.timezone || 'Europe/Madrid';
  const today = progressDay(timezone, now);
  const ledger = state.ledger?.[accountId] || {};
  const delivered = Object.values(ledger).filter(item => item.status === 'submitted'
    && Number.isFinite(Date.parse(item.submittedAt || '')));
  delivered.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  const last = delivered[0];
  return {
    ok: true, apiVersion: 1, accountId,
    models: {
      defaultCategory: state.defaultCategory,
      availableCount: state.libraryError ? null : state.inventory.filter(item => item.valid
        && !['submitting', 'submitted', 'uncertain'].includes(ledger[item.modelHash]?.status)).length,
      lastModel: last ? { name: last.name, id: last.id || '', url: last.url || '' } : null,
      lastUploadAt: last?.submittedAt || '',
      nextUploadAt: task.enabled ? task.nextRunAt || '' : '',
      uploadsToday: delivered.filter(item => progressDay(timezone, new Date(item.submittedAt)) === today).length,
      enabled: task.enabled === true,
      dailyLimit: task.dailyLimit ?? state.schedule.dailyLimit,
      windowStart: task.windowStart || state.schedule.windowStart,
      windowEnd: task.windowEnd || state.schedule.windowEnd,
      timezone, lastStatus: task.lastStatus || '', lastMessage: task.lastMessage || '',
      libraryError: state.libraryError || '', scannedAt: state.scannedAt || '',
    },
  };
}

export function homeAssistantModelsRoutes(library = uploadLibrary, services = {}) {
  const read = services.readConfig || readConfig;
  const write = services.writeConfig || writeConfig;
  const router = Router();
  const json = action => async (req, res) => {
    try { res.json(await action(req)); }
    catch (error) { res.status(error.status || 400).json({ ok: false, apiVersion: 1, message: error.message }); }
  };
  router.get('/', json(async () => homeAssistantModels(await read(), await library.status())));
  router.patch('/', json(async req => {
    if (typeof req.body?.enabled !== 'boolean') throw new Error('Indica si quieres activar la programación.');
    const config = await read(), task = config.tasks?.uploadDesigns;
    if (!task) throw new Error('Configura primero la programación en Subir diseños.');
    const enabled = req.body.enabled, account = config.crealityProfile?.userId;
    if (enabled && (!account || task.accountId !== account)) {
      throw new Error('Configura y guarda la programación de diseños para esta cuenta en CC Tools Dev.');
    }
    const state = await library.setScheduleEnabled(enabled, account);
    const nextRunAt = enabled
      ? task.enabled && task.nextRunAt || scheduleNextRun({ ...task, timezone: config.timezone })
      : '';
    // Keep selection, cleanup, daily limit, window and consumption progress intact.
    task.enabled = enabled;
    task.nextRunAt = nextRunAt;
    await write(config);
    return homeAssistantModels(config, state);
  }));
  return router;
}
