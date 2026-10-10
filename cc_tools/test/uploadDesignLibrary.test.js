import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { createUploadLibrary, parseUploadInfo, nextUploadPreview, coverDimensions } from '../src/uploadDesignLibrary.js';
import { uploadDesignRoutes } from '../src/uploadDesignRoutes.js';
import { addModel, modelZip, png } from './uploadDesignFixtures.js';

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-upload-'));
  const root = path.join(base, 'media'), dataDir = path.join(base, 'data');
  await fs.mkdir(root);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return { base, root, dataDir, library: createUploadLibrary({ root, dataDir }) };
}
const selected = items => items.map(({ id, name, fingerprint, modelHash }) => ({ id, name, fingerprint, modelHash }));
const schedule = entries => ({ enabled: true, dailyLimit: entries.length, windowStart: '08:00', windowEnd: '12:00', selected: entries });

test('lee UTF-8, BOM, saltos Windows, etiquetas únicas y descripción multilínea', () => {
  assert.deepEqual(parseUploadInfo('\ufeffETIQUETAS:\r\ncaja; caja, 3D\r\n\r\nDESCRIPCIÓN:\r\nUna caja.\r\nSegunda línea.'), { tags: ['caja', '3D'], description: 'Una caja.\nSegunda línea.' });
  assert.throws(() => parseUploadInfo('ETIQUETAS:\n\nDESCRIPCION:\nTexto'), /Faltan etiquetas/);
  assert.throws(() => parseUploadInfo('ETIQUETAS:\ncaja\nDESCRIPCION:\n'), /Falta descripción/);
  assert.throws(() => parseUploadInfo('Texto libre'), /debe contener/);
});
test('omite el apartado final de recomendaciones sin alterar la descripción principal', () => {
  for (const heading of ['Recomendaciones de impresión:', 'RECOMENDACIONES DE IMPRESION:', '  Recomendaciones de Impresión :']) {
    const result = parseUploadInfo(`ETIQUETAS: marco\nDESCRIPCION:\nMarco para el mando.\nSegunda línea.\n\n${heading}\nSin recomendaciones\nOtra indicación.`);
    assert.equal(result.description, 'Marco para el mando.\nSegunda línea.');
  }
  const prose = 'Incluye recomendaciones de impresión: consulta al fabricante.';
  assert.equal(parseUploadInfo(`ETIQUETAS: marco\nDESCRIPCION:\n${prose}`).description, prose);
  assert.throws(() => parseUploadInfo('ETIQUETAS: marco\nDESCRIPCION:\nRecomendaciones de impresión:\nSin recomendaciones'), /Falta descripción/);
});

test('prepara para publicar solo la descripción y conserva intacto info.txt', async t => {
  const { library, root } = await fixture(t);
  const info = 'ETIQUETAS: marco\nDESCRIPCION:\nMarco embellecedor.\n\nRecomendaciones de impresión:\nSin recomendaciones';
  const folder = await addModel(root, 'marco', { info });
  const item = (await library.scan()).inventory[0];
  assert.equal(item.description, 'Marco embellecedor.');
  assert.equal((await library.prepare(item)).description, 'Marco embellecedor.');
  assert.equal(await fs.readFile(path.join(folder, 'info.txt'), 'utf8'), info);
});

