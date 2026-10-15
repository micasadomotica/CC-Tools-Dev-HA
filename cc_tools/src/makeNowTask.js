import { withAutomationBrowser } from './browserManager.js';
import { readConfig } from './storage.js';
import { MAKENOW_HOME, selectAndCreateMakeNowProject, createMakeNowJournal, lastProfileAttempt, canRetryMakeNowManually } from './makeNowProjects.js';
import { observeCrealityPage, diagnoseTaskError, captureDiagnosticScreenshot } from './crealityDiagnostics.js';
import { readIncentiveProgress, waitForIncentiveProgress, compareIncentiveProgress } from './incentiveTasks.js';

export const MAKENOW_URL = MAKENOW_HOME;
export const MAKENOW_TITLE = 'Use MakeNow';

export async function runMakeNow(taskConfig = {}, options = {}) {
  return withAutomationBrowser({}, async (context) => {
    const page = context.pages()[0] || await context.newPage();
    const observer = observeCrealityPage(page, 'makeNow');
    const events = [];
    try {
      const config = await readConfig();
      const profile = config.crealityProfile;
      const journal = createMakeNowJournal(profile);
      return await executeMakeNow(page, observer, {
        ...taskConfig, lastAttemptAt: lastProfileAttempt(config.tasks.makeNow, profile?.userId)
      }, {
        ...journal, events, signal: options.signal, source: options.source
      });
    } catch (error) {
      if (error.silentRetry) throw error;
      const diagnostic = await diagnoseTaskError(error, page, observer, {
        code: error.code || 'MAKENOW_FAILED', category: error.category || 'action',
        systemic: Boolean(error.systemic), message: error.message
      });
      const screenshot = await captureDiagnosticScreenshot(page, 'makeNow', diagnostic.code);
      return {
        success: false, message: diagnostic.message,
        details: { events, inventory: error.inventory, diagnostics: [diagnostic], incident: diagnostic.systemic ? diagnostic : null },
        screenshots: screenshot ? [screenshot] : []
      };
    } finally {
      observer.stop();
    }
  });
}

export async function executeMakeNow(page, observer, taskConfig = {}, dependencies = {}) {
  const readProgress = dependencies.readProgress || readIncentiveProgress;
  const waitProgress = dependencies.waitProgress || waitForIncentiveProgress;
  const openProject = dependencies.openProject || openMakeNowProject;
  const events = dependencies.events || [];
  const record = (message) => events.push({ at: new Date().toISOString(), message });
  const before = await readProgress(page, observer, MAKENOW_TITLE, {
    timezone: taskConfig.timezone, requireTaskList: true
  });
  if (!before.found) throw taskError('INCENTIVE_TASK_NOT_FOUND', 'No se encontró la recompensa Use MakeNow.', 'reward');
  record(`Consultada la recompensa Use MakeNow: ${before.done}/${before.valid}.`);
  if (before.completed) {
    record('La recompensa diaria ya estaba completada.');
    return { success: true, skipped: true, message: 'MakeNow: la recompensa diaria ya estaba completada.',
      details: { events, rewardVerification: { status: 'already_completed', before, after: before } } };
  }
  const manualRetry = canRetryMakeNowManually({ source: dependencies.source, progress: before });
  if (attemptedToday(taskConfig.lastAttemptAt, taskConfig.timezone, dependencies.now)) {
    if (!manualRetry) {
      record('Ya hubo un intento hoy; se evita repetirlo automáticamente. El reintento manual requiere confirmar 0/1.');
      return { success: false, message: 'MakeNow: intento diario realizado; recompensa sin confirmar. Puedes reintentar manualmente si sigue en 0/1.',
        details: { events, rewardVerification: compareIncentiveProgress(before, before) } };
    }
    record('Reintento manual permitido: la consulta actual confirma 0/1. Se abrirá otro proyecto; el anterior se conserva.');
  }
  const selection = await openProject(page, observer, { record,
    reserveAttempt: tool => dependencies.reserveAttempt(tool, {
      source: dependencies.source, progress: before, previousAttemptAt: taskConfig.lastAttemptAt
    }),
    updateAttempt: dependencies.updateAttempt, saveInventory: dependencies.saveInventory, signal: dependencies.signal });
  dependencies.signal?.throwIfAborted();
  const after = await waitProgress(page, observer, MAKENOW_TITLE, before, [0, 10000, 15000, 20000], {
    timezone: taskConfig.timezone, requireTaskList: true
  });
  const verification = compareIncentiveProgress(before, after);
  const success = verification.status === 'credited';
  await dependencies.updateAttempt?.(selection?.project, { rewardStatus: verification.status, verifiedAt: new Date().toISOString() });
  const pendingMessage = verification.status === 'not_credited'
    ? `MakeNow: recompensa pendiente (${after.done}/${after.valid}). Abrir el editor no confirma su aprobación. Puedes reintentar manualmente si sigue en 0/1.`
    : 'MakeNow: no se pudo verificar la recompensa después del clic. Vuelve a consultar antes de reintentar.';
  record(success ? 'Creality Cloud confirmó la recompensa MakeNow (1/1).' : pendingMessage);
  return {
    success,
    message: success ? 'MakeNow: recompensa diaria confirmada.' : pendingMessage,
    details: { events, ...selection, newProjectClicked: true, rewardVerification: verification }
  };
}

export async function openMakeNowProject(page, observer, options) {
  return selectAndCreateMakeNowProject(page, options);
}

export function attemptedToday(timestamp, timezone = 'Europe/Madrid', now = new Date()) {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(new Date(timestamp)) === formatter.format(now);
}

export function countMakeNowRun(run) {
  return ['credited', 'already_completed'].includes(run.details?.rewardVerification?.status) ? 1 : 0;
}

function taskError(code, message, category = 'action') {
  return Object.assign(new Error(message), { code, category, systemic: false });
}
