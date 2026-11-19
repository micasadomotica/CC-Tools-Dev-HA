import test from 'node:test';
import assert from 'node:assert/strict';
import { excludeUnavailableModel, isUnavailableModel } from '../src/unavailableModel.js';

test('solo un 404 de la ficha o una revisión rechazada cuentan como modelo no disponible', () => {
  assert.equal(isUnavailableModel('MODEL_NOT_FOUND'), true);
  assert.equal(isUnavailableModel({ code: 'MODEL_REVIEW_FAILED' }), true);
  assert.equal(isUnavailableModel({ diagnostic: { code: 'MODEL_NOT_FOUND' } }), true);
  for (const code of ['LOGIN_REQUIRED', 'SECURITY_CHALLENGE', 'CREALITY_HTTP_ERROR', 'NETWORK_FAILURE', 'MODEL_CONTROLS_NOT_FOUND']) {
    assert.equal(isUnavailableModel({ code }), false, code);
  }
  assert.equal(isUnavailableModel(null), false);
});

test('excluye el diseño de la lista y devuelve el motivo', async () => {
  const excluded = [];
  const design = { id: 'd1', title: 'Chicago bears bracelet', url: 'https://www.crealitycloud.com/es/model-detail/x' };
  const result = await excludeUnavailableModel(design, 'MODEL_NOT_FOUND', { exclude: async id => { excluded.push(id); } });
  assert.deepEqual(excluded, ['d1']);
  assert.deepEqual(result, { designId: 'd1', title: 'Chicago bears bracelet', url: design.url, reason: 'model_not_found' });
  assert.equal((await excludeUnavailableModel(design, 'MODEL_REVIEW_FAILED', { exclude: async () => {} })).reason, 'model_review_failed');
});
