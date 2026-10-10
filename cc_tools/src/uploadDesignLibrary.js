import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const digest = value => createHash('sha256').update(value).digest('hex');
const MAX_MODEL = 256 * 1024 * 1024;
const MAX_COVER = 20 * 1024 * 1024;
const MAX_FOLDERS = 500;
const clock = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const defaults = () => ({ version: 1, manual: [], schedule: { enabled: false, dailyLimit: 5,
  windowStart: '08:00', windowEnd: '12:00', selected: [] }, firstSeen: {}, ledger: {}, inventory: [], scannedAt: '', libraryError: '' });

function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export const uploadLibrary = createUploadLibrary();

export function uploadImageKind(name) {
  if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) return '';
  const stem = path.basename(name, path.extname(name)).toLowerCase();
  if (stem === 'portada2') return 'appCover';
  if (/^imagen[1-9]$/.test(stem)) return 'image' + stem.slice(6);
  if (/^imagen\d+$/.test(stem)) throw problem('Usa imagen1 hasta imagen9 para las imágenes del modelo.');
  return 'cover';
}

function validateImage(data, kind, name) {
  if (!data.length || data.length > MAX_COVER) throw problem(`${name}: la imagen debe ocupar entre 1 byte y 20 MB.`);
  const dimensions = coverDimensions(data), ratio = kind === 'appCover' ? 3 / 4 : 4 / 3;
  if (!dimensions.width || !dimensions.height || Math.abs(dimensions.width / dimensions.height - ratio) > .01) {
    throw problem(`${name}: debe tener proporción ${kind === 'appCover' ? '3:4' : '4:3'}.`);
  }
  return dimensions;
}

export function parseUploadInfo(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^\s*ETIQUETAS:\s*\n?([\s\S]*?)^\s*DESCRIPCI[ÓO]N:\s*\n?([\s\S]*)$/im);
  if (!match) throw problem('info.txt debe contener ETIQUETAS: y DESCRIPCION:, en ese orden.');
  const tags = [...new Set(match[1].split(/[,;\n]/).map(tag => tag.trim()).filter(Boolean))];
  // Older info.txt templates append printing advice after the model description.
  // Keep the source file intact, but omit that trailing section from publication.
  const description = match[2].replace(/^[\t ]*Recomendaciones[\t ]+de[\t ]+impresi[óo]n[\t ]*:[\s\S]*$/im, '').trim();
  if (tags.length > 20 || tags.some(tag => tag.length > 30)) throw problem('Usa un máximo de 20 etiquetas de hasta 30 caracteres.');
  if (!tags.length) throw problem('Faltan etiquetas en info.txt.');
  if (!description) throw problem('Falta descripción en info.txt.');
  return { tags, description };
}

export function coverDimensions(data) {
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    if (data.readUInt32LE(4) + 8 !== data.length) throw problem('La portada WebP está incompleta.');
    let offset = 12, dimensions, imageFound = false;
    while (offset + 8 <= data.length) {
      const kind = data.toString('ascii', offset, offset + 4), size = data.readUInt32LE(offset + 4), p = offset + 8;
      if (p + size > data.length) throw problem('La portada WebP está incompleta.');
      if (kind === 'VP8X' && size >= 10) {
        if (data[p] & 2) throw problem('Usa una portada WebP estática, sin animación.');
        dimensions = { width: data.readUIntLE(p + 4, 3) + 1, height: data.readUIntLE(p + 7, 3) + 1 };
      }
      if (kind === 'VP8 ' && size >= 10 && data.subarray(p + 3, p + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) {
        imageFound = true; dimensions ||= { width: data.readUInt16LE(p + 6) & 0x3fff, height: data.readUInt16LE(p + 8) & 0x3fff };
      }
      if (kind === 'VP8L' && size >= 5 && data[p] === 0x2f) {
        const bits = data.readUInt32LE(p + 1); imageFound = true;
        dimensions ||= { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      }
      offset = p + size + (size % 2);
    }
    if (dimensions && imageFound) return { ...dimensions, type: 'image/webp' };
    throw problem('No se reconoce la portada WebP.');
  }
  if (data.length >= 45 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      data.toString('ascii', 12, 16) === 'IHDR') {
    let offset = 8, hasData = false, hasEnd = false;
    while (offset + 12 <= data.length) {
      const size = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
      if (offset + size + 12 > data.length) throw problem('La portada PNG está incompleta.');
      if (type === 'IDAT') hasData = true;
      if (type === 'IEND') { hasEnd = true; break; }
      offset += size + 12;
    }
    if (!hasData || !hasEnd) throw problem('La portada PNG está incompleta.');
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), type: 'image/png' };
  }
  if (data.length >= 4 && data.readUInt16BE(0) === 0xffd8 && data.readUInt16BE(data.length - 2) === 0xffd9) {
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 0xff) break;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      const size = data.readUInt16BE(offset);
      if (size < 2 || offset + size > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) {
        return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5), type: 'image/jpeg' };
      }
      offset += size;
    }
  }
  throw problem('La portada no es una imagen PNG, JPEG o WebP reconocible.');
}

