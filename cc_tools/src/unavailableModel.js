import { excludeDesign } from './storage.js';

// Definitive answers from Creality Cloud that a model page is gone: the model
// detail document returned 404, or the model did not pass Creality's review.
// Network, session and challenge errors are never treated as unavailable.
export const UNAVAILABLE_MODEL_CODES = new Set(['MODEL_NOT_FOUND', 'MODEL_REVIEW_FAILED']);

export function isUnavailableModel(value) {
  const code = typeof value === 'string' ? value : value?.code || value?.diagnostic?.code;
  return UNAVAILABLE_MODEL_CODES.has(code);
}

/**
 * Remove a design whose page no longer exists from the downloaded list and add
 * it to the exclusion list, as model discovery already does, so no module picks
 * it again and discovery does not add it back.
 */
export async function excludeUnavailableModel(design, code, { exclude = excludeDesign } = {}) {
  if (design?.id) await exclude(design.id);
  return {
    designId: design?.id || '',
    title: design?.title || '',
    url: design?.url || '',
    reason: code === 'MODEL_REVIEW_FAILED' ? 'model_review_failed' : 'model_not_found'
  };
}
