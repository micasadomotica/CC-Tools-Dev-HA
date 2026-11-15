import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import { browserSessionDir } from './storage.js';
import { inspectCrealityPage, normalizeCaughtError, observeCrealityPage } from './crealityDiagnostics.js';
import { isNavigationTimeout, navigateToCrealityPage } from './crealityNavigation.js';
import { confirmAuthenticatedSession } from './sessionMonitor.js';
import { installChallengeHandling, browserChallengeState, challengeResolvedAt } from './browserChallenge.js';
import { bindBrowserDiagnostics, recordBrowserLifecycle } from './browserLifecycle.js';
import { launchExternalChromium, externalConnectionDiagnostics } from './externalChromium.js';
import { installCookieConsentHandling } from './cookieConsent.js';

const PROFILE_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lock'];
const SESSION_CHECK_URL = 'https://www.crealitycloud.com/es/workbench-beta/?type=1';
const SESSION_PROFILE_API_PATH = '/api/cxy/v3/user/getInfo';
let activeContext = null;
let activeOwner = null;
let activeMode = '';
let activeBrowserVersion = '';
let activeOptionsKey = '';
const connectionMode = 'external-cdp';
let activeEnvironment = null;
let shuttingDown = false;
let shutdownPromise = null;
const pendingLaunches = new Set();
const isolatedBrowsers = new Set();
const requestedClosures = new WeakMap();
const operationContexts = new Map();
const contextEnvironments = new WeakMap();

function assertBrowserAvailable() {
  if (shuttingDown) throw Object.assign(new Error('CC Tools se está deteniendo.'), { code: 'APP_STOPPING' });
}

function trackedLaunch(launch) {
  assertBrowserAvailable();
  const pending = (async () => {
    const resource = await launch();
    if (shuttingDown) {
      await resource.close();
      assertBrowserAvailable();
    }
    return resource;
  })();
  const tracked = pending.finally(() => pendingLaunches.delete(tracked));
  pendingLaunches.add(tracked);
  return tracked;
}

export async function withAutomationBrowser(options, callback) {
  assertBrowserAvailable();
  if (activeMode === 'interactive') {
    throw browserError('REMOTE_BROWSER_OPEN',
      'El navegador remoto está abierto. La tarea se reintentará cuando termine la sesión interactiva.', false);
  }
  if (activeMode) {
    throw browserError('BROWSER_BUSY', 'Ya hay otra operación utilizando el navegador.', false);
  }

  activeMode = 'automation';
  const owner = activeOwner = Symbol('automation');
  operationContexts.set(owner, null);
  let completed = false;
  let operationContext = null;
  const { diagnosticSource = 'automation', ...launchOptions } = options || {};
  try {
    await ensureActiveContext({ ...baseOptions(), ...launchOptions }, diagnosticSource);
    operationContext = activeContext;
    const sessionCheck = await assertAuthenticatedSession(activeContext);
    if (sessionCheck.confirmAuthenticated) await confirmAuthenticatedSession();
    const result = await callback(activeContext, sessionCheck);
    completed = true;
    return result;
  } catch (error) {
    throw normalizeBrowserError(error);
  } finally {
    const endContext = operationContexts.get(owner) || operationContext;
    operationContexts.delete(owner);
    if (activeOwner !== owner && endContext) {
      recordBrowserLifecycle(endContext, 'module_lease_lost', { reason: 'lease_lost', source: diagnosticSource });
    }
    if (activeOwner === owner) {
      if (completed && !shuttingDown) await releaseAutomationContext(owner, diagnosticSource);
      else await closeActiveContext({ reason: 'task_failed', source: diagnosticSource });
    }
  }
}

export async function withIsolatedBrowser(options, callback) {
  if (browserChallengeState().active) {
    throw browserError('BROWSER_BUSY', 'El navegador espera que completes una verificación de seguridad.', false);
  }
  const browser = await trackedLaunch(() => chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  }));
  isolatedBrowsers.add(browser);
  let context;
  try {
    assertBrowserAvailable();
    if (browserChallengeState().active) throw browserError('BROWSER_BUSY', 'La verificación requiere el navegador libre.', false);
    context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      colorScheme: 'light',
      locale: process.env.CCTOOLS_BROWSER_LOCALE || 'es-ES',
      timezoneId: process.env.TZ || 'Europe/Madrid',
      ...(options || {})
    });
    assertBrowserAvailable();
    await installCookieConsentHandling(context);
    return await callback(context);
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
    isolatedBrowsers.delete(browser);
  }
}

