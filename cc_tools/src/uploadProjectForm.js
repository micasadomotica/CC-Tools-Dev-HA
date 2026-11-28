import path from 'node:path';

// Galería de Proyectos (Banco de trabajo / FlowSlicer). "Importar archivo local"
// opens FlowSlicer, a Flutter app inside an iframe: it reads the 3MF, uploads it
// and creates the project with flowSlicerSave when its plate dialog is saved.
export const PROJECTS_URL = 'https://www.crealitycloud.com/es/flowslicer/project?tab=project';
export const PROJECT_SAVE_PATH = '/api/cxy/v3/model/flowSlicerSave';
export const PROJECT_LIST_PATH = '/api/cxy/v3/model/flowSlicerList';
const fail = (code, message) => Object.assign(new Error(message), { code, systemic: false });
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export function projectTitle(model = {}) {
  return model.modelFile || path.basename(model.modelPath || '');
}

// A project with the same file name and size is already in the gallery.
export function findProject(list, { title, size }) {
  return (Array.isArray(list) ? list : []).find(item => item?.title === title &&
    (!size || [item.originFileSize, item.modifiedFileSize].includes(size))) || null;
}

export function projectSaveId(payload, pageUrl = '') {
  const result = payload?.result;
  for (const value of [result?.id, result?.saveProjectId, typeof result === 'string' ? result : '']) {
    if (validId(String(value || ''))) return String(value);
  }
  try {
    const id = new URL(pageUrl).searchParams.get('saveProjectId') || '';
    return validId(id) ? id : '';
  } catch { return ''; }
}

export function projectUrl(id) {
  return 'https://www.crealitycloud.com/es/flowslicer/slice/edit?saveProjectId=' + encodeURIComponent(id);
}

// Uses the page session cookies, like the web app, to read the gallery.
async function listProjects(page) {
  const payload = await page.evaluate(async listPath => {
    const cookies = Object.fromEntries(document.cookie.split(';').map(part => {
      const index = part.indexOf('=');
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
    }));
    const response = await fetch(listPath, { method: 'POST', body: JSON.stringify({ page: 1, pageSize: 50 }), headers: {
      'content-type': 'application/json', __cxy_token_: cookies.model_token || '', __cxy_uid_: cookies.model_user_id || '',
      __cxy_duid_: cookies.model_device_id || '', __cxy_platform_: '2' } });
    return response.json().catch(() => null);
  }, PROJECT_LIST_PATH);
  if (payload?.code !== 0 || !Array.isArray(payload.result?.list)) throw fail('PROJECT_LIST_FAILED', 'No se pudo leer la Galería de Proyectos.');
  return payload.result.list;
}

// Flutter draws on a canvas. Clicking its hidden placeholder turns on the
// accessibility tree, which exposes the buttons with their names.
async function clickFlutterButton(page, name, { timeout, signal }) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    for (const frame of page.frames().filter(frame => frame.url().includes('/flow-slicer/'))) {
      const placeholder = frame.locator('flt-semantics-placeholder');
      if (await placeholder.count().catch(() => 0)) await placeholder.first().evaluate(element => element.click()).catch(() => {});
      const button = frame.getByRole('button', { name, exact: true }).first();
      if (await button.isVisible().catch(() => false)) { await button.click(); return; }
    }
    await page.waitForTimeout(1000);
  }
  throw fail('PROJECT_FORM_MISMATCH', 'No ha aparecido el botón Save de FlowSlicer al importar el 3MF.');
}

export async function uploadProject(page, model, { signal, timeout = 180000 } = {}) {
  const title = projectTitle(model), size = model.bytes;
  if (!title || !model.modelPath) throw fail('PROJECT_FORM_MISMATCH', 'Falta el archivo 3MF del diseño.');
  await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
  const input = page.locator('.flowslicer-upload input.el-upload__input[type="file"]').first();
  await input.waitFor({ state: 'attached', timeout: 45000 });
  const existing = findProject(await listProjects(page), { title, size });
  if (existing) return { status: 'already', id: existing.id, title, url: projectUrl(existing.id) };
  signal?.throwIfAborted();
  const saved = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === PROJECT_SAVE_PATH, { timeout });
  saved.catch(() => {});
  await input.setInputFiles(model.modelPath);
  await clickFlutterButton(page, 'Save', { timeout, signal });
  const response = await saved;
  const payload = await response.json().catch(() => null);
  if (payload && Number.isFinite(payload.code) && payload.code !== 0) throw fail('PROJECT_REJECTED', payload.msg || 'Creality rechazó el proyecto.');
  await page.waitForURL(/saveProjectId=/, { timeout: 30000 }).catch(() => {});
  let id = projectSaveId(payload, page.url());
  // Leave the editor without pressing Back or Send Print: the project is
  // already in the gallery once flowSlicerSave succeeds.
  await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
  const list = await listProjects(page);
  const project = list.find(item => item.id === id) || findProject(list, { title, size });
  if (!project) throw fail('PROJECT_RESULT_UNCERTAIN', 'El proyecto no aparece en la Galería de Proyectos. Compruébalo antes de repetirlo.');
  id = project.id;
  return { status: 'uploaded', id, title, url: projectUrl(id) };
}
