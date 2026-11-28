import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavoriteFollowingService } from '../src/favoriteFollowing.js';
import { DEFAULT_FAVORITE_PROFILES } from '../src/favoriteProfiles.js';

function harness(overrides = {}) {
  let config = { crealityProfile: { userId: '100' }, crealityFavorites: [
    { userId: '200', profileUrl: 'https://www.crealitycloud.com/es/user/200', indexedModelCount: 4 }
  ], crealityFavoriteFollowing: {} };
  const calls = [];
  const service = createFavoriteFollowingService({
    read: async () => structuredClone(config),
    write: async value => { config = structuredClone(value); },
    withBrowser: async (_options, callback) => callback({ newPage: async () => ({ close: async () => {} }) },
      { confirmAuthenticated: true, userId: '100' }),
    inspect: async (_page, profile, options) => { calls.push({ profile, options }); return 'following'; },
    ...overrides
  });
  return { service, calls, config: () => config, change: fn => fn(config) };
}

test('seguir es explícito, persiste la comprobación y rechaza operaciones simultáneas', async () => {
  const h = harness();
  assert.deepEqual(h.calls, []);
  assert.equal(h.service.start('200').running, true);
  assert.throws(() => h.service.start(), { code: 'FAVORITE_FOLLOW_BUSY' });
  await h.service.settled();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.follow, true);
  assert.equal(h.service.state().errors, 0);
  const saved = h.config().crealityFavoriteFollowing['200'];
  assert.equal(saved.status, 'following');
  assert.equal(saved.accountUserId, '100');
  assert.ok(Date.parse(saved.checkedAt));
  assert.equal(h.config().crealityFavorites[0].indexedModelCount, 4);
});

test('la revisión independiente solo lee; incluye favoritos predeterminados y continúa tras un fallo', async () => {
  const calls = [];
  const h = harness({ inspect: async (_page, profile, options) => {
    calls.push({ id: profile.userId, follow: options.follow });
    if (profile.userId === DEFAULT_FAVORITE_PROFILES[0].userId) throw new Error('network');
    return 'not_following';
  } });
  h.service.start();
  await h.service.settled();
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.follow === false));
  assert.equal(h.service.state().completed, 3);
  assert.equal(h.service.state().errors, 1);
  assert.equal(h.config().crealityFavoriteFollowing['200'].status, 'not_following');
  assert.equal(h.config().crealityFavoriteFollowing[DEFAULT_FAVORITE_PROFILES[0].userId].status, 'unknown');
});

test('un fallo de verificación invalida el Seguido anterior y permite reintentar', async () => {
  let fail = true;
  const h = harness({ inspect: async () => { if (fail) throw Object.assign(new Error(), { code: 'FAVORITE_FOLLOW_NOT_CONFIRMED' }); return 'following'; } });
  h.change(c => { c.crealityFavoriteFollowing['200'] = { accountUserId: '100', status: 'following', checkedAt: '2026-11-01T00:00:00Z' }; });
  h.service.start('200'); await h.service.settled();
  assert.equal(h.config().crealityFavoriteFollowing['200'].status, 'unknown');
  assert.equal(h.config().crealityFavoriteFollowing['200'].checkedAt, '');
  fail = false;
  h.service.start('200'); await h.service.settled();
  assert.equal(h.config().crealityFavoriteFollowing['200'].status, 'following');
});

test('rechaza sesión no confirmada, cuenta distinta, propio perfil y perfiles ajenos a favoritos', async () => {
  for (const scenario of [
    { session: { confirmAuthenticated: false }, target: '200', error: 'LOGIN_REQUIRED' },
    { session: { confirmAuthenticated: true, userId: '999' }, target: '200', error: 'FAVORITE_FOLLOW_ACCOUNT_CHANGED' },
    { target: '100', error: 'FAVORITE_PROFILE_IS_OWN' },
    { target: '999', error: 'FAVORITE_PROFILE_NOT_FOUND' }
  ]) {
    const h = harness(scenario.session ? { withBrowser: async (_opts, callback) => callback({}, scenario.session) } : {});
    h.service.start(scenario.target); await h.service.settled();
    assert.equal(h.service.state().error, scenario.error);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.config().crealityFavoriteFollowing, {});
  }
});

test('la comprobación no restaura un favorito eliminado ni pisa los diseños actualizados durante la consulta', async () => {
  const h = harness({ inspect: async () => {
    h.change(c => { c.crealityFavorites = []; c.tasks = { manualChange: true }; });
    return 'following';
  } });
  h.service.start('200'); await h.service.settled();
  assert.deepEqual(h.config().crealityFavorites, []);
  assert.equal(h.config().tasks.manualChange, true);
  // Local removal does not request any unfollow action.
  assert.equal(h.config().crealityFavoriteFollowing['200'].status, 'following');
});

test('cambiar la cuenta durante la consulta no atribuye el resultado a la nueva cuenta', async () => {
  const h = harness({ inspect: async () => { h.change(c => { c.crealityProfile.userId = '999'; }); return 'following'; } });
  h.service.start('200'); await h.service.settled();
  assert.equal(h.service.state().error, 'FAVORITE_FOLLOW_ACCOUNT_CHANGED');
  assert.deepEqual(h.config().crealityFavoriteFollowing, {});
});
