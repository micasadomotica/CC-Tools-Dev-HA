import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import express from 'express';
import { createUploadLibrary, parseUploadInfo, parseProjectUpload } from '../src/uploadDesignLibrary.js';
import { projectUploadDecision, runUploadDesigns } from '../src/uploadDesignTask.js';
import { uploadDesignRoutes } from '../src/uploadDesignRoutes.js';
import { addModel } from './uploadDesignFixtures.js';

const info = 'ETIQUETAS: caja\nDESCRIPCION: Una caja.';

async function fixture(t, infos) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-upload-projects-')), root = path.join(base, 'models');
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const library = createUploadLibrary({ root, dataDir: path.join(base, 'data') }); await library.ensureRoot();
  for (const [name, text] of Object.entries(infos)) await addModel(root, name, { info: text });
  return { library, items: (await library.scan()).inventory };
}
function deps(library) {
  const page = new EventEmitter(); page.close = async () => {}; page.screenshot = async () => { throw new Error('fixture'); };
  return { library, browser: async (_, callback) => callback({ newPage: async () => page }), verifyAccount: async () => {},
    readReward: async () => ({ found: true, done: 0, valid: 5 }),
    submit: async (_, model, { beforeSubmit }) => { await beforeSubmit(); return { id: model.id, name: model.name }; } };
}

test('SUBIR acepta Si, Sí y No sin distinguir mayúsculas ni tildes, y cuenta como No si falta', () => {
  for (const value of ['Si', 'Sí', 'SI', 'sÍ', '  si  ']) assert.equal(parseUploadInfo(info + '\nSUBIR: ' + value).projectUpload, true);
  for (const value of ['No', 'NO', 'no', '', '   ']) assert.equal(parseUploadInfo(info + '\nSUBIR:' + value).projectUpload, false);
  assert.equal(parseUploadInfo(info).projectUpload, false);
  assert.equal(parseProjectUpload('subir : SÍ'), true);
});

test('SUBIR se lee en cualquier posición sin entrar en la descripción ni las etiquetas', () => {
  const expected = { ...parseUploadInfo(info), projectUpload: true };
  for (const text of ['SUBIR: Si\n' + info, info + '\nSUBIR: Si', 'ETIQUETAS: caja\nSUBIR: Si\nDESCRIPCION: Una caja.',
    'CATEGORIA:\r\nSUBIR: Si\r\n' + info.replace('\n', '\r\n')]) assert.deepEqual(parseUploadInfo(text), expected);
});

test('SUBIR con un valor no válido o repetido marca el diseño para revisar', async t => {
  for (const value of ['Quizá', 'Sí, gracias', 'true', '1']) assert.throws(() => parseUploadInfo(info + '\nSUBIR: ' + value), /SUBIR no válido/);
  assert.throws(() => parseUploadInfo(info + '\nSUBIR: Si\nSUBIR: No'), /una sola línea SUBIR/);
  const { items } = await fixture(t, { valido: info + '\nSUBIR: Sí', erroneo: info + '\nSUBIR: tal vez' });
  const byName = Object.fromEntries(items.map(item => [item.folder, item]));
  assert.equal(byName.valido.valid, true); assert.equal(byName.valido.projectUpload, true);
  assert.equal(byName.erroneo.valid, false); assert.match(byName.erroneo.errors.join(' '), /SUBIR no válido/);
});

test('la casilla Cancelar subida 3MF a Proyectos prevalece sobre info.txt', async () => {
  const storage = await fs.readFile(new URL('../src/storage.js', import.meta.url), 'utf8');
  assert.match(storage, /uploadDesigns: \{[^}]*projectUploadCancelled: false/);
  assert.deepEqual(projectUploadDecision({ projectUpload: true }, {}), { upload: true, reason: 'info', message: 'info.txt indica SUBIR: Si.' });
  assert.equal(projectUploadDecision({ projectUpload: false }, {}).upload, false);
  assert.equal(projectUploadDecision({}, {}).upload, false);
  assert.equal(projectUploadDecision({ projectUpload: true }, { projectUploadCancelled: true }).reason, 'cancelled');
  assert.equal(projectUploadDecision({ projectUpload: true }, { projectUploadCancelled: true }).upload, false);
});

test('el flujo registra la decisión de Proyectos de cada diseño en el historial sin subir nada todavía', async t => {
  for (const cancelled of [false, true]) {
    const { library, items } = await fixture(t, { conProyecto: info + '\nSUBIR: Si', sinProyecto: info + '\nSUBIR: No', sinLinea: info });
    const result = await runUploadDesigns({ projectUploadCancelled: cancelled }, { ownUserId: 'user', selected: items }, deps(library));
    assert.equal(result.success, true);
    const decisions = Object.fromEntries(result.details.projectUploads.map(item => [item.name, item]));
    assert.deepEqual(Object.keys(decisions).sort(), ['conProyecto', 'sinLinea', 'sinProyecto']);
    assert.equal(decisions.conProyecto.upload, !cancelled);
    assert.equal(decisions.conProyecto.status, cancelled ? 'skipped' : 'pending');
    assert.equal(decisions.conProyecto.reason, cancelled ? 'cancelled' : 'info');
    for (const name of ['sinProyecto', 'sinLinea']) assert.deepEqual([decisions[name].upload, decisions[name].status], [false, 'skipped']);
    assert.equal(result.message.includes('Proyectos: 1 pendiente de subir.'), !cancelled);
    const ledger = Object.values((await library.status()).ledger.user);
    assert.equal(ledger.length, 3);
    for (const entry of ledger) {
      assert.equal(entry.status, 'submitted');
      assert.equal(entry.project.upload, decisions[entry.name].upload);
      assert.ok(Number.isFinite(Date.parse(entry.project.decidedAt)));
    }
  }
});

test('API guarda Cancelar subida 3MF a Proyectos en la configuración de la tarea', async t => {
  const { library } = await fixture(t, {});
  const config = { tasks: { uploadDesigns: { projectUploadCancelled: false } } };
  const app = express(); app.use(express.json());
  app.use('/api/upload-designs', uploadDesignRoutes(library, { readConfig: async () => config, writeConfig: async value => Object.assign(config, value) }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const put = body => fetch(`http://127.0.0.1:${server.address().port}/api/upload-designs/projects`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const saved = await put({ cancelled: true }); assert.equal(saved.status, 200);
  assert.equal((await saved.json()).schedule.projectUploadCancelled, true);
  assert.equal(config.tasks.uploadDesigns.projectUploadCancelled, true);
  for (const body of [{}, { cancelled: 'si' }]) assert.equal((await put(body)).status, 400);
  assert.equal(config.tasks.uploadDesigns.projectUploadCancelled, true);
  assert.equal((await (await put({ cancelled: false })).json()).schedule.projectUploadCancelled, false);
});
