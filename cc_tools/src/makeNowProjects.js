import { randomUUID } from 'node:crypto';
import { readConfig, writeConfig } from './storage.js';
import { navigateToCrealityPage } from './crealityNavigation.js';

export const MAKENOW_HOME = 'https://www.crealitycloud.com/es/makenow/ModelingTools/Home';
// Only tools whose project-list workflow has been inspected. New tools are not opted in automatically.
export const MAKENOW_TOOLS = Object.freeze([
  { id: '17', name: 'Lampshade Generator' }, { id: '13', name: 'FrameStudio' },
  { id: '19', name: 'ClickerMaker' }, { id: '14', name: 'FlexiWeave' },
  { id: '1001', name: 'CubeMe' }, { id: '10', name: 'SnapForm' },
  { id: '12', name: 'MagicRelief' }, { id: '8', name: 'SignForge' }
]);
export const MAKENOW_EXCLUDED = Object.freeze(['AI Create Lab', 'Fanforge-Football', 'FlexiToys']);

export function parseProjectCapacity(text) {
  const match = String(text || '').match(/(?:My Projects|Mis proyectos)\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
  if (!match) return null;
  const used = Number(match[1]);
  const limit = Number(match[2]);
  return limit > 0 && used <= limit ? { used, limit } : null;
}

export function availableMakeNowTools(inventory) {
  return inventory.filter(tool => MAKENOW_TOOLS.some(allowed => allowed.id === tool.id && allowed.name === tool.name)
    && tool.status === 'available' && Number.isInteger(tool.used) && tool.used >= 0 && tool.used < tool.limit)
    .sort((a, b) => a.used - b.used || MAKENOW_TOOLS.findIndex(tool => tool.id === a.id) - MAKENOW_TOOLS.findIndex(tool => tool.id === b.id));
}

export function projectIdentity(url, toolId) {
  try {
    const parsed = new URL(url);
    if (!['www.crealitycloud.com', 'makenow.crealitycloud.com'].includes(parsed.hostname)) return null;
    const match = parsed.pathname.match(/\/makenow\/ModelingTools\/ProjectEdit\/([^/]+)\/([a-zA-Z0-9_-]+)\/?$/);
    if (!match || match[1] !== toolId) return null;
    return { projectId: match[2], projectUrl: `https://www.crealitycloud.com/es/makenow/ModelingTools/ProjectEdit/${toolId}/${match[2]}` };
  } catch { return null; }
}

export async function inspectMakeNowTool(page, tool, { signal } = {}) {
  signal?.throwIfAborted();
  // Direct wrapper URLs can leave the iframe at Home: enter through the catalogue.
  await navigateToCrealityPage(page, MAKENOW_HOME, { timeout: 20000, attempts: 1 });
  const frame = page.frameLocator('#makenowIframe');
  await frame.getByText(tool.name, { exact: true }).click({ timeout: 15000 });
  await frame.locator('.project-num').waitFor({ state: 'visible', timeout: 15000 });
  const contentFrame = page.frames().find(item => {
    try { return new URL(item.url()).pathname === `/makenow/ModelingTools/ProjectInfoManage/${tool.id}`; }
    catch { return false; }
  });
  if (!contentFrame) throw projectError('MAKENOW_CAPACITY_UNKNOWN', `No se pudo identificar la lista de ${tool.name}.`);
  // The page initially renders 0/30 while its saved projects are still loading.
  await contentFrame.waitForLoadState('networkidle', { timeout: 15000 });
  await frame.locator('.container-Loading').waitFor({ state: 'hidden', timeout: 10000 });
  signal?.throwIfAborted();
  const body = await frame.locator('body').innerText({ timeout: 5000 });
  if (/upgrade to commercial access|commercial access required|mejorar.*acceso comercial/i.test(body)) {
    return { ...tool, status: 'restricted', checkedAt: new Date().toISOString() };
  }
  const capacity = parseProjectCapacity(await frame.locator('.project-num').innerText({ timeout: 5000 }));
  if (!capacity) throw projectError('MAKENOW_CAPACITY_UNKNOWN', `No se pudo leer el cupo de ${tool.name}.`);
  if (capacity.used >= capacity.limit) return { ...tool, ...capacity, status: 'full', checkedAt: new Date().toISOString() };
  const newProject = frame.getByRole('button', { name: /^(?:plus\s+|\+\s*)?(?:New Project|Nuevo proyecto)$/i });
  if (!await newProject.isEnabled()) return { ...tool, ...capacity, status: 'restricted', checkedAt: new Date().toISOString() };
  return { ...tool, ...capacity, status: 'available', checkedAt: new Date().toISOString() };
}

export async function createMakeNowProject(page, tool, { reserveAttempt, updateAttempt, record, signal }) {
  signal?.throwIfAborted();
  const attempt = await reserveAttempt(tool);
  signal?.throwIfAborted();
  const button = page.frameLocator('#makenowIframe').getByRole('button', { name: /^(?:plus\s+|\+\s*)?(?:New Project|Nuevo proyecto)$/i });
  // No retries after this point: even a timeout may mean the server created it.
  await button.click({ timeout: 15000 });
  record(`Pulsado New Project en ${tool.name}. No se genera ni finaliza el proyecto.`);
  await updateAttempt?.(attempt, { status: 'clicked', clickedAt: new Date().toISOString() });
  let identity = null;
  for (let index = 0; index < 10; index++) {
    signal?.throwIfAborted();
    identity = [page.url(), ...page.frames().map(frame => frame.url())].map(url => projectIdentity(url, tool.id)).find(Boolean);
    if (identity) break;
    await page.waitForTimeout(500);
  }
  const project = { ...attempt, ...(identity || {}), status: identity ? 'created' : 'clicked' };
  await updateAttempt?.(attempt, project);
  record(identity ? `Proyecto registrado: ${identity.projectId}.` : 'Clic registrado; la web no expuso un identificador de proyecto.');
  return project;
}

export async function selectAndCreateMakeNowProject(page, options, dependencies = {}) {
  const inspect = dependencies.inspectTool || inspectMakeNowTool;
  const create = dependencies.createProject || createMakeNowProject;
  const inventory = [];
  for (const tool of MAKENOW_TOOLS) {
    options.signal?.throwIfAborted();
    try {
      const state = await inspect(page, tool, options);
      inventory.push(state);
      options.record(`${tool.name}: ${state.used === undefined ? 'acceso restringido' : `${state.used}/${state.limit} proyectos`}.`);
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error.systemic || error.silentRetry) throw error;
      inventory.push({ ...tool, status: 'unknown', checkedAt: new Date().toISOString() });
      options.record(`${tool.name}: no se pudo comprobar el cupo; se omite.`);
    }
  }
  await options.saveInventory?.(inventory);
  for (const candidate of availableMakeNowTools(inventory)) {
    // Another session may have filled a tool since it was scanned.
    let current;
    try { current = await inspect(page, candidate, options); }
    catch (error) {
      options.signal?.throwIfAborted();
      if (error.systemic || error.silentRetry) throw error;
      current = { ...candidate, status: 'unknown' };
    }
    inventory[inventory.findIndex(tool => tool.id === candidate.id)] = current;
    await options.saveInventory?.(inventory);
    if (!availableMakeNowTools([current]).length) continue;
    options.record(`Seleccionada ${current.name}: ${current.used}/${current.limit} proyectos.`);
    const project = await create(page, current, options);
    return { tool: current.name, toolId: current.id, capacityBefore: { used: current.used, limit: current.limit }, inventory, project };
  }
  const full = inventory.every(tool => tool.status === 'full');
  const counts = inventory.filter(tool => tool.used !== undefined).map(tool => `${tool.name}: ${tool.used}/${tool.limit}`).join('; ');
  const message = full
    ? `MakeNow: todas las herramientas permitidas están llenas. Libera espacio en una de ellas. ${counts}`
    : `MakeNow: no hay una herramienta con espacio y acceso confirmados. Revisa los cupos y el acceso en la web. ${counts}`;
  throw Object.assign(projectError(full ? 'MAKENOW_ALL_TOOLS_FULL' : 'MAKENOW_NO_AVAILABLE_TOOL', message), { inventory });
}

