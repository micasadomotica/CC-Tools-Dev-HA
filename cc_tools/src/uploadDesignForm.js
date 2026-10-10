import { parseCrealityProfile } from './crealityProfile.js';

export const CREATE_MODEL_URL = 'https://www.crealitycloud.com/es/create-model';
export const CREATE_MODEL_PATH = '/api/cxy/v3/model/modelGroupCreate';
const fail = (code, message) => Object.assign(new Error(message), { code, systemic: false });
const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
async function checkInput(input) {
  if (await input.isChecked()) return;
  const label = input.locator('xpath=ancestor::label[1]');
  if (await label.count()) await label.click();
  else await input.check({ force: true });
  if (!await input.isChecked()) throw fail('UPLOAD_FORM_MISMATCH', 'No se pudo marcar una opción del formulario.');
}

export async function acceptCopyrightDeclaration(page) {
  const footer = page.locator('footer:visible');
  const accepted = footer.locator('input[type="checkbox"]');
  // Clicking the checkbox label can open the declaration without checking it.
  // Open its link explicitly and confirm the dedicated dialog first.
  const dialog = page.locator('.el-dialog:visible').filter({ has: page.locator('.source-rule-content') });
  if (!await dialog.isVisible()) {
    if (await accepted.isChecked()) return;
    await footer.locator('strong, a').filter({ hasText: /derechos de autor|copyright/i }).click();
  }
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  await dialog.getByRole('button', { name: /^(Confirmar|Confirm)$/i }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  if (!await accepted.isChecked()) throw fail('UPLOAD_FORM_MISMATCH', 'La declaración de derechos de autor no quedó aceptada tras confirmar el popup.');
}

export async function selectUploadCategory(page, details) {
  const input = details.locator('.model-category-content input');
  await input.click();
  const menu = page.locator('.category-cascader:visible');
  const parent = menu.locator('.el-cascader-node').filter({ has: page.getByText(/^(Impresoras? 3D|3D Printers?)$/i) });
  // Hover the complete row, not the text underneath its overlaid radio label.
  // Element Plus expands on hover; clicking the parent would close the popup.
  await parent.hover();
  const other = menu.locator('.el-cascader-menu').nth(1).locator('.el-cascader-node')
    .filter({ has: page.getByText(/^(Otros?|Others?)$/i) });
  await other.waitFor({ state: 'visible', timeout: 10000 });
  await other.locator('label.el-radio').click();
  const category = await input.inputValue();
  if (!/Impresoras? 3D|3D Printers?/i.test(category) || !/\b(Otros?|Others?)\b/i.test(category)) {
    throw fail('UPLOAD_CATEGORY_MISMATCH', 'La categoría seleccionada debe ser Impresoras 3D / Otro.');
  }
  await details.locator('.model-name-content input').click();
}

export async function verifyUploadAccount(page, account) {
  const response = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/cxy/v3/user/getInfo', { timeout: 45000 });
  response.catch(() => {});
  await page.goto('https://www.crealitycloud.com/es/workbench-beta/?type=1', { waitUntil: 'domcontentloaded' });
  const result = await response, profile = parseCrealityProfile(await result.json());
  if (!result.ok() || profile.userId !== account) throw fail('UPLOAD_ACCOUNT_MISMATCH', 'La sesión de Creality no coincide con la cuenta configurada. Actualiza el perfil antes de subir diseños.');
}

export function validateUploadPayload(payload, model, descriptionText) {
  const group = payload?.groupItem;
  if (!group || group.modelSource !== 1 || group.isPay !== false || group.isShared !== true || group.license !== 'CC BY-NC') throw fail('UPLOAD_FORM_MISMATCH', 'Revisa Original, Gratis, Público y la licencia CC BY-NC antes de entregar.');
  if (normalize(group.groupName) !== normalize(model.name) || !group.categoryId || !payload.model3mf?.filekey) throw fail('UPLOAD_FORM_MISMATCH', 'El formulario no contiene el nombre, la categoría o el 3MF esperado.');
  if (!Array.isArray(group.tags) || group.tags.length !== model.tags.length || !model.tags.every(tag => group.tags.includes(tag))) throw fail('UPLOAD_FORM_MISMATCH', 'Las etiquetas del formulario no coinciden con info.txt.');
  if (normalize(descriptionText) !== normalize(model.description)) throw fail('UPLOAD_FORM_MISMATCH', 'La descripción del formulario no coincide con info.txt.');
  if (!Array.isArray(group.pcCovers) || !group.pcCovers.length) throw fail('UPLOAD_FORM_MISMATCH', 'La portada web no ha terminado de cargarse.');
  const uploadedImages = images => Array.isArray(images) && images.every(item => /^https?:\/\//i.test(item?.url || ''));
  if (model.appCoverPath && (!uploadedImages(group.appCovers) || group.appCovers.length !== 1)) throw fail('UPLOAD_FORM_MISMATCH', 'La portada de App no ha terminado de cargarse.');
  if (model.imagePaths?.length && (!uploadedImages(group.covers) || group.covers.length !== model.imagePaths.length)) throw fail('UPLOAD_FORM_MISMATCH', 'Faltan imágenes del modelo por cargar.');
  if (group.colorFilament?.some(item => ['url', 'skuId', 'name', 'pic'].some(key => item[key]))) throw fail('UPLOAD_FORM_MISMATCH', 'La recomendación de filamento debe estar desactivada.');
}

// Uses the public create-model form. The request guard validates its final payload,
// records the irreversible attempt, and permits exactly one creation request.
export async function submitUploadForm(page, model, { beforeSubmit, signal, timeout = 180000 } = {}) {
  let sent = false, guardError, creationRequest, rejectGuard;
  const guardFailed = new Promise((_, reject) => { rejectGuard = reject; }); guardFailed.catch(() => {});
  const requestRoute = '**' + CREATE_MODEL_PATH;
  const guard = async route => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    try {
      if (sent) throw fail('UPLOAD_DUPLICATE_REQUEST', 'Se ha bloqueado una segunda entrega del mismo diseño.');
      signal?.throwIfAborted();
      const payload = request.postDataJSON();
      const description = await page.evaluate(html => { const div = document.createElement('div'); div.innerHTML = html || ''; div.style.cssText='position:fixed;left:-10000px'; document.body.append(div); const text = div.innerText; div.remove(); return text; }, payload?.groupItem?.groupDesc);
      validateUploadPayload(payload, model, description);
      const category = await page.locator('.model-category-content input').first().inputValue();
      if (!/Impresoras? 3D|3D Printers?/i.test(category) || !/\b(Otros?|Others?)\b/i.test(category)) throw fail('UPLOAD_CATEGORY_MISMATCH', 'La categoría seleccionada debe ser Impresoras 3D / Otro.');
      if (!await page.locator('footer:visible input[type="checkbox"]').isChecked()) throw fail('UPLOAD_FORM_MISMATCH', 'Debes aceptar la declaración de derechos de autor antes de entregar.');
      await beforeSubmit();
      signal?.throwIfAborted();
      sent = true; creationRequest = request;
      await route.continue();
    } catch (error) { guardError = error; rejectGuard(error); await route.abort().catch(() => {}); }
  };
  await page.route(requestRoute, guard);
  try {
    await page.goto(CREATE_MODEL_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('.creality-print-content .upload-3mf input[type="file"]').first().setInputFiles(model.modelPath, { timeout: 45000 });
    // A processed plate is the readiness signal, not merely a selected filename.
    await page.locator('.creality-print-content .plate-thumbnail').first().waitFor({ state: 'visible', timeout });
    await page.locator('.creality-print-content .new-upload-progress:visible, .creality-print-content .upload-failed:visible').waitFor({ state: 'hidden', timeout });
    signal?.throwIfAborted();
    await page.locator('footer .step-one-btn:visible').click();
    const details = page.locator('.second-step:visible');
    await details.locator('.model-name-content input').waitFor({ timeout: 30000 });
    const name = await details.locator('.model-name-content input').inputValue();
    if (normalize(name) !== normalize(model.name)) throw fail('UPLOAD_MODEL_NAME_MISMATCH', 'Creality ha asignado un nombre distinto al archivo. Revisa el modelo antes de entregarlo.');
    const original = details.locator('.model-origin-content').getByText(/^Original$/i);
    if (await original.count()) await original.click();
    const free = details.locator('.model-set-price-content').getByText(/^(Gratis|Free)$/i);
    if (await free.count()) await free.click();
    await selectUploadCategory(page, details);
    // Clear any automatically suggested tags and enter the metadata verbatim.
    const tags = details.locator('.model-tag-content');
    while (await tags.locator('.el-tag__close').count()) await tags.locator('.el-tag__close').first().click();
    for (const tag of model.tags) {
      await tags.locator('input').fill(tag);
      await tags.locator('input').press('Enter');
      await tags.locator('.el-tag').filter({ hasText: tag }).first().waitFor({ state: 'visible', timeout: 15000 });
    }
    const coverBox = details.locator('.model-cover-content').first();
    async function uploadCover(index, file) {
      const chooser = page.waitForEvent('filechooser', { timeout: 15000 }); chooser.catch(() => {});
      await coverBox.locator('.upload-cover').nth(index).click();
      await (await chooser).setFiles(file);
      const crop = page.locator('.el-dialog:visible').filter({ has: page.locator('.cropper-container') });
      await crop.waitFor({ state: 'visible', timeout: 15000 });
      await crop.getByRole('button', { name: /^(Confirmar|Confirm|Aceptar|Guardar)$/i }).click();
      await crop.waitFor({ state: 'hidden', timeout: 30000 });
      await coverBox.locator('.upload-cover').nth(index).locator('.progress-content:visible').waitFor({ state: 'hidden', timeout: 60000 });
    }
    await uploadCover(0, model.coverPath);
    if (model.appCoverPath) await uploadCover(1, model.appCoverPath);
    const gallery = coverBox.locator('.upload-cover-last');
    for (const [index, file] of (model.imagePaths || []).entries()) {
      signal?.throwIfAborted();
      await gallery.locator('input[type="file"]').setInputFiles(file);
      await gallery.locator('.model-cover-item:not(.loading-work)').nth(index).waitFor({ state: 'visible', timeout: 60000 });
    }
    const license = details.locator('.model-license-content .radio-item');
    // CC BY-NC hides the third question. Set No while it is available, then
    // recheck after changing the first two answers (Creality can reset it).
    if (await license.nth(2).isVisible()) await checkInput(license.nth(2).locator('input[type="radio"][value="2"]'));
    await checkInput(license.nth(0).locator('input[type="radio"][value="1"]'));
    await checkInput(license.nth(1).locator('input[type="radio"][value="2"]'));
    if (await license.nth(2).isVisible()) await checkInput(license.nth(2).locator('input[type="radio"][value="2"]'));
    const filament = details.locator('.material-box');
    if (await filament.isVisible()) await checkInput(filament.locator('input[type="radio"][value="false"]'));
    await checkInput(details.locator('.model-share-content input[type="radio"][value="1"]'));
    const descriptionBox = details.locator('.model-detail-content');
    if (await descriptionBox.locator('iframe').count()) {
      await descriptionBox.frameLocator('iframe').locator('body[contenteditable="true"]').fill(model.description);
    } else await descriptionBox.locator('[contenteditable="true"]').fill(model.description);
    await acceptCopyrightDeclaration(page);
    signal?.throwIfAborted();
    const responsePromise = page.waitForResponse(response => response.request() === creationRequest && new URL(response.url()).pathname === CREATE_MODEL_PATH, { timeout: 75000 });
    responsePromise.catch(() => {});
    await page.locator('footer .submit:visible').filter({ hasText: /^(Entregar|Submit)$/i }).click();
    let response;
    try { response = await Promise.race([responsePromise, guardFailed]); } catch (error) { throw guardError || error; }
    const result = await response.json().catch(() => null);
    if (response.ok() && result?.code === 0 && result.result?.groupItem?.id) {
      const id = String(result.result.groupItem.id);
      return { id, url: 'https://www.crealitycloud.com/es/model-detail/' + encodeURIComponent(id), name: model.name };
    }
    if (result && Number.isFinite(result.code) && result.code !== 0) throw fail('UPLOAD_REJECTED', result.msg || 'Creality rechazó la entrega.');
    throw fail('UPLOAD_RESULT_UNCERTAIN', 'Creality no devolvió un identificador de diseño. Comprueba el Banco de trabajo antes de repetirlo.');
  } catch (error) {
    error.submissionStarted = sent;
    throw error;
  } finally { await page.unroute(requestRoute, guard).catch(() => {}); }
}
