import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installChallengeHandling, resolveBrowserChallenge, challengeEvents, CHALLENGE_MANUAL_AFTER_MS } from '../src/browserChallenge.js';

test('solicita intervención al detectar la verificación sin esperar ni recargar', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const context = new EventEmitter();
  const page = new EventEmitter();
  let active = true, ticks = 0, manualAt = null;
  const target = 'https://www.crealitycloud.com/es/test';
  Object.assign(page, {
    goto: async () => assert.fail('No debe navegar durante la espera'),
    reload: async () => assert.fail('No debe recargar durante la espera'),
    url: () => target,
    isClosed: () => false,
    bringToFront: async () => {},
    waitForTimeout: async ms => { ticks++; t.mock.timers.tick(ms); }
  });
  context.pages = () => [page];
  installChallengeHandling(context, { enabled: () => active,
    inspect: async () => ({ code: 'SECURITY_CHALLENGE' }) });
  const onChange = state => {
    if (state.phase !== 'manual') return;
    manualAt = Date.now() - 1000000;
    active = false;
  };
  challengeEvents.on('change', onChange);
  try {
    await assert.rejects(resolveBrowserChallenge(page, { code: 'SECURITY_CHALLENGE' }),
      { code: 'SECURITY_CHALLENGE_CANCELLED' });
    assert.equal(CHALLENGE_MANUAL_AFTER_MS, 0);
    assert.equal(manualAt, 0);
    assert.equal(ticks, 0);
  } finally { challengeEvents.off('change', onChange); }
});
