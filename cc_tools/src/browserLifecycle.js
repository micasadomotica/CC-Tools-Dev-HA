import { browserDiagnosticContextId, cookieDiagnosticScope } from './cookieDiagnostics.js';
import { browserDiagnosticJournal } from './browserDiagnosticJournal.js';

const owners = new WeakMap();
const sources = new Set(['automation', 'interactive', 'session_check', 'session_recovery',
  'progress_sync', 'profile_refresh', 'download', 'scheduler', 'server', 'shutdown', 'playwright']);
const phases = new Set(['context_created', 'context_reused', 'context_close_requested',
  'context_closed', 'context_close_failed', 'context_restart_requested', 'context_replacement',
  'module_released', 'module_lease_lost', 'page_closed', 'page_crashed', 'browser_disconnected',
  'profile_recovery', 'headless_fallback', 'browser_environment', 'process_exited']);
const reasons = new Set(['new_context', 'compatible_options', 'options_changed', 'visible_browser_required',
  'task_failed', 'task_completed', 'manual_close', 'interactive_launch_failed', 'session_recovery_failed',
  'application_shutdown', 'task_timeout', 'maintenance_timeout', 'stale_task_timeout', 'task_cancelled',
  'verification_cancelled', 'abort_requested', 'restart_requested', 'download_page_closed',
  'keeper_failed', 'unrequested_close', 'requested_close', 'close_failed', 'lease_lost',
  'page_event', 'page_crash', 'disconnect_event', 'profile_preflight', 'profile_lock_retry', 'display_unavailable',
  'environment_probe', 'process_exit', 'connection_mode_changed']);
const optionNames = new Set(['headless', 'viewport', 'screen', 'deviceScaleFactor', 'colorScheme',
  'acceptDownloads', 'timeout', 'locale', 'timezoneId', 'args', 'downloadsPath', 'userAgent']);

export function bindBrowserDiagnostics(context, source) {
  if (context) owners.set(context, { ...cookieDiagnosticScope(),
    source: sources.has(source) ? source : 'automation' });
}

export function recordBrowserLifecycle(context, phase, options = {}) {
  if (!phases.has(phase)) return;
  const owner = context ? owners.get(context) : null;
  const entry = { at: new Date().toISOString(), kind: 'lifecycle', phase,
    contextId: context ? browserDiagnosticContextId(context) : null,
    ...cookieDiagnosticScope(), ...owner,
    source: sources.has(options.source) ? options.source : owner?.source || 'playwright',
    reason: reasons.has(options.reason) ? options.reason : 'unrequested_close' };
  if (options.relatedContext) entry.relatedContextId = browserDiagnosticContextId(options.relatedContext);
  if (options.page) entry.pageId = browserDiagnosticContextId(options.page);
  if (Number.isSafeInteger(options.pageCount) && options.pageCount >= 0) entry.pageCount = options.pageCount;
  if (typeof options.requested === 'boolean') entry.requested = options.requested;
  if (['standard', 'external-cdp'].includes(options.connectionMode)) entry.connectionMode = options.connectionMode;
  if (/^[0-9.]{1,40}$/.test(options.browserVersion || '')) entry.browserVersion = options.browserVersion;
  if (typeof options.webdriver === 'boolean' || options.webdriver === null) entry.webdriver = options.webdriver;
  if (typeof options.webdriverBeforeConnect === 'boolean' || options.webdriverBeforeConnect === null) entry.webdriverBeforeConnect = options.webdriverBeforeConnect;
  for (const key of ['exitCode', 'pid']) if (Number.isSafeInteger(options[key])) entry[key] = options[key];
  if (['SIGTERM', 'SIGKILL', 'SIGSEGV', 'SIGABRT', 'SIGINT', 'SIGILL', 'SIGBUS'].includes(options.signal)) entry.signal = options.signal;
  if (Array.isArray(options.changedOptions)) entry.changedOptions = options.changedOptions.filter(key => optionNames.has(key));
  for (const key of ['terminatedProcesses', 'remainingProcesses', 'removedLocks']) {
    if (Number.isSafeInteger(options[key]) && options[key] >= 0) entry[key] = options[key];
  }
  browserDiagnosticJournal.append(entry);
  try { console.log('[browser-lifecycle]', JSON.stringify(entry)); } catch {}
  return entry;
}
