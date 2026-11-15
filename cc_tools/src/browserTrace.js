import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const traces = new AsyncLocalStorage();
const contexts = new WeakMap();

export function browserDiagnosticContextId(context) {
  if (!contexts.has(context)) contexts.set(context, randomUUID());
  return contexts.get(context);
}

export function browserTraceScope() {
  return traces.getStore() || {};
}

export function withBrowserTrace(taskId, callback) {
  return traces.run({ taskId, traceId: randomUUID() }, callback);
}
