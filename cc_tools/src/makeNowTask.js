import { withAutomationBrowser } from './browserManager.js';
import { readConfig } from './storage.js';
import { MAKENOW_HOME, selectAndCreateMakeNowProject, createMakeNowJournal, lastProfileAttempt } from './makeNowProjects.js';
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
        ...journal, events, signal: options.signal
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
  record('Consultada la recompensa Use MakeNow.');
  if (!before.found) throw taskError('INCENTIVE_TASK_NOT_FOUND', 'No se encontró la recompensa Use MakeNow.', 'reward');
  if (before.completed) {
    record('La recompensa diaria ya estaba completada.');
    return { success: true, skipped: true, message: 'MakeNow: la recompensa diaria ya estaba completada.',
      details: { events, rewardVerification: { status: 'already_completed', before, after: before } } };
  }
  if (attemptedToday(taskConfig.lastAttemptAt, taskConfig.timezone, dependencies.now)) {
    record('Ya se intentó New Project hoy; no se repite el clic.');
    return { success: false, message: 'MakeNow: ya se intentó abrir un proyecto hoy; recompensa todavía sin confirmar.',
      details: { events, rewardVerification: { status: 'unverified', before, after: before } } };
  }
  const selection = await openProject(page, observer, { record, reserveAttempt: dependencies.reserveAttempt,
    updateAttempt: dependencies.updateAttempt, saveInventory: dependencies.saveInventory, signal: dependencies.signal });
  dependencies.signal?.throwIfAborted();
  const after = await waitProgress(page, observer, MAKENOW_TITLE, before, [0, 10000, 15000, 20000], {
    timezone: taskConfig.timezone, requireTaskList: true
  });
  const verification = compareIncentiveProgress(before, after);
  const success = verification.status === 'credited';
  await dependencies.updateAttempt?.(selection?.project, { rewardStatus: verification.status, verifiedAt: new Date().toISOString() });
  record(success ? 'Creality Cloud confirmó la recompensa MakeNow.' : 'Creality Cloud no confirmó la recompensa tras el clic.');
  return {
    success,
    message: success ? 'MakeNow: recompensa diaria confirmada.' : 'MakeNow: New Project pulsado; recompensa sin confirmar. Revisa el Log.',
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
