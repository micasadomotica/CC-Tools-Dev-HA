import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { UPLOAD_CATEGORIES, DEFAULT_UPLOAD_CATEGORY, resolveUploadCategory, uploadCategoryMatches, uploadCategoryTextPattern } from '../src/uploadCategories.js';
import { parseUploadInfo, createUploadLibrary } from '../src/uploadDesignLibrary.js';
import { uploadDesignRoutes } from '../src/uploadDesignRoutes.js';
import { addModel } from './uploadDesignFixtures.js';

const info = 'ETIQUETAS: caja, organizador\nDESCRIPCION: Una caja.\nSegunda línea.';
const home = { category: 'Hogar', subcategory: 'Mascotas' };
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-categories-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'models'), dataDir = path.join(base, 'data'); await fs.mkdir(root);
  return { root, dataDir, library: createUploadLibrary({ root, dataDir }) };
}

test('lee CATEGORIA en cualquier posición sin mezclarla con etiquetas o descripción', () => {
  for (const text of [
    'CATEGORIA: Hogar / Mascotas\n' + info,
    info.replace('\nDESCRIPCION:', '\nCATEGORÍA: hogar / mascotas\nDESCRIPCION:'),
    info + '\nCATEGORIA: Hogar / Mascotas'
  ]) assert.deepEqual(parseUploadInfo(text), { ...parseUploadInfo(info), categoryOverride: home });
  assert.deepEqual(parseUploadInfo(info + '\nCATEGORIA:   \n'), parseUploadInfo(info));
  assert.deepEqual(parseUploadInfo('CATEGORIA: \r\n' + info), parseUploadInfo(info));
  assert.deepEqual(parseUploadInfo(info + '\nCATEGORIA: Impresora / Otro').categoryOverride, DEFAULT_UPLOAD_CATEGORY);
  assert.deepEqual(parseUploadInfo(info + '\nCATEGORIA:  educacion  / ayudas educativas').categoryOverride,
    { category: 'Educación', subcategory: 'Ayudas educativas' });
});

test('rechaza categorías desconocidas, combinaciones incorrectas y líneas duplicadas', () => {
  for (const value of ['Hogar', 'Hogar / Cosplay', 'Nueva / Otro', 'Hogar / Mascotas / Otro', '/ Otro', 'MakeNow / Otro']) {
    assert.throws(() => parseUploadInfo(info + '\nCATEGORIA: ' + value), /CATEGORIA no válida/);
  }
  assert.throws(() => parseUploadInfo(info + '\nCATEGORIA:\nCATEGORIA: Hogar / Otro'), /una sola línea/);
  assert.equal(uploadCategoryMatches('Hogar / Otro', home), false);
  assert.equal(uploadCategoryMatches('Hogar / Mascotas / Otro', home), false);
});

test('catálogo completo y coincidencias exactas, con tildes, espacios y aliases compatibles', () => {
  assert.equal(UPLOAD_CATEGORIES.length, 10);
  assert.equal(UPLOAD_CATEGORIES.reduce((n, entry) => n + entry.subcategories.length, 0), 45);
  for (const { category, subcategories } of UPLOAD_CATEGORIES) {
    for (const subcategory of subcategories) {
      assert.deepEqual(resolveUploadCategory(`${category} / ${subcategory}`), { category, subcategory });
      assert.ok(uploadCategoryTextPattern(category).test(category));
      assert.ok(uploadCategoryTextPattern(subcategory).test(subcategory));
    }
  }
  assert.ok(uploadCategoryMatches('3D Printers / Other', DEFAULT_UPLOAD_CATEGORY));
  assert.ok(uploadCategoryTextPattern('Juguetes de construcción').test('Juegos de construcción'));
});

test('persiste el selector, aplica la prioridad al preparar y conserva archivos y selecciones', async t => {
  const { root, dataDir, library } = await fixture(t);
  await addModel(root, 'sin-categoria', { info });
  await addModel(root, 'vacia', { info: info + '\nCATEGORIA:' });
  const overrideInfo = info + '\nCATEGORIA: Moda / Cosplay';
  const folder = await addModel(root, 'propia', { info: overrideInfo });
  await addModel(root, 'invalida', { info: info + '\nCATEGORIA: Hogar / Cosplay' });
  const scanned = await library.scan();
  assert.deepEqual(scanned.defaultCategory, DEFAULT_UPLOAD_CATEGORY);
  assert.equal(scanned.inventory.find(item => item.folder === 'invalida').valid, false);
  const entries = scanned.inventory.filter(item => item.valid);
  await library.saveManual(entries);
  await library.saveSchedule({ enabled: true, dailyLimit: 3, windowStart: '08:00', windowEnd: '12:00', selected: entries });
  await library.saveDefaultCategory(home);
  const reopened = createUploadLibrary({ root, dataDir });
  const state = await reopened.status();
  assert.deepEqual(state.defaultCategory, home);
  assert.equal(state.manualReady, true); assert.equal(state.scheduleReady, true);
  for (const entry of entries) {
    const prepared = await reopened.prepare(entry);
    assert.deepEqual(prepared.category, entry.folder === 'propia' ? { category: 'Moda', subcategory: 'Cosplay' } : home);
    assert.equal(prepared.fingerprint, entry.fingerprint);
    assert.equal(prepared.description, 'Una caja.\nSegunda línea.');
  }
  assert.equal(await fs.readFile(path.join(folder, 'info.txt'), 'utf8'), overrideInfo);
  const batch = await reopened.candidates({ account: 'test', source: 'schedule', day: '2026-10-22', limit: 3 });
  await reopened.saveDefaultCategory({ category: 'MakeNow', subcategory: 'CubeMe' });
  assert.deepEqual((await reopened.prepare(entries.find(e => e.folder === 'vacia'), batch.defaultCategory)).category, home);
  await assert.rejects(reopened.saveDefaultCategory({ category: 'Hogar', subcategory: 'Cosplay' }), /no válida/);
  assert.equal((await reopened.status()).defaultCategory.subcategory, 'CubeMe');
});

test('bibliotecas anteriores usan Impresoras 3D / Otro sin perder la programación', async t => {
  const { root, dataDir, library } = await fixture(t);
  await addModel(root, 'case'); const scanned = await library.scan();
  const file = path.join(dataDir, 'upload-designs.json');
  const old = JSON.parse(await fs.readFile(file, 'utf8')); delete old.defaultCategory;
  await fs.writeFile(file, JSON.stringify(old));
  const reopened = createUploadLibrary({ root, dataDir });
  assert.deepEqual((await reopened.status()).defaultCategory, DEFAULT_UPLOAD_CATEGORY);
  assert.deepEqual((await reopened.prepare(scanned.inventory[0])).category, DEFAULT_UPLOAD_CATEGORY);
});

test('API guarda combinaciones válidas y rechaza datos inválidos sin modificar el selector', async t => {
  const { library } = await fixture(t);
  const app = express(); app.use(express.json());
  app.use('/api/upload-designs', uploadDesignRoutes(library, { readConfig: async () => ({ tasks: { uploadDesigns: {} } }) }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/upload-designs/category`;
  const put = value => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const saved = await put(home); assert.equal(saved.status, 200);
  const result = await saved.json(); assert.deepEqual(result.defaultCategory, home); assert.equal(result.categories.length, 10);
  for (const body of [{}, { category: 'Hogar' }, { category: 'Hogar', subcategory: 'Cosplay' }]) assert.equal((await put(body)).status, 400);
  assert.deepEqual((await library.status()).defaultCategory, home);
});