// Read only the bounded ZIP directory and content-types entry; never extract files to disk.
export async function inspect3mf(file, size) {
  const handle = await fs.open(file, 'r');
  const read = async (length, offset) => {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead !== length) throw problem('El archivo 3MF está incompleto.');
    return buffer;
  };
  try {
    const tailLength = Math.min(size, 65557), tail = await read(tailLength, size - tailLength);
    let end = tail.length - 22;
    for (; end >= 0; end--) {
      if (tail.readUInt32LE(end) === 0x06054b50 && end + 22 + tail.readUInt16LE(end + 20) === tail.length) break;
    }
    if (end < 0) throw problem('El .3mf no contiene un archivo ZIP válido.');
    const count = tail.readUInt16LE(end + 10), length = tail.readUInt32LE(end + 12), start = tail.readUInt32LE(end + 16);
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || count === 65535 ||
        count > 20000 || length > 8 * 1024 * 1024 || start + length > size - tailLength + end) {
      throw problem('La estructura ZIP del 3MF no está admitida en esta versión.');
    }
    const directory = await read(length, start), names = [];
    let offset = 0, types;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014b50) throw problem('El índice del 3MF está dañado.');
      const nameLength = directory.readUInt16LE(offset + 28), extra = directory.readUInt16LE(offset + 30), comment = directory.readUInt16LE(offset + 32);
      const next = offset + 46 + nameLength + extra + comment;
      if (next > directory.length) throw problem('El índice del 3MF está incompleto.');
      const name = directory.toString('utf8', offset + 46, offset + 46 + nameLength);
      if (directory.readUInt16LE(offset + 8) & 1) throw problem('El 3MF no puede estar cifrado.');
      if (name.includes('..') || name.startsWith('/') || name.includes('\\')) throw problem('El 3MF contiene rutas no admitidas.');
      names.push(name);
      if (name === '[Content_Types].xml') types = { method: directory.readUInt16LE(offset + 10),
        compressed: directory.readUInt32LE(offset + 20), uncompressed: directory.readUInt32LE(offset + 24), position: directory.readUInt32LE(offset + 42) };
      const local = directory.readUInt32LE(offset + 42), compressed = directory.readUInt32LE(offset + 20);
      if (local + 30 + compressed > start) throw problem('El 3MF contiene una entrada incompleta.');
      offset = next;
    }
    if (!types || !names.some(name => /\.model$/i.test(name)) || !names.includes('_rels/.rels')) throw problem('Falta la estructura de un modelo 3MF.');
    if (types.compressed > 1024 * 1024 || types.uncompressed > 1024 * 1024) throw problem('El manifiesto 3MF es demasiado grande.');
    const header = await read(30, types.position);
    if (header.readUInt32LE(0) !== 0x04034b50) throw problem('El manifiesto del 3MF está dañado.');
    const payloadStart = types.position + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    if (payloadStart + types.compressed > start) throw problem('El manifiesto del 3MF está incompleto.');
    const compressed = await read(types.compressed, payloadStart);
    const xml = types.method === 0 ? compressed : types.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 }) : null;
    if (!xml || !/application\/vnd\.ms-package\.3dmanufacturing-3dmodel\+xml/i.test(xml.toString('utf8'))) throw problem('El manifiesto no identifica un modelo 3MF.');
    return names.some(name => /metadata\/(project_settings|model_settings|slice_info|.*print.*)/i.test(name));
  } finally { await handle.close(); }
}