export async function withParallelSessionBrowser(options, callback) {
  if (activeMode !== 'automation' || !activeContext) {
    return withAutomationBrowser(options, callback);
  }

  const storageState = await activeContext.storageState().catch(() => null);
  if (!storageState) {
    throw browserError('BROWSER_BUSY', 'Ya hay otra operación utilizando el navegador.', false);
  }
  return withIsolatedBrowser({ ...(options || {}), storageState }, callback);
}

export async function restartAutomationBrowser(options = {}, reason = 'restart_requested') {
  assertBrowserAvailable();
  if (activeMode && activeMode !== 'automation') {
    throw browserError('BROWSER_BUSY', 'Otra operación está utilizando el navegador.', false);
  }

  const owner = activeOwner;
  const previousContext = activeContext;
  recordBrowserLifecycle(previousContext, 'context_restart_requested', { reason, source: 'download' });
  await closeActiveContext({ keepLease: true, reason, source: 'download' });
  activeOwner = owner;
  activeMode = 'automation';
  try {
    await ensureActiveContext({ ...baseOptions(), ...options }, 'download');
    recordBrowserLifecycle(activeContext, 'context_replacement', { reason, source: 'download', relatedContext: previousContext });
    return activeContext;
  } catch (error) {
    activeMode = '';
    throw error;
  }
}