test('escanea modelos, conserva primeras detecciones y avisa sobre perfiles desconocidos', async t => {
  const { library, root, dataDir } = await fixture(t);
  await addModel(root, 'case'); await addModel(root, 'soporte', { profile: false });
  const result = await library.scan();
  assert.equal(result.inventory.length, 2); assert.ok(result.inventory.every(item => item.valid));
  assert.match(result.inventory[1].warnings[0], /No se ha reconocido/);
  assert.equal(result.uploadsAvailable, true); assert.equal(result.schedulerConnected, true);
  const again = await createUploadLibrary({ root, dataDir }).scan();
  assert.deepEqual(again.inventory.map(item => item.firstSeen), result.inventory.map(item => item.firstSeen));
});
test('muestra ausencias, ambigüedad, falsa extensión 3MF y portadas incompatibles', async t => {
  const { library, root } = await fixture(t);
  await fs.mkdir(path.join(root, 'incompleto'));
  await addModel(root, 'falso', { model: Buffer.from('not a zip') });
  await addModel(root, 'vertical', { width: 90, height: 120 });
  const multi = await addModel(root, 'varios'); await fs.writeFile(path.join(multi, 'otro.3mf'), await modelZip('otro'));
  await addModel(root, 'texto', { info: 'ETIQUETAS:\ncaja\nDESCRIPCION:\n' });
  await fs.mkdir(path.join(root, '.en-preparacion'));
  const result = await library.scan();
  assert.equal(result.inventory.length, 5); assert.ok(result.inventory.every(item => !item.valid));
  assert.equal(result.inventory.find(item => item.folder === 'incompleto').errors.length, 3);
  assert.match(result.inventory.find(item => item.folder === 'vertical').errors[0], /4:3/);
});
test('detecta copias idénticas aunque cambien de nombre y no las permite seleccionar', async t => {
  const { library, root } = await fixture(t);
  const model = await modelZip('same'); await addModel(root, 'a', { model }); await addModel(root, 'b', { model });
  const result = await library.scan();
  assert.ok(result.inventory.every(item => !item.valid && item.errors.some(error => /duplicado/.test(error))));
  await assert.rejects(library.saveManual(selected(result.inventory)), /ha cambiado/);
});
test('guarda selecciones independientes, mantiene la biblioteca intacta y persiste tras reiniciar', async t => {
  const { library, root, dataDir } = await fixture(t);
  await addModel(root, 'a'); await addModel(root, 'b');
  const initial = await library.scan(); const entries = selected(initial.inventory);
  await Promise.all([library.saveManual(entries.slice(0, 1)), library.saveSchedule(schedule(entries))]);
  const persisted = await createUploadLibrary({ root, dataDir }).status();
  assert.equal(persisted.manual.length, 1); assert.equal(persisted.schedule.selected.length, 2);
  assert.equal(persisted.scheduleReady, true); assert.equal(persisted.schedule.enabled, true);
  assert.equal((await fs.readdir(root)).length, 2);
  assert.deepEqual(await fs.readdir(dataDir), ['upload-designs.json']);
});
test('exige cantidad exacta, rango 1–5, horario válido e identificadores únicos', async t => {
  const { library, root } = await fixture(t); await addModel(root, 'a');
  const entries = selected((await library.scan()).inventory);
  for (const patch of [{ dailyLimit: 0 }, { dailyLimit: 6 }, { dailyLimit: 1.5 }, { windowStart: '25:00' }, { windowEnd: '07:00' }, { windowEnd: '08:00' }, { enabled: 'true' }]) {
    await assert.rejects(library.saveSchedule({ ...schedule(entries), ...patch }), /Indica/);
  }
  await assert.rejects(library.saveSchedule({ ...schedule(entries), dailyLimit: 2 }), /exactamente 2/);
  await assert.rejects(library.saveManual([...entries, ...entries]), /no es válida/);
  await assert.rejects(library.saveManual(Array(6).fill(entries[0])), /no es válida/);
});
test('revalida cambios de texto, desaparición y permite apagar con biblioteca inaccesible', async t => {
  const { library, root } = await fixture(t); const dir = await addModel(root, 'a');
  const entries = selected((await library.scan()).inventory); await library.saveSchedule(schedule(entries));
  await fs.appendFile(path.join(dir, 'info.txt'), '\nModificado');
  await assert.rejects(library.saveManual(entries), /ha cambiado/);
  assert.equal((await library.scan()).scheduleReady, false);
  await fs.rename(root, root + '-moved');
  const missing = await library.scan(); assert.ok(missing.libraryError); assert.equal(missing.scheduleReady, false);
  assert.equal((await library.disableSchedule()).schedule.enabled, false);
});
test('simula siguientes días con lote parcial y agotado sin consumir modelos', async t => {
  const { library, root } = await fixture(t);
  for (const name of ['a', 'b', 'c']) await addModel(root, name);
  const result = await library.scan(); await library.saveSchedule(schedule(selected(result.inventory.slice(0, 2))));
  const preview = await library.preview(); assert.equal(preview.preview.models.length, 1); assert.equal(preview.preview.missing, 1);
  assert.match(preview.preview.notification, /Faltan 1/);
  assert.deepEqual((await library.preview()).preview, preview.preview);
  assert.equal((await library.status()).inventory.filter(item => item.valid).length, 3);
  const empty = nextUploadPreview(result.inventory, selected(result.inventory), 5);
  assert.equal(empty.notification, 'No hay nuevos diseños para subir.');
});
test('rechaza enlaces que salen de la biblioteca y no publica ficheros arbitrarios', async t => {
  const { library, root, base } = await fixture(t);
  const outside = path.join(base, 'outside'); await fs.mkdir(outside); await addModel(outside, 'secreto');
  await fs.symlink(outside, path.join(root, 'enlace'), 'junction');
  const result = await library.scan(); assert.equal(result.inventory[0].valid, false); assert.match(result.inventory[0].errors[0], /enlaces/);
  await assert.rejects(library.cover('../outside'), /no encontrada/);
});
test('reconoce dimensiones PNG y rechaza imágenes truncadas', () => {
  assert.deepEqual(coverDimensions(png()), { width: 120, height: 90, type: 'image/png' });
  assert.throws(() => coverDimensions(png().subarray(0, 45)), /incompleta/);
  assert.throws(() => coverDimensions(Buffer.from('<svg/>')), /no es una imagen/);
});
test('la biblioteca debe existir previamente y nunca se crea al escanear', async t => {
  const { root, dataDir } = await fixture(t);
  const missing = path.join(root, 'no-existe');
  const result = await createUploadLibrary({ root: missing, dataDir }).scan();
  assert.match(result.libraryError, /Crea \/media\/cctools_3d_models/);
  await assert.rejects(fs.stat(missing), { code: 'ENOENT' });
});
test('API permite preparar, programar y ejecutar una selección validada', async t => {
  const { library, root } = await fixture(t); await addModel(root, 'case');
  const config = { crealityProfile: { userId: 'test' }, tasks: { uploadDesigns: {} }, timezone: 'Europe/Madrid' };
  const calls = [];
  const app = express(); app.use(express.json()); app.use('/api/upload-designs', uploadDesignRoutes(library, {
    readConfig: async () => config, writeConfig: async () => {}, runTaskNow: async (...args) => { calls.push(args); return { status: 'success' }; }
  }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/upload-designs`;
  const result = await (await fetch(url + '/scan', { method: 'POST' })).json();
  assert.equal(result.ok, true);
  const image = await fetch(url + '/cover/' + result.inventory[0].id); assert.equal(image.headers.get('content-type'), 'image/png');
  const response = await fetch(url + '/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedule(selected(result.inventory))) });
  assert.equal(response.status, 200);
  assert.equal((await (await fetch(url + '/preview', { method: 'POST' })).json()).preview.models.length, 0);
  assert.equal((await fetch(url + '/run', { method: 'POST' })).status, 400);
  const run = await fetch(url + '/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: selected(result.inventory) }) });
  assert.equal(run.status, 200); assert.equal(calls[0][0], 'uploadDesigns');
  assert.equal(config.tasks.uploadDesigns.enabled, true); assert.ok(config.tasks.uploadDesigns.nextRunAt);
});