export function lastProfileAttempt(task, profileId) {
  const attempts = task.projectAccounts?.[profileId]?.attempts || [];
  const latest = attempts.map(attempt => attempt.attemptedAt).filter(Boolean).sort().at(-1);
  if (latest) return latest;
  return !task.lastAttemptProfileId || task.lastAttemptProfileId === profileId ? task.lastAttemptAt : '';
}

export function createMakeNowJournal(profile, storage = { readConfig, writeConfig }) {
  const profileId = String(profile?.userId || '').trim();
  const access = async () => {
    if (!profileId || !/^[a-zA-Z0-9_-]+$/.test(profileId) || ['__proto__', 'constructor', 'prototype'].includes(profileId)) throw projectError('MAKENOW_PROFILE_REQUIRED', 'Actualiza el perfil CC antes de crear un proyecto para registrar a qué cuenta pertenece.');
    const config = await storage.readConfig();
    if (String(config.crealityProfile?.userId || '') !== profileId) throw projectError('MAKENOW_PROFILE_CHANGED', 'El perfil CC ha cambiado. Se cancela la creación del proyecto.');
    const task = config.tasks.makeNow;
    task.projectAccounts ||= {};
    task.projectAccounts[profileId] ||= { attempts: [], inventory: [] };
    const account = task.projectAccounts[profileId];
    account.profileName = String(profile.name || '');
    return { config, task, account };
  };
  return {
    async saveInventory(inventory) {
      const { config, account } = await access();
      account.inventory = inventory;
      account.checkedAt = new Date().toISOString();
      await storage.writeConfig(config);
    },
    async reserveAttempt(tool) {
      const { config, task, account } = await access();
      const now = new Date();
      const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: task.timezone || 'Europe/Madrid' }).format(new Date(value));
      const previous = lastProfileAttempt(task, profileId);
      if (previous && Number.isFinite(Date.parse(previous)) && day(previous) === day(now)) throw projectError('MAKENOW_ALREADY_ATTEMPTED', 'Ya se intentó crear un proyecto hoy para este perfil CC.');
      const attempt = { attemptId: randomUUID(), profileId, profileName: account.profileName, toolId: tool.id, tool: tool.name,
        attemptedAt: now.toISOString(), capacityBefore: { used: tool.used, limit: tool.limit }, status: 'reserved', rewardStatus: 'unverified' };
      account.attempts.push(attempt);
      task.lastAttemptAt = attempt.attemptedAt;
      task.lastAttemptProfileId = profileId;
      await storage.writeConfig(config);
      return attempt;
    },
    async updateAttempt(attempt, patch) {
      if (!attempt?.attemptId) return;
      const { config, account } = await access();
      const stored = account.attempts.find(item => item.attemptId === attempt.attemptId);
      if (!stored) throw projectError('MAKENOW_JOURNAL_MISSING', 'No se encontró el registro del proyecto.');
      Object.assign(stored, patch, { attemptId: stored.attemptId, profileId });
      await storage.writeConfig(config);
    }
  };
}

function projectError(code, message) {
  return Object.assign(new Error(message), { code, category: 'action', systemic: false });
}