export async function openInteractiveBrowser(url) {
  assertBrowserAvailable();
  if (activeMode === 'automation') {
    if (browserChallengeState().active) return activeContext.pages()[0];
    throw browserError('BROWSER_BUSY', 'Hay una automatización en curso. Inténtalo de nuevo cuando termine.', false);
  }

  if (activeMode && activeMode !== 'interactive') throw browserError('BROWSER_BUSY', 'El navegador está ocupado.', false);

  activeMode = 'interactive';
  activeOwner = Symbol('interactive');
  try {
    await ensureActiveContext({ ...baseOptions(), headless: false }, 'interactive');
  } catch (error) {
    await closeActiveContext({ reason: 'interactive_launch_failed', source: 'interactive' });
    throw error;
  }

  const page = activeContext.pages()[0] || await activeContext.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

export async function closeInteractiveBrowser() {
  if (browserChallengeState().active) {
    throw browserError('BROWSER_BUSY', 'Completa la verificación o pulsa Cancelar espera antes de cerrar el navegador.', false);
  }
  if (activeMode === 'automation' || !activeContext) return false;
  await closeActiveContext({ reason: 'manual_close', source: 'interactive' });
  return true;
}

export async function verifyPersistedSession() {
  if (activeMode === 'automation') {
    throw browserError('BROWSER_BUSY', 'Ya hay otra operación utilizando el navegador.', false);
  }

  if (activeMode === 'interactive' && activeContext) {
    const page = activeContext.pages().find((candidate) => isCrealityApplicationPage(candidate.url()));
    if (!page) {
      return { checked: false, authenticated: false, reason: 'LOGIN_IN_PROGRESS' };
    }
    const sessionCheck = await assertAuthenticatedSession(activeContext, page);
    if (!sessionCheck.confirmAuthenticated) {
      return { checked: false, authenticated: false, reason: 'SESSION_CHECK_INCONCLUSIVE' };
    }
    const session = await confirmAuthenticatedSession();
    return { checked: true, ...session };
  }

  // An inconclusive check must also preserve the pause when there is no interactive browser.
  return withAutomationBrowser({ diagnosticSource: 'session_check' }, async (_context, sessionCheck) => ({
    checked: sessionCheck.confirmAuthenticated,
    authenticated: sessionCheck.confirmAuthenticated,
    ...(!sessionCheck.confirmAuthenticated ? { reason: 'SESSION_CHECK_INCONCLUSIVE' } : {})
  }));
}

export async function attemptRememberedSessionLogin(options = {}) {
  const expectedUserId = String(options.expectedUserId || '').trim();
  if (activeMode) {
    return {
      attempted: false,
      authenticated: false,
      reason: activeMode === 'interactive' ? 'LOGIN_IN_PROGRESS' : 'BROWSER_BUSY'
    };
  }

  activeMode = 'automation';
  const owner = activeOwner = Symbol('session-recovery');
  let recovered = false;
  try {
    await ensureActiveContext({ ...baseOptions(), headless: false }, 'session_recovery');
    const page = activeContext.pages()[0] || await activeContext.newPage();

    await page.goto(SESSION_CHECK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (isCrealityIdentityPage(page.url())) {
      const rememberedAccounts = await page.evaluate(() => window.localStorage.getItem('id-application-user'));
      const selection = prioritizeRememberedAccount(rememberedAccounts, expectedUserId);
      if (!selection.ok) {
        return {
          attempted: true,
          authenticated: false,
          reason: 'MANUAL_LOGIN_REQUIRED',
          message: rememberedAccountFailureMessage(selection.reason),
          url: page.url()
        };
      }
      if (selection.serialized !== rememberedAccounts) {
        await page.evaluate((serialized) => {
          window.localStorage.setItem('id-application-user', serialized);
        }, selection.serialized);
      }
      await page.goto(rememberedAccountAutoLoginUrl(page.url()), {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForURL(
        (url) => isCrealityApplicationPage(url.toString()),
        { timeout: 20000, waitUntil: 'domcontentloaded' }
      ).catch(() => null);
    }

    if (!isCrealityApplicationPage(page.url())) {
      return {
        attempted: true,
        authenticated: false,
        reason: 'MANUAL_LOGIN_REQUIRED',
        message: 'Creality Cloud requiere completar el inicio de sesión manualmente.',
        url: page.url()
      };
    }

    const sessionCheck = await assertAuthenticatedSession(activeContext, page);
    if (!sessionCheck.confirmAuthenticated) {
      return { attempted: true, authenticated: false, reason: 'SESSION_CHECK_INCONCLUSIVE', url: page.url() };
    }
    if (expectedUserId && !sessionCheck.userId) {
      return { attempted: true, authenticated: false, reason: 'SESSION_CHECK_INCONCLUSIVE', url: page.url() };
    }
    if (expectedUserId && sessionCheck.userId !== expectedUserId) {
      return {
        attempted: true,
        authenticated: false,
        reason: 'MANUAL_LOGIN_REQUIRED',
        message: 'La cuenta recuperada no coincide con el perfil configurado en CC Tools.',
        url: page.url()
      };
    }
    const session = await confirmAuthenticatedSession();
    recovered = true;
    return { attempted: true, ...session, authenticated: true, url: page.url() };
  } catch (error) {
    const normalized = normalizeBrowserError(error);
    if (normalized?.code === 'LOGIN_REQUIRED') {
      return {
        attempted: true,
        authenticated: false,
        reason: 'MANUAL_LOGIN_REQUIRED',
        message: 'La cuenta recordada ya no permite iniciar sesión automáticamente.',
        url: activeContext?.pages?.()[0]?.url?.() || ''
      };
    }
    throw normalized;
  } finally {
    if (activeOwner === owner) {
      if (recovered && !shuttingDown) await releaseAutomationContext(owner, 'session_recovery');
      else await closeActiveContext({ reason: 'session_recovery_failed', source: 'session_recovery' });
    }
  }
}

export function browserManagerState() {
  return {
    mode: activeMode || 'idle',
    active: Boolean(activeContext),
    engine: 'chromium',
    version: activeBrowserVersion,
    connectionMode,
    environment: activeEnvironment,
    challenge: browserChallengeState()
  };
}

export function shutdownBrowser() {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    const launches = await Promise.allSettled([...pendingLaunches]);
    const results = await Promise.allSettled([
      closeActiveContext({ reason: 'application_shutdown', source: 'shutdown' }), ...[...isolatedBrowsers].map(browser => browser.close()),
    ]);
    isolatedBrowsers.clear();
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const failedLaunch = launches.find(result => result.status === 'rejected' && result.reason?.code !== 'APP_STOPPING');
    if (failedLaunch) throw failedLaunch.reason;
  })();
  return shutdownPromise;
}

export async function abortAutomationBrowser(reason = 'abort_requested', source = 'scheduler') {
  if (activeMode !== 'automation') return false;
  await closeActiveContext({ reason, source });
  return true;
}

export function normalizeBrowserError(error) {
  error = normalizeCaughtError(error, {
    code: 'EMPTY_BROWSER_ERROR',
    category: 'technical',
    message: 'El navegador no devolvió información sobre el error.',
    phase: 'automatización del navegador'
  });
  const text = error?.message || String(error);
  if (/\bPage crashed\b|Target crashed|page\.waitForTimeout: Page crashed/i.test(text)) {
    const normalized = browserError(
      'BROWSER_CRASHED',
      'La pestaña de Chromium se cerró inesperadamente durante la ejecución.',
      false,
      text
    );
    normalized.silentRetry = true;
    return normalized;
  }
  if (/page\.goto: Timeout \d+ms exceeded|Navigation timeout/i.test(text)) {
    return crealityServiceUnavailableError(error);
  }
  if (error?.code) return error;
  if (isDisplayError(error)) {
    return browserError(
      'DISPLAY_UNAVAILABLE',
      'La pantalla virtual del navegador no estaba disponible.',
      false,
      text
    );
  }
  if (isProfileLockError(error)) {
    return browserError(
      'BROWSER_PROFILE_LOCKED',
      'Chromium no pudo iniciar porque el perfil de sesión estaba bloqueado.',
      true,
      text
    );
  }
  if (/Target page, context or browser has been closed|browser.*closed/i.test(text)) {
    return browserError(
      'BROWSER_CLOSED',
      'Chromium se cerró de forma inesperada durante la ejecución.',
      true,
      text
    );
  }
  return error;
}

function crealityServiceUnavailableError(error) {
  const normalized = browserError(
    'CREALITY_SERVICE_UNAVAILABLE',
    'Creality Cloud no respondió dentro del tiempo esperado.',
    false,
    error?.message || String(error)
  );
  normalized.silentRetry = true;
  return normalized;
}

async function launchWithRecovery(options) {
  assertBrowserAvailable();
  const preflightRecovery = await recoverBrowserProfile('profile_preflight');
  if (!preflightRecovery.recovered) {
    const error = browserError(
      'BROWSER_PROFILE_LOCKED',
      'Chromium no pudo iniciar porque el perfil de sesión seguía siendo utilizado por otro proceso.',
      true,
      `Procesos que siguen usando el perfil: ${preflightRecovery.remainingProcesses.join(', ')}`
    );
    error.recovery = preflightRecovery;
    throw error;
  }

  let context;
  try {
    context = await trackedLaunch(() => launchExternalChromium(chromiumSessionDir(), { ...options, headless: false }, info => {
      recordBrowserLifecycle(context, 'process_exited', { reason: 'process_exit', source: 'playwright',
        exitCode: info.code, signal: info.signal, pid: info.pid });
    }));
    return context;
  } catch (error) { throw normalizeBrowserError(error); }
}

async function recoverBrowserProfile(reason) {
  const processes = await findProfileChromiumProcesses();
  for (const pid of processes) {
    await terminateProcess(pid);
  }

  const remaining = await findProfileChromiumProcesses();
  if (remaining.length) {
    recordBrowserLifecycle(null, 'profile_recovery', { reason, source: 'automation',
      terminatedProcesses: processes.length, remainingProcesses: remaining.length, removedLocks: 0 });
    return { recovered: false, terminatedProcesses: processes, remainingProcesses: remaining, removedLocks: [] };
  }

  const removedLocks = [];
  for (const filename of PROFILE_LOCK_FILES) {
    const lockPath = path.join(chromiumSessionDir(), filename);
    try {
      await fs.unlink(lockPath);
      removedLocks.push(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  recordBrowserLifecycle(null, 'profile_recovery', { reason, source: 'automation',
    terminatedProcesses: processes.length, remainingProcesses: 0, removedLocks: removedLocks.length });
  return { recovered: true, terminatedProcesses: processes, remainingProcesses: [], removedLocks };
}

async function findProfileChromiumProcesses() {
  if (process.platform !== 'linux') return [];
  const entries = await fs.readdir('/proc', { withFileTypes: true }).catch(() => []);
  const profile = chromiumSessionDir();
  const matches = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const cmdline = await fs.readFile(`/proc/${entry.name}/cmdline`, 'utf8').catch(() => '');
    if (/(?:chrome|chromium)/i.test(cmdline) && cmdline.includes(profile)) {
      matches.push(Number(entry.name));
    }
  }
  return matches;
}

async function terminateProcess(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return;
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    await delay(100);
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ensureActiveContext(options, source = 'automation') {
  const key = JSON.stringify(options);
  if (activeContext && activeOptionsKey === key) {
    bindBrowserDiagnostics(activeContext, source);
    if (operationContexts.has(activeOwner)) operationContexts.set(activeOwner, activeContext);
    recordBrowserLifecycle(activeContext, 'context_reused', { reason: 'compatible_options', source });
    return;
  }
  const previousContext = activeContext;
  const reason = activeContext ? 'options_changed' : 'new_context';
  if (activeContext) {
    const oldOptions = JSON.parse(activeOptionsKey || '{}');
    const changedOptions = [...new Set([...Object.keys(oldOptions), ...Object.keys(options)])]
      .filter(name => JSON.stringify(oldOptions[name]) !== JSON.stringify(options[name]));
    await closeActiveContext({ keepLease: true, reason, source, changedOptions });
  }
  activeContext = await launchWithRecovery(options);
  activeOptionsKey = key;
  activeBrowserVersion = activeContext.browser()?.version() || '';
  bindBrowserDiagnostics(activeContext, source);
  if (operationContexts.has(activeOwner)) operationContexts.set(activeOwner, activeContext);
  watchContext(activeContext);
  recordBrowserLifecycle(activeContext, 'context_created', { reason, source, relatedContext: previousContext });
  await recordEnvironment(activeContext);
}

async function recordEnvironment(context, page = context.pages()[0]) {
  if (!page?.evaluate) return;
  let webdriver = null;
  try { webdriver = await page.evaluate(() => navigator.webdriver); } catch {}
  const environment = { connectionMode, browserVersion: context.browser()?.version() || '',
    webdriver: typeof webdriver === 'boolean' ? webdriver : null,
    ...(typeof externalConnectionDiagnostics === 'function' ? externalConnectionDiagnostics(context) : {}) };
  if (activeContext === context) activeEnvironment = environment;
  if (JSON.stringify(contextEnvironments.get(context)) === JSON.stringify(environment)) return;
  contextEnvironments.set(context, environment);
  recordBrowserLifecycle(context, 'browser_environment', { reason: 'environment_probe', source: 'playwright', ...environment });
}

async function releaseAutomationContext(owner, source = 'automation') {
  if (!activeContext || activeOwner !== owner) return;
  try {
    // Keep the lease until the external process exits and flushes its profile.
    await closeActiveContext({ keepLease: true, reason: 'task_completed', source });
  } finally {
    if (activeOwner === owner) { activeOwner = null; activeMode = ''; }
  }
}

async function closeActiveContext({ keepLease = false, reason = 'abort_requested', source = 'automation', changedOptions } = {}) {
  const context = activeContext;
  activeContext = null;
  if (!keepLease) {
    activeOwner = null;
    activeMode = '';
  }
  activeBrowserVersion = '';
  activeOptionsKey = '';
  activeEnvironment = null;
  if (context) {
    requestedClosures.set(context, { reason, source });
    recordBrowserLifecycle(context, 'context_close_requested', { reason, source, changedOptions, requested: true });
    await context.close().catch(error => {
      recordBrowserLifecycle(context, 'context_close_failed', { reason: 'close_failed', source });
      if (shuttingDown) throw error;
    });
  }
}

export async function assertAuthenticatedSession(context, preferredPage = null) {
  const page = preferredPage || context.pages()[0] || await context.newPage();
  const observer = observeCrealityPage(page, 'session-check');
  const profileResponsePromise = page.waitForResponse(
    response => response.url().includes(SESSION_PROFILE_API_PATH),
    { timeout: 6000 }
  ).then(response => ({ response, receivedAt: Date.now() })).catch(() => null);
  const throwDiagnostic = diagnostic => {
    if (!diagnostic || !['LOGIN_REQUIRED', 'SECURITY_CHALLENGE'].includes(diagnostic.code)) return;
    throw Object.assign(new Error(diagnostic.message), { code: diagnostic.code, systemic: true, diagnostic });
  };
  try {
    await navigateToCrealityPage(page, SESSION_CHECK_URL, { timeout: 30000, attempts: 2 });
    await page.waitForTimeout(750);
    const captured = await profileResponsePromise;
    // Inspect API challenges before interpreting 401/403 or an invalid JSON profile.
    throwDiagnostic(await inspectCrealityPage(page, observer));
    const profileResponse = captured && captured.receivedAt >= challengeResolvedAt(page) ? captured.response : null;
    let profileState = 'unknown', userId = '';
    if (profileResponse) {
      const payload = await profileResponse.json().catch(() => null);
      profileState = profileSessionState(payload, profileResponse.status());
      userId = profileSessionUserId(payload);
      if (profileState === 'logged_out') {
        throwDiagnostic({ code: 'LOGIN_REQUIRED', category: 'session', systemic: true,
          message: 'La sesión de Creality Cloud ha caducado o no está iniciada.',
          detectedAt: new Date().toISOString(), url: page.url(), httpStatus: profileResponse.status(),
          technical: profileSessionTechnical(payload, profileResponse.status()) });
      }
    }
    return { ...sessionCheckOutcome(profileState), userId };
  } catch (error) {
    // Never start another intervention after cancellation or the 15-minute deadline.
    if (['SECURITY_CHALLENGE_CANCELLED', 'SECURITY_CHALLENGE_TIMEOUT', 'APP_STOPPING', 'BROWSER_BUSY'].includes(error?.code)) throw error;
    throwDiagnostic(await inspectCrealityPage(page, observer, { handleChallenge: false }).catch(() => null));
    if (isNavigationTimeout(error) || error?.code === 'NAVIGATION_TARGET_MISMATCH') {
      throw sessionCheckUnavailableError(error, page.url());
    }
    throw error;
  } finally { observer.stop(); }
}

export function sessionCheckOutcome(profileState = 'unknown') {
  const authenticated = profileState === 'authenticated';
  return { allowTask: true, confirmAuthenticated: authenticated, state: authenticated ? 'authenticated' : 'inconclusive' };
}

export function isCrealityApplicationPage(url) {
  try {
    return new URL(String(url || '')).hostname === 'www.crealitycloud.com';
  } catch {
    return false;
  }
}

export function isCrealityIdentityPage(url) {
  try {
    return new URL(String(url || '')).hostname === 'id.creality.com';
  } catch {
    return false;
  }
}

export function rememberedAccountAutoLoginUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.hostname !== 'id.creality.com') return '';
    url.searchParams.set('auto_login', '1');
    return url.toString();
  } catch {
    return '';
  }
}

export function prioritizeRememberedAccount(value, expectedUserId = '', now = Date.now()) {
  let accounts;
  try {
    accounts = JSON.parse(String(value || ''));
  } catch {
    return { ok: false, reason: 'REMEMBERED_ACCOUNT_INVALID' };
  }
  if (!Array.isArray(accounts) || !accounts.length) {
    return { ok: false, reason: 'REMEMBERED_ACCOUNT_NOT_FOUND' };
  }

  const validAccounts = accounts.filter((account) => String(account?.userId || '').trim());
  if (!validAccounts.length) return { ok: false, reason: 'REMEMBERED_ACCOUNT_NOT_FOUND' };

  const targetUserId = String(expectedUserId || '').trim();
  const selected = targetUserId
    ? validAccounts.find((account) => String(account.userId) === targetUserId)
    : validAccounts.length === 1 ? validAccounts[0] : null;
  if (!selected) {
    return {
      ok: false,
      reason: targetUserId ? 'REMEMBERED_ACCOUNT_NOT_FOUND' : 'REMEMBERED_ACCOUNT_AMBIGUOUS'
    };
  }

  const latestTime = Math.max(Number(now) || Date.now(), ...validAccounts.map((account) => Number(account.time) || 0));
  selected.time = latestTime + 1;
  return {
    ok: true,
    userId: String(selected.userId),
    serialized: JSON.stringify(accounts)
  };
}

function rememberedAccountFailureMessage(reason) {
  if (reason === 'REMEMBERED_ACCOUNT_AMBIGUOUS') {
    return 'Hay varias cuentas recordadas y no se pudo identificar cuál corresponde a CC Tools.';
  }
  if (reason === 'REMEMBERED_ACCOUNT_INVALID') {
    return 'Los datos de la cuenta recordada no son válidos.';
  }
  return 'No se encontró en el navegador la cuenta configurada en CC Tools.';
}

export function profileSessionState(payload, httpStatus = 200) {
  if ([401, 403].includes(Number(httpStatus))) return 'logged_out';
  if (!payload || typeof payload !== 'object') return 'unknown';

  const base = payload?.result?.profileUserInfo?.base || {};
  if (base.userId || base.nickName || base.avatar) return 'authenticated';

  const code = Number(payload.code);
  const message = String(payload.msg || payload.message || '');
  if (code === 4 || /invalid\s*token|unauthori[sz]ed|not\s+logged|login\s+required|iniciar\s+sesi[oó]n/i.test(message)) {
    return 'logged_out';
  }
  if (code === 0 && Object.hasOwn(payload, 'result')) return 'logged_out';
  return 'unknown';
}

export function profileSessionUserId(payload) {
  return String(payload?.result?.profileUserInfo?.base?.userId || '').trim();
}

function profileSessionTechnical(payload, httpStatus) {
  const code = payload && typeof payload === 'object' ? payload.code : '';
  const message = payload && typeof payload === 'object' ? payload.msg || payload.message : '';
  return [
    `Consulta de perfil: HTTP ${Number(httpStatus) || 'desconocido'}.`,
    code !== '' && code !== undefined ? `Código: ${code}.` : '',
    message ? `Respuesta: ${String(message).slice(0, 200)}.` : ''
  ].filter(Boolean).join(' ');
}

export function sessionCheckUnavailableError(error, currentUrl = '') {
  const technical = [
    error?.message || String(error),
    `Página final: ${currentUrl || 'desconocida'}.`,
    'La sesión no se ha considerado cerrada porque Creality Cloud no llegó a responder.'
  ].join(' ');
  const normalized = browserError(
    'SESSION_CHECK_UNAVAILABLE',
    'Creality Cloud no respondió al comprobar la sesión.',
    false,
    technical
  );
  normalized.silentRetry = true;
  return normalized;
}

function watchContext(context) {
  installChallengeHandling(context, {
    inspect: inspectCrealityPage,
    onStart: () => Promise.allSettled([...isolatedBrowsers].map(browser => browser.close())),
    enabled: () => activeContext === context && activeMode === 'automation' && !shuttingDown
  });
  const watchPage = page => {
    page.on?.('domcontentloaded', () => { void recordEnvironment(context, page); });
    page.once?.('crash', () => recordBrowserLifecycle(context, 'page_crashed', {
      reason: 'page_crash', source: 'playwright', page }));
    page.once?.('close', () => recordBrowserLifecycle(context, 'page_closed', {
      reason: 'page_event', source: 'playwright', page, pageCount: context.pages().length }));
  };
  context.pages().forEach(watchPage);
  context.on?.('page', watchPage);
  context.browser()?.once?.('disconnected', () => recordBrowserLifecycle(context, 'browser_disconnected', {
    reason: 'disconnect_event', source: 'playwright', requested: requestedClosures.has(context) }));
  context.once('close', () => {
    const requested = requestedClosures.get(context);
    recordBrowserLifecycle(context, 'context_closed', {
      reason: requested?.reason || 'unrequested_close', source: requested?.source || 'playwright',
      requested: Boolean(requested) });
    if (activeContext !== context) return;
    activeContext = null;
    activeOwner = null;
    activeMode = '';
    activeBrowserVersion = '';
    activeOptionsKey = '';
    activeEnvironment = null;
  });
}

function baseOptions() {
  const locale = process.env.CCTOOLS_BROWSER_LOCALE || 'es-ES';
  return {
    headless: false,
    viewport: { width: 1366, height: 768 },
    screen: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    acceptDownloads: true,
    timeout: 45000,
    locale,
    timezoneId: process.env.TZ || 'Europe/Madrid',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    env: { ...process.env }
  };
}

function isProfileLockError(error) {
  return /already running|profile(?: directory)? (?:is |appears to be )?(?:in use|locked)|ProcessSingleton|SingletonLock|user data directory is already in use/i.test(error?.message || '');
}

function isDisplayError(error) {
  return /without having an? XServer|Missing X server|Missing X server or \$DISPLAY|ozone_platform_x11.*Missing X server/i.test(error?.message || '');
}

function chromiumSessionDir() {
  return path.join(browserSessionDir(), 'chromium');
}

function browserError(code, message, systemic, technical = '') {
  const error = new Error(message);
  error.code = code;
  error.systemic = systemic;
  error.technical = technical;
  return error;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
