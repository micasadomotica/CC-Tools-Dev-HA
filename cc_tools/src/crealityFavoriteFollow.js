import { parseFavoriteProfileUrl } from './favoriteProfiles.js';

const FOLLOW_BUTTON = '.user-base .user-action-btns .user-follow-btn';
const failure = (code) => Object.assign(new Error(code), { code });

// Only called by explicit follow/review actions, never by the model indexer.
export async function inspectFavoriteFollowing(page, profile, { accountUserId, follow = false, timeout = 20000 } = {}) {
  const parsed = parseFavoriteProfileUrl(profile.profileUrl);
  if (!parsed || parsed.userId !== String(profile.userId)) throw failure('FAVORITE_PROFILE_URL_INVALID');
  if (parsed.userId === accountUserId) throw failure('FAVORITE_PROFILE_IS_OWN');
  const visit = async () => {
    await page.goto(`${parsed.profileUrl}/model`, { waitUntil: 'domcontentloaded', timeout });
    return readFavoriteFollowingFromPage(page, accountUserId, parsed.userId, { timeout });
  };
  let status = await visit();
  if (follow && status === 'not_following') {
    // Never click a followed button: Creality uses it to unfollow.
    await page.locator(`${FOLLOW_BUTTON}.user-not-follow`).click({ timeout });
    await page.locator(`${FOLLOW_BUTTON}.user-followed`).waitFor({ state: 'visible', timeout });
    status = await visit();
    if (status !== 'following') throw failure('FAVORITE_FOLLOW_NOT_CONFIRMED');
  }
  return status;
}

export async function readFavoriteFollowingFromPage(page, accountUserId, targetUserId, { timeout = 20000 } = {}) {
  // SSR can show a public, logged-out button before Nuxt hydrates the session.
  await page.waitForFunction(() => {
    const app = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt;
    return app && app.isHydrating === false;
  }, null, { timeout });
  const session = await page.evaluate(() => {
    const state = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.payload.state;
    return { loggedIn: state.$sisLogin === true, userId: String(state.$smodelUserId || '') };
  });
  if (!session.loggedIn) throw failure('LOGIN_REQUIRED');
  if (!accountUserId || session.userId !== accountUserId) throw failure('FAVORITE_FOLLOW_ACCOUNT_CHANGED');
  const identity = page.locator('.user-base .user-id');
  await identity.waitFor({ state: 'visible', timeout });
  if ((await identity.innerText()).match(/ID\s*:\s*(\d+)/i)?.[1] !== targetUserId) {
    throw failure('FAVORITE_PROFILE_NOT_FOUND');
  }
  const button = page.locator(FOLLOW_BUTTON);
  await button.waitFor({ state: 'visible', timeout });
  const classes = (await button.getAttribute('class') || '').split(/\s+/);
  if (classes.includes('user-followed') && !classes.includes('user-not-follow')) return 'following';
  if (classes.includes('user-not-follow') && !classes.includes('user-followed')) return 'not_following';
  throw failure('FAVORITE_FOLLOW_UNAVAILABLE');
}
