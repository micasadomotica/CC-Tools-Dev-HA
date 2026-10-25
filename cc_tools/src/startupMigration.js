import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireMigrationReview } from './migrationReview.js';

export const MIGRATION_DIR = '.cc-tools-migration';
export const MIGRATION_SOURCES = ['local_cc_tools', '8966b8c7_cc_tools'];
export const MIGRATION_CHOICES = { 'No migrar': 'none', 'CC Tools Dev local': 'local_cc_tools', 'CC Tools de TitoTB': '8966b8c7_cc_tools' };
const RESERVED = new Set(['options.json', MIGRATION_DIR]);
const exists = async p => fs.lstat(p).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
const object = value => value && typeof value === 'object' && !Array.isArray(value);

async function atomicJson(file, value) {
  const temp = `${file}.tmp`;
  const handle = await fs.open(temp, 'w', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temp, file);
}

async function entries(dir) {
  return (await fs.readdir(dir)).filter(name => !RESERVED.has(name));
}

async function readState(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function validateState(state) {
  if (!state) return;
  if (!/^[0-9a-f-]{36}$/.test(state.id) || !MIGRATION_SOURCES.includes(state.source)
    || !['preparing', 'backing-up', 'installing', 'completed', 'failed'].includes(state.phase)) {
    throw new Error('El registro de migración no es válido. Conserva los respaldos y revisa el Registro.');
  }
}

// /data is a bind mount: replace its contents, never rename the mounted directory.
async function rollback(dataDir, control, state, save) {
  const attempt = path.join(control, state.id);
  const previous = path.join(attempt, 'previous');
  if (state.phase === 'installing') {
    const failed = path.join(attempt, 'failed-import');
    await fs.mkdir(failed, { recursive: true, mode: 0o700 });
    for (const name of await entries(dataDir)) {
      await fs.rename(path.join(dataDir, name), path.join(failed, name));
    }
    // Persist before restoring: recovery itself can also be interrupted.
    state.phase = 'backing-up';
    await save(state);
  }
  if (state.phase === 'backing-up' && await exists(previous)) {
    for (const name of await fs.readdir(previous)) {
      if (RESERVED.has(name) || await exists(path.join(dataDir, name))) {
        throw new Error('No se puede restaurar sin sobrescribir datos. Conserva el respaldo y consulta el Registro.');
      }
      await fs.rename(path.join(previous, name), path.join(dataDir, name));
    }
  }
  state.phase = 'failed';
  await save(state);
}

async function validateImport(importDir) {
  const configFile = path.join(importDir, 'config.json');
  const stat = await fs.lstat(configFile);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('config.json del origen no es un archivo regular.');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  if (!object(config) || !object(config.tasks)) throw new Error('La configuración del origen no tiene un formato compatible.');
  for (const name of await entries(importDir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(importDir, name);
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Archivo de datos no válido: ${name}`);
    JSON.parse(await fs.readFile(file, 'utf8'));
  }
  return config;
}

/** Dependencies keep the transaction testable without Docker or a live HA. */
export async function migrateAtStartup({ dataDir = '/data', options, supervisor, sourceArchive,
  extractArchive, log = console.log, checkpoint = async () => {} }) {
  const choice = options.migration_source ?? 'No migrar';
  const source = Object.hasOwn(MIGRATION_CHOICES, choice) ? MIGRATION_CHOICES[choice] : null;
  const confirmed = options.migration_confirm === true;
  if (!['none', ...MIGRATION_SOURCES].includes(source)) throw new Error('Origen de migración no permitido.');
  const control = path.join(dataDir, MIGRATION_DIR);
  if (await exists(control) && !(await fs.lstat(control)).isDirectory()) throw new Error('Directorio de control no válido.');
  if (await exists(control) && (await fs.lstat(control)).isSymbolicLink()) throw new Error('El control de migración no puede ser un enlace.');
  const stateFile = path.join(control, 'state.json');
  const save = state => atomicJson(stateFile, state);
  let state = await readState(stateFile);
  validateState(state);
  if (state && !['completed', 'failed'].includes(state.phase)) {
    await rollback(dataDir, control, state, save);
    throw new Error('Se recuperaron los datos anteriores tras una interrupción. Selecciona de nuevo el origen y confirma para reintentar. Para cancelar, elige No migrar y marca la confirmación.');
  }
  if (source === 'none') {
    if (state?.phase === 'failed') {
      if (!confirmed) throw new Error('La migración anterior falló. Para reintentar selecciona un origen y confirma. Para conservar los datos recuperados selecciona No migrar y confirma.');
      await supervisor.disarm();
      state.phase = 'completed';
      state.cancelled = true;
      await save(state);
      log('[migration] Cancelada. Se conservan los datos anteriores y los respaldos.');
    } else if (confirmed) {
      throw new Error('Selecciona un origen o desmarca la confirmación de migración.');
    }
    return { migrated: false };
  }
  if (!confirmed) throw new Error('Marca Confirmar sustitución de datos para ejecutar la migración.');

  const self = await supervisor.info('self');
  if (self.slug !== '34e9898c_cc_tools') throw new Error('La migración solo está disponible en CC Tools Dev del repositorio oficial de esta edición.');
  const assertStopped = async () => {
    const info = await supervisor.info(source);
    if (info.slug !== source || info.state !== 'stopped') throw new Error('La app de origen debe estar instalada y detenida desde Home Assistant.');
    if (info.watchdog) throw new Error('Desactiva Watchdog de la app de origen antes de migrar.');
    if (sourceArchive.assertStopped) await sourceArchive.assertStopped(source);
  };
  await assertStopped();
  await sourceArchive.check();
  await fs.mkdir(control, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const attempt = path.join(control, id);
  await fs.mkdir(attempt, { mode: 0o700 });
  state = { id, source, phase: 'preparing', startedAt: new Date().toISOString() };
  await save(state);
  log(`[migration] Origen: ${source}. Respaldo privado: ${attempt}`);
  try {
    // Consume the request before modifying app data. Never edit Supervisor's files.
    await supervisor.disarm();
    await atomicJson(path.join(attempt, 'options-before.json'), options);
    const archive = path.join(attempt, 'source.tar');
    await sourceArchive.download(source, archive);
    const extracted = path.join(attempt, 'extracted');
    await fs.mkdir(extracted, { mode: 0o700 });
    await extractArchive(archive, extracted, source);
    const imported = path.join(extracted, source);
    const config = await validateImport(imported);
    requireMigrationReview(config, source);
    await atomicJson(path.join(imported, 'config.json'), config);
    await atomicJson(path.join(imported, 'config.json.bak'), config);
    await assertStopped();
    await fs.mkdir(path.join(attempt, 'previous'), { mode: 0o700 });
    state.phase = 'backing-up';
    await save(state);
    for (const name of await entries(dataDir)) {
      await fs.rename(path.join(dataDir, name), path.join(attempt, 'previous', name));
      await checkpoint('backup', name);
    }
    state.phase = 'installing';
    await save(state);
    for (const name of await entries(imported)) {
      await fs.rename(path.join(imported, name), path.join(dataDir, name));
      await checkpoint('install', name);
    }
    state.phase = 'completed';
    state.completedAt = new Date().toISOString();
    await save(state);
    log('[migration] Migración completada. Revisa los datos y pulsa Reanudar automatizaciones en la interfaz.');
    return { migrated: true, source, backup: attempt };
  } catch (error) {
    await rollback(dataDir, control, state, save);
    throw new Error(`Migración cancelada; se conservan los datos anteriores. Respaldo: ${attempt}. ${error.message}`, { cause: error });
  }
}
