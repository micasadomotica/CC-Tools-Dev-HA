import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createBrowserDiagnosticJournal } from '../src/browserDiagnosticJournal.js';

test('persiste los eventos entre tareas y reinicios, limita el historial y separa procesos', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-browser-journal-'));
  t.after(async () => { assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'browser-diagnostics.json');
  const first = createBrowserDiagnosticJournal(4);
  await first.configure(file);
  for (let n = 0; n < 4; n++) first.append({ phase: 'context_closed', reason: 'manual_close', n });
  await first.flush();
  const second = createBrowserDiagnosticJournal(4);
  await second.configure(file);
  const snapshot = second.snapshot();
  assert.equal(snapshot.events.length, 4);
  assert.equal(snapshot.discardedEvents, 2);
  assert.equal(snapshot.events.at(-1).phase, 'process_start');
  assert.notEqual(snapshot.events[0].processId, snapshot.events.at(-1).processId);
  assert.equal(snapshot.events[0].reason, 'manual_close');
  assert.equal(snapshot.persistence, 'ok');
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).events, snapshot.events);
  snapshot.events[0].reason = 'changed';
  assert.equal(second.snapshot().events[0].reason, 'manual_close');
});

test('un fallo de escritura se informa sin romper la automatización', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-browser-journal-'));
  t.after(async () => { assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); await fs.rm(dir, { recursive: true, force: true }); });
  const blocked = path.join(dir, 'file'); await fs.writeFile(blocked, 'test');
  const journal = createBrowserDiagnosticJournal();
  await journal.configure(path.join(blocked, 'journal.json'));
  journal.append({ phase: 'context_closed' });
  await journal.flush();
  assert.equal(journal.snapshot().persistence, 'unavailable');
  assert.equal(journal.snapshot().events.at(-1).phase, 'context_closed');
});
