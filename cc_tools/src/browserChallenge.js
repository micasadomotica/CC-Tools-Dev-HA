import { EventEmitter } from 'node:events';
import { sameNavigationTarget } from './crealityNavigation.js';

const handlers = new WeakMap();
const pending = new WeakMap();
const completedAt = new WeakMap();
const documents = new WeakMap();
export const challengeEvents = new EventEmitter();
export const CHALLENGE_TIMEOUT_MS = 15 * 60 * 1000;
export const CHALLENGE_MANUAL_AFTER_MS = 40000;
let current = null;
let pausedMs = 0;

export function browserChallengeState() {
  if (!current) return { active: false };
  const { page, ...state } = current;
  return state;
}

// Monotonic accumulated waiting time, used to suspend the task watchdog.
export function challengeClock() {
  return pausedMs + (current ? Date.now() - current.startedMs : 0);
}

export function challengeResolvedAt(page) {
  return completedAt.get(page) || 0;
}

export function installChallengeHandling(context, options) {
  const attach = (page) => {
    if (handlers.has(page)) return;
    handlers.set(page, options);
    page.on('response', response => {
      const request = response.request();
      if (request.resourceType() !== 'document' || request.frame() !== page.mainFrame()) return;
      const responseHeaders = response.headers();
      const headers = Object.fromEntries(['cf-mitigated', 'cf-ray', 'content-type', 'retry-after']
        .filter(name => responseHeaders[name]).map(name => [name, responseHeaders[name]]));
      documents.set(page, { status: response.status(), url: response.url(), resourceType: 'document',
        startedAt: new Date().toISOString(), headers, challenge: headers['cf-mitigated'] === 'challenge' });
    });
    for (const method of ['goto', 'reload']) {
      const original = page[method].bind(page);
      page[method] = async (...args) => {
        const target = method === 'goto' ? String(args[0]) : page.url();
        let response;
        let navigationError;
        try { response = await original(...args); }
        catch (error) { navigationError = error; }
        if (options.enabled()) {
          const diagnostic = await options.inspect(page, null, { handleChallenge: false });
          if (diagnostic?.code === 'SECURITY_CHALLENGE') {
            await resolveBrowserChallenge(page, diagnostic, target);
            // A solved challenge supplies a new document. Do not return its old 429 response.
            return null;
          }
        }
        if (navigationError) throw navigationError;
        return response;
      };
    }
  };
  context.pages().forEach(attach);
  context.on('page', attach);
  return () => context.off('page', attach);
}

export async function resolveBrowserChallenge(page, diagnostic, target = page.url()) {
  const options = handlers.get(page);
  if (!options?.enabled()) return false;
  if (pending.has(page)) return pending.get(page);
  const job = waitForChallenge(page, diagnostic, target, options);
  pending.set(page, job);
  try { return await job; }
  finally { pending.delete(page); }
}

async function waitForChallenge(page, diagnostic, target, options) {
  if (current && current.page !== page) {
    throw challengeError('BROWSER_BUSY', 'Otra pestaña espera una verificación de seguridad.');
  }
  const startedMs = Date.now();
  const timeoutMs = options.timeoutMs ?? CHALLENGE_TIMEOUT_MS;
  const state = {
    page, active: true, phase: 'checking', startedMs,
    startedAt: new Date(startedMs).toISOString(),
    deadlineAt: new Date(startedMs + timeoutMs).toISOString(),
    url: safeTarget(target),
    message: 'Verificación de seguridad en curso. Esperando hasta 40 segundos antes de solicitar tu intervención.'
  };
  current = state;
  challengeEvents.emit('change', browserChallengeState());
  let stable = 0;
  try {
    await options.onStart?.();
    await page.bringToFront().catch(() => {});
    while (Date.now() - startedMs < timeoutMs) {
      if (page.isClosed() || !options.enabled()) {
        throw challengeError('SECURITY_CHALLENGE_CANCELLED', 'La espera de verificación se ha cancelado.');
      }
      const inspection = await options.inspect(page, {
        snapshot: async () => documents.has(page) ? [documents.get(page)] : []
      }, { handleChallenge: false, requireBody: true });
      if (!inspection && sameNavigationTarget(page.url(), target)) {
        const ready = await page.evaluate(() => document.readyState !== 'loading'
          && Boolean(document.body?.innerText.trim())).catch(() => false);
        stable = ready ? stable + 1 : 0;
        if (stable >= 2) {
          completedAt.set(page, Date.now());
          return true;
        }
      } else {
        stable = 0;
        if (['LOGIN_REQUIRED', 'CREALITY_HTTP_ERROR', 'MODEL_NOT_FOUND'].includes(inspection?.code)) {
          const error = challengeError(inspection.code, inspection.message);
          error.diagnostic = inspection;
          throw error;
        }
      }
      if (state.phase === 'checking' && Date.now() - startedMs >= (options.manualAfterMs ?? CHALLENGE_MANUAL_AFTER_MS)) {
        state.phase = 'manual';
        state.message = 'Completa la verificación en el navegador. La tarea continuará al cargar la página de destino.';
        challengeEvents.emit('change', browserChallengeState());
      }
      await page.waitForTimeout(options.pollMs ?? 1000);
    }
    const error = challengeError('SECURITY_CHALLENGE_TIMEOUT',
      'La verificación no se completó en 15 minutos. La tarea se ha detenido; no se repetirá desde el principio.');
    error.diagnostic = { ...diagnostic, code: error.code, message: error.message, systemic: true };
    throw error;
  } finally {
    pausedMs += Date.now() - startedMs;
    if (current === state) current = null;
    challengeEvents.emit('change', browserChallengeState());
  }
}

function challengeError(code, message) {
  return Object.assign(new Error(message), { code, systemic: false });
}

function safeTarget(target) {
  try { const url = new URL(target); return url.origin + url.pathname; }
  catch { return ''; }
}
