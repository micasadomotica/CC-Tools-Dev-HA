import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MIGRATION_SOURCES, MIGRATION_DIR } from './startupMigration.js';

const exec = promisify(execFile);
function dockerRequest(method, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: '/run/docker.sock', path: requestPath, method }, resolve);
    req.setTimeout(30 * 60 * 1000, () => req.destroy(new Error('Tiempo agotado al leer los datos de Docker.')));
    req.on('error', () => reject(new Error('No se puede acceder a Docker. Desactiva temporalmente Modo de protección de CC Tools Dev y vuelve a iniciar.')));
    req.end();
  });
}

async function dockerJson(requestPath) {
  const response = await dockerRequest('GET', requestPath);
  if (response.statusCode !== 200) { response.resume(); throw new Error('Docker no pudo consultar los contenedores.'); }
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

export function createSupervisorClient(options, { token = process.env.SUPERVISOR_TOKEN,
  base = 'http://supervisor', request = fetch } = {}) {
  async function call(endpoint, body) {
    if (!token) throw new Error('No se encuentra el acceso a Supervisor. Ejecuta la migración desde la app de Home Assistant.');
    const response = await request(`${base}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Supervisor rechazó ${endpoint}: HTTP ${response.status}. Revisa la instalación seleccionada y los permisos de la app.`);
    const result = await response.json();
    if (result?.result !== 'ok') {
      const status = typeof result?.result === 'string' ? result.result : null;
      throw new Error(`Supervisor no pudo completar ${endpoint}: HTTP ${response.status}, result=${JSON.stringify(status)}.`);
    }
    return result.data;
  }
  return {
    info: slug => call(`/addons/${slug}/info`),
    disarm: () => call('/addons/self/options', {
      options: { ...options, migration_source: 'No migrar', migration_confirm: false }
    })
  };
}

export function assertSourceContainersStopped(source, containers) {
  if (!MIGRATION_SOURCES.includes(source)) throw new Error('Origen no permitido.');
  if (!Array.isArray(containers) || containers.some(container => !Array.isArray(container?.Names)
    || container.Names.some(name => typeof name !== 'string'))) {
    throw new Error('Docker devolvió una lista de contenedores no válida. No se puede confirmar la parada del origen.');
  }
  const matches = containers.filter(container => container.Names.some(name =>
    [`/app_${source}`, `/addon_${source}`].includes(name)));
  for (const container of matches) {
    if (!['created', 'exited', 'dead'].includes(container.State)) {
      const state = typeof container.State === 'string' ? JSON.stringify(container.State) : 'desconocido';
      throw new Error(`El contenedor de origen sigue activo o no confirma su parada: ${source}, Docker State=${state}. Detén la app desde Home Assistant.`);
    }
  }
  return matches.map(container => ({ names: container.Names, state: container.State }));
}

export const dockerSourceArchive = {
  async check() {
    const response = await dockerRequest('GET', '/_ping');
    response.resume();
    if (response.statusCode !== 200) throw new Error('Docker no está disponible para migrar.');
  },
  async assertStopped(source, log = () => {}) {
    const containers = await dockerJson('/containers/json?all=1');
    const matches = assertSourceContainersStopped(source, containers);
    log(`[migration] Docker: ${JSON.stringify({ source, containers: matches, inactive: true })}`);
  },
  async download(source, target) {
    if (!MIGRATION_SOURCES.includes(source)) throw new Error('Origen no permitido.');
    await this.assertStopped(source);
    const candidates = [];
    for (const root of ['/data/apps/data', '/data/addons/data']) {
      const requestPath = `/containers/hassio_supervisor/archive?path=${encodeURIComponent(`${root}/${source}`)}`;
      const response = await dockerRequest('HEAD', requestPath);
      response.resume();
      if (response.statusCode === 200) candidates.push(requestPath);
      else if (response.statusCode !== 404) throw new Error('No se pueden localizar los datos privados del origen.');
    }
    if (candidates.length !== 1) throw new Error('No se ha encontrado una ubicación única para los datos del origen.');
    const response = await dockerRequest('GET', candidates[0]);
    if (response.statusCode !== 200) { response.resume(); throw new Error('No se pudo obtener el respaldo del origen.'); }
    await pipeline(response, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }));
    await this.assertStopped(source);
  }
};

export async function extractMigrationArchive(archive, destination, source) {
  if (!MIGRATION_SOURCES.includes(source)) throw new Error('Origen no permitido.');
  const { stdout } = await exec('tar', ['-tf', archive], { maxBuffer: 16 * 1024 * 1024 });
  const members = stdout.trimEnd().split('\n');
  if (!members.length || members.some(member => {
    const parts = member.replace(/^\.\//, '').split('/');
    return parts[0] !== source || parts.includes('..') || member.startsWith('/') || member.includes('\\');
  })) throw new Error('El archivo de origen contiene rutas no permitidas.');
  const exclusions = [`--exclude=${source}/options.json`, `--exclude=${source}/${MIGRATION_DIR}`];
  await exec('tar', ['--extract', '--preserve-permissions', '--file', archive, '--directory', destination, ...exclusions]);
  const imported = path.join(destination, source);
  const info = await fsp.lstat(imported);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('La raíz de datos importada no es una carpeta válida.');
  // Check every extracted member against the snapshot before changing its config.
  await exec('tar', ['--compare', '--file', archive, '--directory', destination, ...exclusions]);
}
