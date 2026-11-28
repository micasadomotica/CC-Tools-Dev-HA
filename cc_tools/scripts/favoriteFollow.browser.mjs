import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { inspectFavoriteFollowing } from '../src/crealityFavoriteFollow.js';

test('seguimiento: sesión hidratada, identidad, acción idempotente y verificación tras recarga', async t => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  try {
    for (const scenario of [
      { name: 'seguir y confirmar', follow: true, clicks: 1, visits: 2, expected: 'following' },
      { name: 'ya seguido: nunca pulsar para dejar de seguir', initiallyFollowing: true, follow: true, clicks: 0, visits: 1, expected: 'following' },
      { name: 'revisión: no sigue', clicks: 0, visits: 1, expected: 'not_following' },
      { name: 'revisión: seguido', initiallyFollowing: true, clicks: 0, visits: 1, expected: 'following' },
      { name: 'cambio visual sin confirmación persistida', follow: true, rejectOnReload: true, clicks: 1, visits: 2, error: 'FAVORITE_FOLLOW_NOT_CONFIRMED' },
      { name: 'sesión cerrada', loggedIn: false, clicks: 0, visits: 1, error: 'LOGIN_REQUIRED' },
      { name: 'otra cuenta', actor: '999', clicks: 0, visits: 1, error: 'FAVORITE_FOLLOW_ACCOUNT_CHANGED' },
      { name: 'otro perfil', target: '999', clicks: 0, visits: 1, error: 'FAVORITE_PROFILE_NOT_FOUND' },
      { name: 'clase desconocida: no pulsar', buttonClass: 'unknown', follow: true, clicks: 0, visits: 1, error: 'FAVORITE_FOLLOW_UNAVAILABLE' }
    ]) await t.test(scenario.name, async () => {
      const context = await browser.newContext();
      let following = Boolean(scenario.initiallyFollowing), clicks = 0, visits = 0;
      await context.exposeBinding('followFixture', () => { clicks++; if (!scenario.rejectOnReload) following = true; });
      await context.route('**/*', route => {
        visits++;
        route.fulfill({ contentType: 'text/html', body: `<div id="__nuxt"></div>
          <div class="fan-follow-num">Siguiendo</div><button>Seguir</button>
          <div class="user-base"><div class="user-id">ID: ${scenario.target || '200'}</div>
          <div class="user-action-btns"><button class="user-follow-btn ${scenario.buttonClass || (following ? 'user-followed' : 'user-not-follow')}">Estado</button></div></div>
          <script>
            const nuxt = { isHydrating: true, payload: { state: { $sisLogin: false, $smodelUserId: '' } } };
            document.querySelector('#__nuxt').__vue_app__ = { config: { globalProperties: { $nuxt: nuxt } } };
            setTimeout(() => { nuxt.payload.state = { $sisLogin: ${scenario.loggedIn !== false}, $smodelUserId: '${scenario.actor || '100'}' }; nuxt.isHydrating = false; }, 30);
            document.querySelector('.user-follow-btn').onclick = async e => {
              await window.followFixture(); e.target.className = 'user-follow-btn user-followed';
            };
          </script>` });
      });
      const page = await context.newPage();
      const run = () => inspectFavoriteFollowing(page, { userId: '200', profileUrl: 'https://www.crealitycloud.com/es/user/200' },
        { accountUserId: '100', follow: scenario.follow, timeout: 1500 });
      try {
        if (scenario.error) await assert.rejects(run, { code: scenario.error });
        else assert.equal(await run(), scenario.expected);
        assert.equal(clicks, scenario.clicks);
        assert.equal(visits, scenario.visits);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});
