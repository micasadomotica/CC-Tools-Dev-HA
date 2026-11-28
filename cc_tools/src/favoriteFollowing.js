import { withAutomationBrowser } from './browserManager.js';
import { readConfig, writeConfig } from './storage.js';
import { normalizeFavoriteProfiles } from './favoriteProfiles.js';
import { inspectFavoriteFollowing } from './crealityFavoriteFollow.js';

const failure = (code) => Object.assign(new Error(code), { code });

export function createFavoriteFollowingService({
  read = readConfig, write = writeConfig, withBrowser = withAutomationBrowser,
  inspect = inspectFavoriteFollowing
} = {}) {
  let job = { running: false, completed: 0, total: 0, errors: 0, error: '' };
  let pending = Promise.resolve();

  async function run(userId) {
    const config = await read();
    const accountUserId = String(config.crealityProfile?.userId || '');
    if (!accountUserId) throw failure('LOGIN_REQUIRED');
    const favorites = normalizeFavoriteProfiles(config.crealityFavorites);
    const targets = userId ? favorites.filter(p => p.userId === userId)
      : favorites.filter(p => p.userId !== accountUserId);
    if (userId === accountUserId) throw failure('FAVORITE_PROFILE_IS_OWN');
    if (userId && !targets.length) throw failure('FAVORITE_PROFILE_NOT_FOUND');
    job.total = targets.length;
    await withBrowser({ diagnosticSource: 'favorite_following' }, async (context, session) => {
      if (!session?.confirmAuthenticated || !session.userId) throw failure('LOGIN_REQUIRED');
      if (session.userId !== accountUserId) throw failure('FAVORITE_FOLLOW_ACCOUNT_CHANGED');
      const page = await context.newPage();
      try {
        for (const profile of targets) {
          const before = await read();
          if (String(before.crealityProfile?.userId || '') !== accountUserId) throw failure('FAVORITE_FOLLOW_ACCOUNT_CHANGED');
          if (!normalizeFavoriteProfiles(before.crealityFavorites).some(p => p.userId === profile.userId)) {
            if (userId) throw failure('FAVORITE_PROFILE_NOT_FOUND');
            job.completed++;
            continue;
          }
          let status = 'unknown', error = '';
          try {
            status = await inspect(page, profile, { accountUserId, follow: Boolean(userId) });
          } catch (cause) {
            error = cause.code || 'FAVORITE_FOLLOW_UNAVAILABLE';
            job.errors++;
          }
          // Reload after browser I/O. Keep follow metadata separate from the index
          // array so simultaneous design updates/removals cannot be overwritten.
          const current = await read();
          if (String(current.crealityProfile?.userId || '') !== accountUserId) throw failure('FAVORITE_FOLLOW_ACCOUNT_CHANGED');
          current.crealityFavoriteFollowing ||= {};
          current.crealityFavoriteFollowing[profile.userId] = {
            accountUserId, status, checkedAt: error ? '' : new Date().toISOString(), error
          };
          await write(current);
          job.completed++;
          if (['LOGIN_REQUIRED', 'FAVORITE_FOLLOW_ACCOUNT_CHANGED', 'APP_STOPPING'].includes(error)) throw failure(error);
        }
      } finally { await page.close().catch(() => {}); }
    });
  }

  return {
    state: () => ({ ...job }),
    settled: () => pending,
    start(userId = '') {
      if (job.running) throw failure('FAVORITE_FOLLOW_BUSY');
      job = { running: true, kind: userId ? 'follow' : 'review', userId, completed: 0, total: 0, errors: 0, error: '' };
      pending = run(userId).catch(error => { job.error = error.code || 'FAVORITE_FOLLOW_UNAVAILABLE'; })
        .finally(() => { job.running = false; });
      return { ...job };
    }
  };
}

export const favoriteFollowing = createFavoriteFollowingService();
