import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Only callers that have already removed secrets may write to this journal.
// It also retains events outside a task and events after its run was saved.
export function createBrowserDiagnosticJournal(limit = 500) {
  const processId = randomUUID();
  let sequence = 0, events = [], discardedEvents = 0, file = null;
  let writes = Promise.resolve(), persistence = 'memory';
  const snapshot = () => ({ processId, persistence, limit, discardedEvents,
    events: structuredClone(events) });
  const append = entry => {
    const event = { ...entry, processId, sequence: ++sequence };
    events.push(event);
    if (events.length > limit) discardedEvents += events.splice(0, events.length - limit).length;
    if (file) {
      const content = JSON.stringify({ events, discardedEvents });
      writes = writes.then(async () => {
        await fs.writeFile(`${file}.tmp`, content, { mode: 0o600 });
        await fs.rename(`${file}.tmp`, file);
        persistence = 'ok';
      }).catch(() => { persistence = 'unavailable'; });
    }
    return event;
  };
  return { append, snapshot, flush: () => writes,
    async configure(destination) {
      file = destination;
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        try {
          const stored = JSON.parse(await fs.readFile(file, 'utf8'));
          const old = Array.isArray(stored.events) ? stored.events : [];
          discardedEvents = (Number(stored.discardedEvents) || 0) + Math.max(0, old.length - limit);
          events = old.slice(-limit);
        } catch (error) { if (error.code !== 'ENOENT') persistence = 'unavailable'; }
        append({ at: new Date().toISOString(), kind: 'lifecycle', phase: 'process_start',
          reason: 'application_start', source: 'server' });
        await writes;
      } catch { persistence = 'unavailable'; }
    }
  };
}

export const browserDiagnosticJournal = createBrowserDiagnosticJournal();
