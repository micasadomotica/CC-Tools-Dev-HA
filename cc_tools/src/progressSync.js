import { sendTelegram } from './telegram.js';
import { readConfig, writeConfig, readRuns, appendRun } from './storage.js';
import { withAutomationBrowser, browserManagerState } from './browserManager.js';
import { observeCrealityPage, inspectCrealityPage } from './crealityDiagnostics.js';
import { readIncentiveProgressBatch } from './incentiveTasks.js';
import { readPointsSummary, mergePointsState } from './pointsCounter.js';
import { REWARD_TITLES, dailyProgress, reconcileDailyPlans, reconcileMakeNowCorrection, progressDay } from './dailyProgress.js';

const MAX_AGE_MS = 5 * 60 * 1000;
let pending = null;
let pendingIncludesPoints = false;
let pendingFullHistory = false;
let taskReservations = 0;

// Reserve before the task's first await; a sync reading config must also yield.
export function pauseProgressSync() {
  taskReservations += 1;
  let released = false;
  return () => {
    if (!released) { released = true; taskReservations -= 1; }
  };
}

export async function waitForProgressSync(signal) {
  signal?.throwIfAborted();
  const current = pending;
  if (!current) return;
  await new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    // Failed refreshes do not prevent an explicit task from trying its own page.
    current.then(resolve, resolve).finally(() => signal?.removeEventListener('abort', abort));
  });
  signal?.throwIfAborted();
}

export function progressSyncDue(config, now = new Date()) {
  const previous = config.dailyProgress || {};
  const timestamp = Date.parse(previous.lastAttemptAt || '');
  return !Number.isFinite(timestamp) || now.getTime() - timestamp >= MAX_AGE_MS
    || progressDay(config.timezone, new Date(timestamp)) !== progressDay(config.timezone, now);
}

export async function synchronizeDailyProgress(options = {}) {
  options = { includePoints: true, ...options };
  if (taskReservations) return { ok: false, busy: true };
  if (pending) {
    if ((!options.includePoints || pendingIncludesPoints) && (!options.fullHistory || pendingFullHistory)) return pending;
    await pending;
  }
  const config = await readConfig();
  if (taskReservations) return { ok: false, busy: true };
  if (!options.force && !progressSyncDue(config)) return { ok: config.dailyProgress?.status === 'current', cached: true, error: config.dailyProgress?.error || '' };
  if (browserManagerState().mode !== 'idle') return { ok: false, busy: true, error: 'BROWSER_BUSY' };
  // No await between publishing the shared job and starting browser work.
  if (pending) return pending;
  pendingIncludesPoints = Boolean(options.includePoints);
  pendingFullHistory = Boolean(options.fullHistory);
  pending = sync(config, options);
  try { return await pending; }
  finally { pending = null; pendingIncludesPoints = false; pendingFullHistory = false; }
}

async function sync(config, options) {
  const startedAt = new Date().toISOString();
  let points = null;
  let tasks = {};
  let progressError = null;
  try {
    await withAutomationBrowser({}, async context => {
      const page = context.pages()[0] || await context.newPage();
      const observer = observeCrealityPage(page, 'rewardSync');
      try {
        try {
          const records = await readIncentiveProgressBatch(page, observer, Object.values(REWARD_TITLES));
          for (const [key, title] of Object.entries(REWARD_TITLES)) if (records[title]) tasks[key] = records[title];
        } catch (error) { progressError = error; }
        // Refreshing points remains useful even if one task is missing or the task list is temporarily unavailable.
        if (options.includePoints) points = await readPointsSummary(page, { timezone: config.timezone, fullHistory: options.fullHistory === true });
        if (!progressError) {
          try {
            const checkin = await readCheckinProgress(page, observer);
            if (checkin) tasks.creality = checkin;
          } catch { /* Keep the previous observation when this independent page is unavailable. */ }
        }
      } finally { observer.stop(); }
    });
  } catch (error) { progressError = error; }

  const fresh = await readConfig();
  const runs = await readRuns();
  const before = dailyProgress(fresh, runs);
  const previous = fresh.dailyProgress || {};
  fresh.dailyProgress = {
    ...previous, lastAttemptAt: startedAt,
    checkedAt: Object.keys(tasks).length ? new Date().toISOString() : previous.checkedAt || '',
    status: progressError ? 'stale' : 'current', error: progressError?.message || '',
    tasks: mergeProgressObservations(previous.tasks, tasks, fresh.timezone)
  };
  if (points) fresh.points = mergePointsState(fresh.points, points, { replaceTransactions: options.fullHistory === true && points.historyComplete === true });
  reconcileMakeNowCorrection(fresh, before.counters.makeNow);
  reconcileDailyPlans(fresh, runs);
  await writeConfig(fresh);
  const after = dailyProgress(fresh, runs);
  const changes = Object.keys(after.counters).filter(key => !key.startsWith('comment') && after.counters[key] !== before.counters[key]);
  if (after.counters.comments !== before.counters.comments) changes.push('comments');
  if (tasks.uploadDesigns?.found && after.counters.uploadDesigns > before.counters.uploadDesigns) {
    await sendTelegram(fresh, 'CC Tools Dev · Upload Models: ' + after.counters.uploadDesigns + '/' + after.limits.uploadDesigns + ' confirmados en el contador de Creality Cloud.').catch(error => console.error('[telegram]', error.message));
  }
  if (changes.length) {
    await appendRun({ taskId: 'rewardSync', source: 'sync', status: 'success', startedAt,
      finishedAt: new Date().toISOString(), message: 'Progreso diario sincronizado con Creality Cloud.',
      details: { dailyProgress: Object.fromEntries(changes.map(key => [key, { done: after.counters[key], valid: after.limits[key] }])) }, screenshots: [] });
  } else if (progressError && previous.error !== progressError.message) {
    await appendRun({ taskId: 'rewardSync', source: 'sync', status: 'failed', startedAt,
      finishedAt: new Date().toISOString(), message: 'No se pudo sincronizar el progreso diario: ' + progressError.message,
      details: {}, screenshots: [] });
  }
  return { ok: options.includePoints ? points?.status === 'current' : !progressError,
    points: fresh.points, progressSynced: !progressError, error: progressError?.message || points?.error || '' };
}

export function mergeProgressObservations(current = {}, incoming = {}, timezone = 'Europe/Madrid') {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (Date.parse(value.checkedAt) >= (Date.parse(current[key]?.checkedAt) || 0)) {
      const previous = current[key];
      const sameDay = previous?.checkedAt && progressDay(timezone, new Date(previous.checkedAt)) === progressDay(timezone, new Date(value.checkedAt));
      merged[key] = { ...value, done: sameDay && key !== 'makeNow' ? Math.max(value.done, previous.done) : value.done };
    }
  }
  return merged;
}

export async function readCheckinProgress(page, observer) {
  await page.goto('https://www.crealitycloud.com/check-in', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  const diagnostic = await inspectCrealityPage(page, observer, { requireBody: true });
  if (diagnostic) return null;
  const scope = await page.locator('iframe.iframe-box').count() ? page.frameLocator('iframe.iframe-box') : page;
  const button = scope.locator('.sign-in-action .sign-in-btn').first();
  await button.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (!await button.isVisible()) return null;
  const label = String(await button.textContent()).replace(/\s+/g, ' ').trim();
  const done = /^(registrado|checked\s*in)$/i.test(label);
  if (!done && !/^(registrar|check\s*in\s*today)$/i.test(label)) return null;
  return { found: true, title: 'Check-in diario', done: done ? 1 : 0, valid: 1, completed: done, checkedAt: new Date().toISOString() };
}
