import { withAutomationBrowser } from './browserManager.js';
import { uploadLibrary } from './uploadDesignLibrary.js';
import { submitUploadForm, verifyUploadAccount } from './uploadDesignForm.js';
import { observeCrealityPage, captureDiagnosticScreenshot } from './crealityDiagnostics.js';
import { readIncentiveProgress } from './incentiveTasks.js';
import { progressDay } from './dailyProgress.js';
import { runUploadCleanup } from './uploadDesignCleanup.js';
import { uploadProject as uploadProjectForm } from './uploadProjectForm.js';

// Final decision for the Projects gallery (Banco de trabajo / FlowSlicer). The task
// setting "Cancelar subida 3MF a Proyectos" always wins over SUBIR: Si in info.txt.
export function projectUploadDecision(model = {}, task = {}) {
  if (task.projectUploadCancelled === true) return { upload: false, reason: 'cancelled', message: 'Subida a Proyectos cancelada en la configuración.' };
  if (model.projectUpload === true) return { upload: true, reason: 'info', message: 'info.txt indica SUBIR: Si.' };
  return { upload: false, reason: 'info', message: 'info.txt no pide subir a Proyectos.' };
}

export async function runUploadDesigns(task = {}, options = {}, deps = {}) {
  if (options.cleanupOnly) return runUploadCleanup(task, options, deps);
  const library = deps.library || uploadLibrary;
  const browser = deps.browser || withAutomationBrowser;
  const submit = deps.submit || submitUploadForm;
  const verifyAccount = deps.verifyAccount || verifyUploadAccount;
  const readReward = deps.readReward || readIncentiveProgress;
  const uploadProject = deps.uploadProject || uploadProjectForm;
  const account = options.ownUserId;
  if (!account) throw new Error('Actualiza el perfil de Creality antes de subir diseños.');
  if (options.source === 'schedule' && task.accountId !== account) throw new Error('La programación pertenece a otra cuenta. Revisa y vuelve a programar los diseños.');
  const day = progressDay(task.timezone);
  const source = options.source || 'manual';
  const selection = await library.candidates({ account, source, day, limit: source === 'manual' ? 5 : task.dailyLimit, selected: options.selected });
  if (!selection.items.length) return { success: true, message: selection.used >= Math.min(5, source === 'manual' ? 5 : task.dailyLimit) ? 'Ya se han enviado los diseños previstos para hoy.' : 'No hay nuevos diseños para subir.', details: { uploaded: [], emptyLibrary: true } };
  const uploaded = [], failures = [], screenshots = [], projectUploads = [];
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
        let submitting = false, delivered = false;
        try {
          const model = await library.prepare(entry, selection.defaultCategory);
          const result = await submit(page, model, { signal: options.signal, beforeSubmit: async () => {
            await library.record(account, entry, { status: 'submitting', day, source }); submitting = true;
          } });
          const decision = projectUploadDecision(model, task);
          let project = { ...decision, status: decision.upload ? 'pending' : 'skipped', decidedAt: new Date().toISOString() };
          // The Modelo 3D is delivered: store it before touching the Projects gallery.
          await library.record(account, entry, { status: 'submitted', day, source, ...result,
            submittedAt: new Date().toISOString(), submittedDay: day, project });
          uploaded.push(result); delivered = true;
          if (decision.upload) {
            // Independent of the Modelo 3D: a failure here never undoes the delivery.
            try {
              const saved = await uploadProject(page, model, { signal: options.signal });
              project = { ...project, ...saved, message: saved.status === 'already' ? 'El 3MF ya estaba en la Galería de Proyectos.' : 'Subido a la Galería de Proyectos.', finishedAt: new Date().toISOString() };
            } catch (error) {
              project = { ...project, status: 'failed', code: error.code || 'PROJECT_FAILED', message: error.message, finishedAt: new Date().toISOString() };
              const shot = await captureDiagnosticScreenshot(page, 'uploadDesigns', error.code || 'PROJECT_FAILED').catch(() => null);
              if (shot) screenshots.push(shot);
            }
            await library.record(account, entry, { project });
            if (options.signal?.aborted) throw options.signal.reason || new Error('Ejecución cancelada.');
          }
          projectUploads.push({ name: entry.name, ...project });
        } catch (error) {
          // Only an abort during the Projects step gets here after the delivery.
          if (delivered) throw error;
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
  const sentProjects = projectUploads.filter(item => ['uploaded', 'already'].includes(item.status)).length;
  const failedProjects = projectUploads.filter(item => item.status === 'failed');
  const projectNote = (sentProjects ? ` Proyectos: ${sentProjects} en la Galería.` : '') +
    (failedProjects.length ? ` No se pudo subir a Proyectos ${failedProjects[0].name}: ${failedProjects[0].message}` : '');
  return { success: failures.length === 0, message: message + projectNote, screenshots, details: { uploaded, failures, missing, projectUploads,
    rewardVerification: { status: 'pending', before }, rewardPending: uploaded.length > 0 } };
}
