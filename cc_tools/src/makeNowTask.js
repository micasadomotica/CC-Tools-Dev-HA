import { withAutomationBrowser } from './browserManager.js';
import { readConfig, writeConfig } from './storage.js';
import { navigateToCrealityPage } from './crealityNavigation.js';
import { observeCrealityPage, inspectCrealityPage, diagnoseTaskError, captureDiagnosticScreenshot } from './crealityDiagnostics.js';
import { readIncentiveProgress, waitForIncentiveProgress, compareIncentiveProgress } from './incentiveTasks.js';

export const MAKENOW_URL = 'https://www.crealitycloud.com/es/makenow/ModelingTools/Home';
export const MAKENOW_TITLE = 'Use MakeNow';
const TOOL = 'Lampshade Generator';

export async function runMakeNow(taskConfig = {}) {
  return withAutomationBrowser({}, async (context) => {
    const page = context.pages()[0] || await context.newPage();
    const observer = observeCrealityPage(page, 'makeNow');
    const events = [];
    try {
      return await executeMakeNow(page, observer, taskConfig, {
        events,
        reserveAttempt: async () => {
          // Reserve before clicking: a timeout must not create another project on retry.
          const config = await readConfig();
          config.tasks.makeNow.lastAttemptAt = new Date().toISOString();
          await writeConfig(config);
        }
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
        details: { events, diagnostics: [diagnostic], incident: diagnostic.systemic ? diagnostic : null },
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
  await openProject(page, observer, { record, reserveAttempt: dependencies.reserveAttempt });
  const after = await waitProgress(page, observer, MAKENOW_TITLE, before, [0, 10000, 15000, 20000], {
    timezone: taskConfig.timezone, requireTaskList: true
  });
  const verification = compareIncentiveProgress(before, after);
  const success = verification.status === 'credited';
  record(success ? 'Creality Cloud confirmó la recompensa MakeNow.' : 'Creality Cloud no confirmó la recompensa tras el clic.');
  return {
    success,
    message: success ? 'MakeNow: recompensa diaria confirmada.' : 'MakeNow: New Project pulsado; recompensa sin confirmar. Revisa el Log.',
    details: { events, tool: TOOL, newProjectClicked: true, rewardVerification: verification }
  };
}

export async function openMakeNowProject(page, observer, { record, reserveAttempt }) {
  await navigateToCrealityPage(page, MAKENOW_URL);
  record('Abierta la página MakeNow.');
  await assertPageReady(page, observer);
  // MakeNow lives on a different origin inside Creality Cloud's authenticated wrapper.
  const frame = page.frameLocator('#makenowIframe');
  const tool = frame.getByText(TOOL, { exact: true });
  await tool.waitFor({ state: 'visible', timeout: 45000 });
  await tool.click({ timeout: 15000 });
  record(`Seleccionada la herramienta ${TOOL}.`);
  const newProject = frame.getByText(/^(?:\+\s*)?(?:New Project|Nuevo proyecto)$/i).first();
  await newProject.waitFor({ state: 'visible', timeout: 30000 });
  await assertPageReady(page, observer);
  await reserveAttempt();
  await newProject.click({ timeout: 15000 });
  record('Pulsado New Project. No se genera ni se finaliza el proyecto.');
  // Let the click's requests finish before navigating to reward verification.
  await page.waitForTimeout(5000);
  await assertPageReady(page, observer);
}

async function assertPageReady(page, observer) {
  const diagnostic = await inspectCrealityPage(page, observer, { requireBody: true });
  if (diagnostic) throw Object.assign(new Error(diagnostic.message), diagnostic);
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
