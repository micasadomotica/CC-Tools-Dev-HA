import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { captureCommentFeed } from '../src/commentFeed.js';

const target = 'https://www.crealitycloud.com/es/model-detail/test?profileId=model-1';

function fixture() {
  const page = new EventEmitter();
  const frame = { url: () => target };
  page.mainFrame = () => frame;
  const request = { url: () => 'https://www.crealitycloud.com/api/cxy/comment/modelFeedList',
    method: () => 'POST', frame: () => frame };
  const response = { request: () => request };
  return { page, frame, request, response };
}

test('captures a feed arriving during a long navigation without a premature deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { page, request, response } = fixture();
  const feed = captureCommentFeed(page, target);
  t.after(feed.stop);
  t.mock.timers.tick(120000);
  page.emit('request', request);
  page.emit('response', response);
  assert.equal(await feed.read(), response);
});

test('gives the feed its full deadline after navigation finishes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { page, request, response } = fixture();
  const feed = captureCommentFeed(page, target);
  t.after(feed.stop);
  t.mock.timers.tick(120000);
  const reading = feed.read();
  t.mock.timers.tick(14999);
  page.emit('request', request);
  page.emit('response', response);
  assert.equal(await reading, response);
});

test('missing history still times out and stopping removes every listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { page } = fixture();
  const feed = captureCommentFeed(page, target);
  const reading = feed.read();
  t.mock.timers.tick(15000);
  assert.equal(await reading, null);
  feed.stop();
  assert.deepEqual(page.eventNames(), []);
});

test('closing or cancelling the capture releases a pending read', async () => {
  for (const close of [true, false]) {
    const { page } = fixture();
    const feed = captureCommentFeed(page, target);
    const reading = feed.read();
    if (close) page.emit('close');
    else feed.stop();
    assert.equal(await reading, null);
    assert.equal(await feed.read(), null);
    assert.deepEqual(page.eventNames(), []);
  }
});

test('rejects a previous request, another model, and iframe traffic', async () => {
  const { page, frame, request, response } = fixture();
  const feed = captureCommentFeed(page, target);
  try {
    page.emit('response', response); // Request started before this capture.
    const otherModel = { ...request };
    frame.url = () => target.replace('model-1', 'model-2');
    page.emit('request', otherModel);
    frame.url = () => target;
    page.emit('response', { request: () => otherModel });
    const iframeRequest = { ...request, frame: () => ({ url: () => target }) };
    page.emit('request', iframeRequest);
    page.emit('response', { request: () => iframeRequest });
    page.emit('request', request);
    page.emit('response', response);
    assert.equal(await feed.read(), response);
  } finally { feed.stop(); }
});
