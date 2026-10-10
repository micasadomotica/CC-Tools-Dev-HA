import { withAutomationBrowser } from './browserManager.js';
import { uploadLibrary } from './uploadDesignLibrary.js';
import { submitUploadForm, verifyUploadAccount } from './uploadDesignForm.js';
import { observeCrealityPage, captureDiagnosticScreenshot } from './crealityDiagnostics.js';
import { readIncentiveProgress } from './incentiveTasks.js';
import { progressDay } from './dailyProgress.js';
import { runUploadCleanup } from './uploadDesignCleanup.js';

export async function runUploadDesigns(task = {}, options = {}, deps = {}) {
  if (options.cleanupOnly) return runUploadCleanup(task, options, deps);
  const library = deps.library || uploadLibrary;
  const browser = deps.browser || withAutomationBrowser;
  const submit = deps.submit || submitUploadForm;
  const verifyAccount = deps.verifyAccount || verifyUploadAccount;
  const readReward = deps.readReward || readIncentiveProgress;
  const account = options.ownUserId;
  if (!account) throw new Error('Actualiza el perfil de Creality antes de subir diseños.');
  if (options.source === 'schedule' && task.accountId !== account) throw new Error('La programación pertenece a otra cuenta. Revisa y vuelve a programar los diseños.');
  const day = progressDay(task.timezone);
  const source = options.source || 'manual';
  const selection = await library.candidates({ account, source, day, limit: source === 'manual' ? 5 : task.dailyLimit, selected: options.selected });
  if (!selection.items.length) return { success: true, message: selection.used >= Math.min(5, source === 'manual' ? 5 : task.dailyLimit) ? 'Ya se han enviado los diseños previstos para hoy.' : 'No hay nuevos diseños para subir.', details: { uploaded: [], emptyLibrary: true } };
  const uploaded = [], failures = [], screenshots = [];
  let before;
  await browser({}, async context => {
    const page = await context.newPage(); const observer = observeCrealityPage(page, 'uploadDesigns');
    try {
      await verifyAccount(page, account);
      before = await readReward(page, observer, 'Upload Models', { includePoints: false });
      if (!before?.found) throw new Error('No se ha podido comprobar el contador Upload Models. Vuelve a intentarlo cuando la página de recompensas esté disponible.');
      const capacity = Math.max(0, Math.min(5, before.valid || 5) - Math.max(before.done || 0, selection.used));
      for (const entry of selection.items.slice(0, capacity)) {
        options.signal?.throwIfAborted();
        let submitting = false;
        try {
          const model = await library.prepare(entry);
          const result = await submit(page, model, { signal: options.signal, beforeSubmit: async () => {
            await library.record(account, entry, { status: 'submitting', day, source }); submitting = true;
          } });
          await library.record(account, entry, { status: 'submitted', day, source, ...result });
          uploaded.push(result);
        } catch (error) {
          const uncertain = submitting && error.code !== 'UPLOAD_REJECTED';
          await library.record(account, entry, { status: uncertain ? 'uncertain' : 'failed', day, source, error: error.message });
          failures.push({ name: entry.name, message: error.message, code: error.code || 'UPLOAD_FAILED', uncertain });
          const shot = await captureDiagnosticScreenshot(page, 'uploadDesigns', error.code || 'UPLOAD_FAILED').catch(() => null);
          if (shot) screenshots.push(shot);
          break;
        }
      }
    } finally { observer.stop(); await page.close().catch(() => {}); }
  });
  const missing = Math.max(0, (source === 'schedule' ? task.dailyLimit : selection.items.length) - selection.used - uploaded.length);
  const message = failures.length ? `${uploaded.length} diseños entregados. ${failures[0].name}: ${failures[0].message}` : uploaded.length ?
    `${uploaded.length} diseños entregados a Creality Cloud. Recompensa pendiente de aprobación.${missing ? ` Faltan ${missing} diseños para el objetivo diario.` : ''}` : 'El contador Upload Models ya ha alcanzado el límite diario.';
  return { success: failures.length === 0, message, screenshots, details: { uploaded, failures, missing,
    rewardVerification: { status: 'pending', before }, rewardPending: uploaded.length > 0 } };
}