export function nextUploadPreview(items, selected, dailyLimit) {
  const excluded = new Set(selected.map(item => item.modelHash));
  const candidates = items.filter(item => item.valid && !excluded.has(item.modelHash))
    .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.folder.localeCompare(b.folder));
  const models = candidates.slice(0, dailyLimit).map(({ id, name }) => ({ id, name }));
  const missing = dailyLimit - models.length;
  return { simulation: true, models, missing, notification: models.length === 0 ? 'No hay nuevos diseños para subir.' :
    missing ? `Solo hay ${models.length} de ${dailyLimit} diseños nuevos disponibles. Faltan ${missing}.` : '',
    message: models.length ? `La siguiente ejecución dispondría de ${models.length} diseños nuevos.` : 'No hay nuevos diseños para subir.' };
}

export function createUploadLibrary({ root = '/media/cctools_3d_models',
  dataDir = process.env.CCTOOLS_DATA_DIR || path.resolve('data') } = {}) {
  const statePath = path.join(dataDir, 'upload-designs.json');
  let queue = Promise.resolve();
  const imports = new Map();
  const serial = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const readState = async () => {
    try { return { ...defaults(), ...JSON.parse(await fs.readFile(statePath, 'utf8')) }; }
    catch (error) { if (error.code === 'ENOENT') return defaults(); throw problem('No se pudo leer la biblioteca guardada. Revisa upload-designs.json.', 500); }
  };
  const writeState = async state => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(statePath + '.tmp', JSON.stringify(state), 'utf8');
    await fs.rename(statePath + '.tmp', statePath);
  };
  async function safePath(...parts) {
    let current = path.resolve(root);
    for (const part of ['', ...parts]) {
      if (part && (part === '.' || part === '..' || part.includes('/') || part.includes('\\'))) throw problem('Ruta de biblioteca no válida.');
      if (part) current = path.join(current, part);
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw problem('No se admiten enlaces simbólicos en la biblioteca.');
    }
    const realRoot = await fs.realpath(root), real = await fs.realpath(current);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw problem('El archivo está fuera de la biblioteca.');
    return current;
  }
  const hashFile = async file => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  };
  async function scanState(state) {
    const items = [], now = new Date().toISOString();
    state.libraryError = '';
    try {
      const library = await safePath();
      const dirs = (await fs.readdir(library, { withFileTypes: true }))
        .filter(entry => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink()))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (dirs.length > MAX_FOLDERS) throw problem(`Hay más de ${MAX_FOLDERS} carpetas. Reduce el tamaño de la biblioteca para escanearla.`);
      for (const dir of dirs) {
        const item = { id: digest(dir.name), folder: dir.name, name: dir.name, errors: [], warnings: [], valid: false };
        items.push(item);
        try {
          const folder = await safePath(dir.name);
          const files = await fs.readdir(folder, { withFileTypes: true });
          const models = files.filter(file => /\.3mf$/i.test(file.name));
          const images = files.filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file.name));
          const byKind = new Map();
          for (const file of images) {
            const kind = uploadImageKind(file.name);
            if (byKind.has(kind)) throw problem(kind === 'cover' ? 'Debe haber una única portada JPG, PNG o WebP.' : `Hay varios archivos para ${kind === 'appCover' ? 'portada2' : 'imagen' + kind.slice(5)}.`);
            byKind.set(kind, file);
          }
          const covers = byKind.has('cover') ? [byKind.get('cover')] : [];
          const optional = [...byKind].filter(([kind]) => kind !== 'cover').sort(([a], [b]) => a.localeCompare(b));
          const infos = files.filter(file => file.name.toLowerCase() === 'info.txt');
          if (models.length !== 1) item.errors.push(models.length ? 'Debe haber un único archivo .3mf.' : 'Falta el archivo .3mf.');
          if (covers.length !== 1) item.errors.push(covers.length ? 'Debe haber una única portada JPG, PNG o WebP.' : 'Falta la portada JPG, PNG o WebP.');
          if (infos.length !== 1) item.errors.push('Falta un único info.txt.');
          if (item.errors.length) continue;
          const filePaths = [], before = [];
          for (const file of [models[0], covers[0], infos[0], ...optional.map(([, file]) => file)]) {
            const resolved = await safePath(dir.name, file.name), stat = await fs.stat(resolved);
            if (!stat.isFile()) throw problem('Los archivos del modelo deben ser archivos normales.');
            filePaths.push(resolved); before.push(stat);
          }
          if (!before[0].size || before[0].size > MAX_MODEL) throw problem('El 3MF debe ocupar entre 1 byte y 256 MB.');
          if (!before[1].size || before[1].size > MAX_COVER) throw problem('La portada debe ocupar entre 1 byte y 20 MB.');
          if (before[2].size > 32768) throw problem('info.txt no puede superar 32 KB.');
          const profileFound = await inspect3mf(filePaths[0], before[0].size);
          const cover = await fs.readFile(filePaths[1]), info = await fs.readFile(filePaths[2]);
          const dimensions = validateImage(cover, 'cover', covers[0].name);
          let optionalFingerprint = '';
          for (let i = 0; i < optional.length; i++) {
            const [kind, file] = optional[i];
            if (!before[i + 3].size || before[i + 3].size > MAX_COVER) throw problem(`${file.name}: la imagen debe ocupar entre 1 byte y 20 MB.`);
            const data = await fs.readFile(filePaths[i + 3]);
            validateImage(data, kind, file.name);
            optionalFingerprint += JSON.stringify([kind, file.name, digest(data)]);
          }
          Object.assign(item, parseUploadInfo(new TextDecoder('utf-8', { fatal: true }).decode(info)));
          item.modelHash = await hashFile(filePaths[0]);
          for (let i = 0; i < filePaths.length; i++) {
            const after = await fs.stat(filePaths[i]);
            if (after.size !== before[i].size || after.mtimeMs !== before[i].mtimeMs) throw problem('Los archivos han cambiado durante el escaneo. Vuelve a escanear.');
          }
          item.fingerprint = digest(item.modelHash + digest(cover) + digest(info) + optionalFingerprint);
          item.name = path.basename(models[0].name, path.extname(models[0].name));
          item.modelFile = models[0].name; item.coverFile = covers[0].name; item.infoFile = infos[0].name;
          item.appCoverFile = byKind.get('appCover')?.name || '';
          item.imageFiles = optional.filter(([kind]) => kind.startsWith('image')).map(([, file]) => file.name);
          item.bytes = before[0].size; item.dimensions = dimensions;
          item.firstSeen = state.firstSeen[item.modelHash] ||= now;
          item.warnings.push(profileFound ? 'Perfil detectado. Compatibilidad pendiente de verificar en Creality.' : 'No se ha reconocido un perfil de impresión. Comprueba que el 3MF procede de Creality Print o Bambu Studio.');
          item.valid = true;
        } catch (error) {
          item.errors.push(error.code === 'ENOENT' ? 'La carpeta o un archivo ya no existe.' :
            ['EACCES', 'EPERM'].includes(error.code) ? 'Sin permiso para leer los archivos.' : error.message);
        }
      }
      const counts = new Map();
      for (const item of items.filter(item => item.valid)) counts.set(item.modelHash, (counts.get(item.modelHash) || 0) + 1);
      for (const item of items.filter(item => item.valid)) if (counts.get(item.modelHash) > 1) {
        item.valid = false; item.errors.push('3MF duplicado en varias carpetas. Conserva una sola copia en la biblioteca.');
      }
    } catch (error) {
      state.libraryError = error.code === 'ENOENT' ? 'No se encuentra la biblioteca. Crea /media/cctools_3d_models y copia una subcarpeta por diseño.' :
        ['EACCES', 'EPERM', 'EROFS'].includes(error.code) ? 'Sin permisos para acceder a la biblioteca. Comprueba el montaje de /media.' : error.message;
    }
    state.inventory = items;
    state.scannedAt = now;
    return state;
  }
  function output(state) {
    const matches = selection => selection.every(entry => state.inventory.some(item => item.valid && item.id === entry.id && item.fingerprint === entry.fingerprint));
    return { ...state, firstSeen: undefined, root, uploadsAvailable: true, schedulerConnected: true,
      scheduleReady: !state.libraryError && state.schedule.selected.length === state.schedule.dailyLimit && matches(state.schedule.selected),
      manualReady: !state.libraryError && state.manual.length > 0 && matches(state.manual) };
  }
  function selectionFrom(state, entries, max) {
    if (state.libraryError) throw problem(state.libraryError, 409);
    if (!Array.isArray(entries) || entries.length > max || new Set(entries.map(entry => entry?.id)).size !== entries.length) throw problem('La selección de diseños no es válida.');
    return entries.map(entry => {
      const item = state.inventory.find(item => item.valid && item.id === entry?.id && item.fingerprint === entry?.fingerprint);
      if (!item) throw problem('Un diseño ha cambiado o ya no está disponible. Escanea y revisa la selección.', 409);
      return { id: item.id, fingerprint: item.fingerprint, modelHash: item.modelHash, name: item.name };
    });
  }
  return {
    ensureRoot: () => serial(async () => {
      const parent = await fs.lstat(path.dirname(root));
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw problem('No se puede acceder a /media.');
      await fs.mkdir(root).catch(error => { if (error.code !== 'EEXIST') throw error; });
      await safePath(); return { root };
    }),
    beginImport: () => serial(async () => {
      await safePath();
      const token = randomUUID(), folder = '.import-' + token;
      await fs.mkdir(path.join(root, folder));
      imports.set(token, { folder, files: {}, startedAt: Date.now() });
      return { token };
    }),
    importFile: (token, kind, name, stream) => serial(async () => {
      const item = imports.get(token);
      const limits = { model: MAX_MODEL, cover: MAX_COVER, info: 32768, appCover: MAX_COVER,
        ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['image' + (i + 1), MAX_COVER])) };
      if (!item || Date.now() - item.startedAt > 15 * 60 * 1000) throw problem('La importación ha caducado. Vuelve a seleccionar los archivos.');
      if (!Object.hasOwn(limits, kind) || item.files[kind] || !name || name !== path.basename(name) || /[\\/\x00-\x1f]/.test(name) || name.startsWith('.')) throw problem('Archivo de importación no válido.');
      if (kind === 'model' && !/\.3mf$/i.test(name) || kind === 'info' && name.toLowerCase() !== 'info.txt' || !['model', 'info'].includes(kind) && uploadImageKind(name) !== kind) throw problem('Selecciona un 3MF, una portada, info.txt y las imágenes opcionales con sus nombres indicados.');
      const folder = await safePath(item.folder), filename = kind === 'info' ? 'info.txt' : name;
      const target = path.join(folder, filename), handle = await fs.open(target, 'wx');
      let size = 0;
      try {
        for await (const chunk of stream) { size += chunk.length; if (size > limits[kind]) throw problem('El archivo supera el tamaño admitido.', 413); await handle.writeFile(chunk); }
        if (!size) throw problem('El archivo está vacío.');
        await handle.close(); item.files[kind] = filename; return { bytes: size };
      } catch (error) { await handle.close().catch(() => {}); await fs.unlink(target).catch(() => {}); throw error; }
    }),
    finishImport: token => serial(async () => {
      const item = imports.get(token);
      if (!item || !['model','cover','info'].every(key => item.files[key])) throw problem('Faltan archivos para completar la importación.');
      const folder = await safePath(item.folder);
      const model = path.join(folder, item.files.model), stat = await fs.stat(model);
      await inspect3mf(model, stat.size);
      for (const [kind, name] of Object.entries(item.files).filter(([kind]) => !['model', 'info'].includes(kind))) {
        validateImage(await fs.readFile(await safePath(item.folder, name)), kind, name);
      }
      parseUploadInfo(new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(path.join(folder, item.files.info))));
      const name = path.basename(item.files.model, path.extname(item.files.model)).replace(/[^\p{L}\p{N}_ -]/gu, '_').slice(0, 90) || 'modelo';
      const finalName = name + '-' + token.slice(0, 8);
      await fs.rename(folder, path.join(root, finalName)); imports.delete(token);
      const state = await scanState(await readState()); await writeState(state); return output(state);
    }),
    cancelImport: token => serial(async () => {
      const item = imports.get(token); if (!item) return {};
      const folder = await safePath(item.folder);
      if (!folder.startsWith(path.resolve(root) + path.sep + '.import-')) throw problem('Ruta temporal no válida.');
      await fs.rm(folder, { recursive: true, force: true }); imports.delete(token); return {};
    }),
    candidates: ({ account, source, day, limit, selected: manual }) => serial(async () => {
      const state = await scanState(await readState());
      if (state.libraryError) throw problem(state.libraryError);
      const ledger = state.ledger[account] ||= {};
      const used = Object.values(ledger).filter(entry => entry.day === day && ['submitting','submitted','uncertain'].includes(entry.status)).length;
      let available = state.inventory.filter(item => item.valid && !['submitting','submitted','uncertain'].includes(ledger[item.modelHash]?.status));
      let chosen;
      if (source === 'manual') chosen = selectionFrom(state, manual || state.manual, 5).map(entry => available.find(item => item.id === entry.id)).filter(Boolean);
      else if (!state.schedule.initialConsumed) {
        const pending = state.schedule.selected.filter(entry => !['submitting','submitted','uncertain'].includes(ledger[entry.modelHash]?.status));
        if (pending.length) chosen = selectionFrom(state, pending, 5).map(entry => available.find(item => item.id === entry.id)).filter(Boolean);
        else { state.schedule.initialConsumed = true; chosen = available.filter(item => ledger[item.modelHash]?.status !== 'failed'); }
      }
      else chosen = available.filter(item => ledger[item.modelHash]?.status !== 'failed').sort((a,b) => a.firstSeen.localeCompare(b.firstSeen) || a.folder.localeCompare(b.folder));
      await writeState(state);
      return { items: chosen.slice(0, Math.max(0, Math.min(limit, 5) - used)), used };
    }),
    prepare: entry => serial(async () => {
      const state = await scanState(await readState());
      const selected = selectionFrom(state, [entry], 1)[0];
      const item = state.inventory.find(item => item.id === selected.id);
      return { ...item, modelPath: await safePath(item.folder, item.modelFile), coverPath: await safePath(item.folder, item.coverFile),
        appCoverPath: item.appCoverFile ? await safePath(item.folder, item.appCoverFile) : '',
        imagePaths: await Promise.all((item.imageFiles || []).map(name => safePath(item.folder, name))) };
    }),
    record: (account, model, patch) => serial(async () => {
      const state = await readState(), ledger = state.ledger[account] ||= {};
      const previous = ledger[model.modelHash];
      if (patch.status === 'submitting' && ['submitted','submitting','uncertain'].includes(previous?.status)) throw problem('Este diseño ya se entregó o tiene un envío pendiente de comprobar.');
      ledger[model.modelHash] = { ...previous, name: model.name, modelHash: model.modelHash, libraryId: model.id,
        folder: model.folder, fingerprint: model.fingerprint, ...patch, updatedAt: new Date().toISOString() };
      if (patch.source === 'schedule') state.schedule.initialConsumed = true;
      await writeState(state); return ledger[model.modelHash];
    }),
    cleanupCandidates: (account, day) => serial(async () => {
      const state = await readState();
      return Object.values(state.ledger[account] || {}).filter(entry => entry.status === 'submitted' && entry.id && entry.day < day && !entry.cleanedAt && entry.folder && entry.fingerprint)
        .sort((a,b) => String(a.publicCheckedAt || '').localeCompare(String(b.publicCheckedAt || '')));
    }),
    notePublicChecks: (account, ids, checkedAt) => serial(async () => {
      const state = await readState();
      for (const entry of Object.values(state.ledger[account] || {})) if (ids.includes(entry.id)) entry.publicCheckedAt = checkedAt;
      await writeState(state);
    }),
    removePublished: (account, entry, proof, day, signal) => serial(async () => {
      signal?.throwIfAborted();
      if (proof?.account !== account || !proof.ids?.includes(entry.id) || !proof.checkedAt || !Number.isFinite(Date.parse(proof.checkedAt)) || Date.now() - Date.parse(proof.checkedAt) > 10 * 60000) throw problem('Falta confirmación reciente del modelo público.');
      const state = await scanState(await readState()), saved = state.ledger[account]?.[entry.modelHash];
      if (!saved || saved.status !== 'submitted' || saved.id !== entry.id || saved.day >= day || saved.cleanedAt) return false;
      const item = state.inventory.find(item => item.valid && item.id === saved.libraryId && item.fingerprint === saved.fingerprint && item.folder === saved.folder);
      if (!item) return false;
      const folder = await safePath(item.folder), expected = [item.modelFile,item.coverFile,item.infoFile,
        ...(item.appCoverFile ? [item.appCoverFile] : []), ...(item.imageFiles || [])];
      const files = await fs.readdir(folder);
      // Never delete unrelated files or edited designs; the fingerprint covers optional images too.
      if (files.length !== expected.length || files.some(file => !expected.includes(file))) return false;
      const targets = [];
      for (const name of expected) targets.push(await safePath(item.folder, name));
      signal?.throwIfAborted();
      for (const target of targets) await fs.unlink(target);
      await fs.rmdir(folder);
      saved.cleanedAt = new Date().toISOString(); saved.publicVerifiedAt = proof.checkedAt;
      state.inventory = state.inventory.filter(model => model.id !== item.id);
      await writeState(state); return true;
    }),
    status: () => serial(async () => output(await readState())),
    scan: () => serial(async () => { const state = await scanState(await readState()); await writeState(state); return output(state); }),
    saveManual: entries => serial(async () => {
      const state = await scanState(await readState());
      state.manual = selectionFrom(state, entries, 5);
      await writeState(state); return output(state);
    }),
    saveSchedule: input => serial(async () => {
      const state = await scanState(await readState());
      if (!Number.isInteger(input.dailyLimit) || input.dailyLimit < 1 || input.dailyLimit > 5 ||
          !clock(input.windowStart) || !clock(input.windowEnd) || input.windowStart >= input.windowEnd || typeof input.enabled !== 'boolean') {
        throw problem('Indica entre 1 y 5 diseños y una hora final posterior a la inicial.');
      }
      const selected = selectionFrom(state, input.selected, input.dailyLimit);
      if (selected.length !== input.dailyLimit) throw problem(`Selecciona exactamente ${input.dailyLimit} diseños para la primera ejecución.`);
      state.schedule = { enabled: input.enabled, dailyLimit: input.dailyLimit, windowStart: input.windowStart, windowEnd: input.windowEnd, cleanupEnabled: input.cleanupEnabled === true, selected };
      await writeState(state); return output(state);
    }),
    disableSchedule: () => serial(async () => {
      const state = await readState(); state.schedule.enabled = false; await writeState(state); return output(state);
    }),
    preview: () => serial(async () => {
      const state = await scanState(await readState()); await writeState(state);
      if (state.libraryError) throw problem(state.libraryError, 409);
      if (!output(state).scheduleReady) throw problem('Revisa y guarda la selección inicial antes de simular el siguiente día.', 409);
      return { ...output(state), preview: nextUploadPreview(state.inventory, state.schedule.selected, state.schedule.dailyLimit) };
    }),
    cover: id => serial(async () => {
      const state = await readState(), item = state.inventory.find(item => item.id === id && item.coverFile);
      if (!item) throw problem('Portada no encontrada.', 404);
      const file = await safePath(item.folder, item.coverFile), stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > MAX_COVER) throw problem('Portada no válida.', 404);
      const data = await fs.readFile(file), dimensions = coverDimensions(data);
      return { data, type: dimensions.type };
    })
  };
}
