import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { browserDiagnosticJournal } from './browserDiagnosticJournal.js';

const traces = new AsyncLocalStorage();
const contexts = new WeakMap();
const names = new Set(['cf_clearance', '__cf_bm']);
const roots = ['crealitycloud.com', 'creality.com', 'crealitycloud.cn', 'creality.cn'];
const phases = new Set(['module_start', 'module_end', 'challenge_before', 'challenge_after',
  'challenge_unsolved', 'interactive_open', 'interactive_check', 'context_before_close']);
let previous = null;
const MAX_EVENTS = 100;

export function browserDiagnosticContextId(context) {
  if (!contexts.has(context)) contexts.set(context, randomUUID());
  return contexts.get(context);
}

export function cookieDiagnosticScope() {
  const trace = traces.getStore();
  return trace ? { taskId: trace.taskId, traceId: trace.traceId } : {};
}

export function withCookieDiagnostics(taskId, callback) {
  const trace = { taskId, traceId: randomUUID(), events: [], omittedEvents: 0 };
  return traces.run(trace, callback);
}

export function cookieDiagnosticsSnapshot() {
  const trace = traces.getStore();
  if (!trace?.events.length) return null;
  return { traceId: trace.traceId, taskId: trace.taskId,
    events: structuredClone(trace.events), omittedEvents: trace.omittedEvents };
}

function allowedDomain(domain) {
  return typeof domain === 'string' && domain.length <= 253
    && /^\.?[a-z0-9.-]+$/i.test(domain)
    && roots.some(root => domain.replace(/^\./, '').toLowerCase() === root
      || domain.toLowerCase().endsWith(`.${root}`));
}

function originOnly(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedDomain(url.hostname) ? url.origin : '';
  } catch { return ''; }
}

// Explicit allowlist: never read, hash, copy or serialize cookie.value, raw
// headers, cookie paths, URL queries, or exception messages from Playwright.
export function cloudflareCookieMetadata(cookies, now = Date.now()) {
  return cookies.filter(cookie => names.has(cookie.name) && allowedDomain(cookie.domain))
    .slice(0, 64).map(cookie => {
      const expiry = Number(cookie.expires);
      const finiteExpiry = Number.isFinite(expiry) && expiry > 0 && expiry <= 8640000000000;
      return {
        name: cookie.name,
        domain: cookie.domain.toLowerCase(),
        expiresAt: finiteExpiry ? new Date(expiry * 1000).toISOString() : null,
        session: expiry === -1,
        expired: finiteExpiry ? expiry * 1000 <= now : null,
        secure: cookie.secure === true,
        httpOnly: cookie.httpOnly === true,
        sameSite: ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : null,
        partitioned: Boolean(cookie.partitionKey)
      };
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export async function recordCookieDiagnostics(context, phase, { url = '', reused = null } = {}) {
  if (!context || !phases.has(phase)) return;
  const trace = traces.getStore();
  const entry = { at: new Date().toISOString(), phase, contextId: browserDiagnosticContextId(context),
    origin: originOnly(url), reused: typeof reused === 'boolean' ? reused : null };
  let timer;
  try {
    const cookies = await Promise.race([
      context.cookies(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('unavailable')), 2000); })
    ]);
    entry.cookies = cloudflareCookieMetadata(cookies);
    entry.readStatus = 'ok';
    entry.clearancePresent = entry.cookies.some(cookie => cookie.name === 'cf_clearance');
    if (previous) {
      entry.previous = { at: previous.at, phase: previous.phase, contextId: previous.contextId,
        taskId: previous.taskId };
      entry.sameContext = previous.contextId === entry.contextId;
      entry.sameMetadata = JSON.stringify(previous.cookies) === JSON.stringify(entry.cookies);
      const identities = values => [...new Set(values.map(c => `${c.name}@${c.domain}`))];
      const before = identities(previous.cookies), after = identities(entry.cookies);
      entry.appeared = after.filter(id => !before.includes(id));
      entry.disappeared = before.filter(id => !after.includes(id));
    }
    previous = { ...entry, taskId: trace?.taskId || null };
  } catch {
    entry.readStatus = 'unavailable';
    // An unavailable read is neither an empty cookie jar nor a new baseline.
  } finally { clearTimeout(timer); }

  if (trace) {
    if (trace.events.length < MAX_EVENTS) trace.events.push(entry);
    else trace.omittedEvents++;
  }
  // The record is fully sanitized before either log sink sees it.
  browserDiagnosticJournal.append({ ...entry, ...cookieDiagnosticScope(), kind: 'cookies' });
  try { console.log('[browser-cookies]', JSON.stringify({ ...entry,
    ...(trace ? { taskId: trace.taskId, traceId: trace.traceId } : {}) })); } catch {}
}
