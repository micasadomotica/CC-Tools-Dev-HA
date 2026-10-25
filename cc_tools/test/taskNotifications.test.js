import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyTaskResult } from '../src/scheduler.js';

for (const [task, successKey, errorKey, successDetails] of [
  ['modelCollections', 'notifyOnModelCollection', 'notifyOnModelCollectionError', { acted: [{ title: 'Design', url: 'https://example.test/model' }] }],
  ['makeNow', 'notifyOnMakeNow', 'notifyOnMakeNowError', {}],
  ['uploadDesigns', 'notifyOnUploadDesign', 'notifyOnUploadDesignError', { uploaded: [{ name: 'Design', url: 'https://example.test/model' }] }]
]) {
  for (const [status, key] of [['success', successKey], ['failed', errorKey]]) {
    test(`${task}: ${status} notification respects its independent toggle`, async t => {
      const messages = [];
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        messages.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ ok: true }) };
      });
      const config = { telegram: { enabled: true, botToken: 'test-only-token', chatId: 'test-only-chat', [successKey]: true, [errorKey]: true } };
      const result = { message: 'Test result', details: status === 'success' ? successDetails : {} };
      config.telegram[key] = false;
      await notifyTaskResult(config, task, status, result);
      assert.equal(messages.length, 0);
      config.telegram[key] = true;
      config.telegram[key === successKey ? errorKey : successKey] = false;
      await notifyTaskResult(config, task, status, result);
      assert.equal(messages.length, 1);
      config.telegram.enabled = false;
      await notifyTaskResult(config, task, status, result);
      assert.equal(messages.length, 1);
    });
  }
}

test('partial upload reports success and failure independently and ignores an empty batch', async t => {
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    messages.push(JSON.parse(options.body).text);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const config = { telegram: { enabled: true, botToken: 'test-token', chatId: 'test-chat', notifyOnUploadDesign: true, notifyOnUploadDesignError: false } };
  const result = { details: { uploaded: [{ name: 'OK', url: 'https://example.test/model' }], failures: [{ name: 'Failed', message: 'test failure' }] } };
  await notifyTaskResult(config, 'uploadDesigns', 'failed', result);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Diseño subido/);
  assert.doesNotMatch(messages[0], /test failure/);
  config.telegram.notifyOnUploadDesign = false;
  config.telegram.notifyOnUploadDesignError = true;
  await notifyTaskResult(config, 'uploadDesigns', 'failed', result);
  assert.equal(messages.length, 2);
  assert.match(messages[1], /test failure/);
  await notifyTaskResult(config, 'uploadDesigns', 'success', { details: { uploaded: [], emptyLibrary: true } });
  assert.equal(messages.length, 2);
});
