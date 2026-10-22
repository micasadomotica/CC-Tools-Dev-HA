import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isOwnModel } from '../src/modelOwnership.js';

function harness(states, { remoteDone = 0, progressAvailable = true } = {}) {
  const visits = [], posted = [], marked = [];
  const designs = states.map((state, index) => ({ id: String(index), title: `Model ${index}`,
    url: `https://example.test/${index}`, favoriteActive: true, indexedOnly: false,
    boostCount: state === 'known' ? 1 : 0 }));
  const runs = [];
  const h = vm.createContext({ Date, console, isOwnModel,
    readDesigns: async () => designs, readRuns: async () => runs,
    readIncentiveProgressBatch: async () => progressAvailable ? { 'Model Boost': {
      found: true, title: 'Model Boost', done: remoteDone, valid: 1, checkedAt: new Date().toISOString()
    } } : {},
    withAutomationBrowser: async (_opts, callback) => callback({ pages: () => [{}] }),
    observeCrealityPage: () => ({ stop() {} }),
    markDesignBoosted: async id => { marked.push(id); return designs[Number(id)]; },
    readPointsSummary: async () => ({}), executeRaffle: async () => ({ status: 'completed' }),
    captureDiagnosticScreenshot: async () => null,
    diagnoseTaskError: async error => ({ code: error.code, message: error.message }),
    failureFromDiagnostic: diagnostic => diagnostic,
    fixtureTarget: async (_page, design, _observer, _owner, { allowRepeat = false } = {}) => {
      visits.push({ id: design.id, allowRepeat });
      const state = states[Number(design.id)];
      if (state === 'missing') return null;
      if (['repeat', 'known'].includes(state) && !allowRepeat) return { alreadyBoosted: true };
      return { modelGroupId: design.id, authenticationHeaders: {},
        permission: { ok: true, body: { code: 0, result: { failType: state === 'denied' ? 1 : 0 } } } };
    },
    fixturePost: async (_page, url, payload) => {
      posted.push({ url, payload });
      return { ok: true, body: { code: 0, result: { count: 2 } } };
    }
  });
  const source = fs.readFileSync(new URL('../src/modelBoostTask.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, h);
  vm.runInContext('resolveBoostTarget = fixtureTarget; postJson = fixturePost;', h);
  return { visits, posted, marked, runs, designs, run: (executionSource = 'schedule') => h.runModelBoost({ executionSource }) };
}

test('three already boosted models do not hide the fourth unboosted model among 44 candidates', async () => {
  const h = harness(['repeat', 'repeat', 'repeat', ...Array(41).fill('new')]);
  const result = await h.run();
  assert.equal(result.success, true);
  assert.deepEqual(h.marked, ['3']);
  assert.deepEqual(h.visits.map(v => v.id), ['0', '1', '2', '3']);
  assert.equal(h.posted.filter(p => p.url.endsWith('/boost/boost')).length, 1);
});

test('all already boosted models permit exactly one repeated boost', async () => {
  const h = harness(['repeat', 'repeat', 'repeat']);
  assert.equal((await h.run()).success, true);
  assert.deepEqual(h.visits.at(-1), { id: '0', allowRepeat: true });
  assert.deepEqual(h.marked, ['0']);
  assert.equal(h.posted.filter(p => p.url.endsWith('/boost/boost')).length, 1);
});

test('locally known boosts are deferred until unboosted candidates are checked', async () => {
  const h = harness(['known', 'new']);
  assert.equal((await h.run()).success, true);
  assert.deepEqual(h.visits, [{ id: '1', allowRepeat: false }]);
});

test('a missing button does not establish that every model is already boosted', async () => {
  const h = harness(['repeat', 'missing']);
  const result = await h.run();
  assert.equal(result.success, false);
  assert.equal(result.details.retryableToday, true);
  assert.equal(h.posted.length, 0);
  assert.equal(h.marked.length, 0);
});

test('a rejected repeat permission never consumes a boost', async () => {
  const h = harness(['denied']);
  assert.equal((await h.run()).success, false);
  assert.equal(h.posted.filter(p => p.url.endsWith('/boost/boost')).length, 0);
});

test('a completed remote Model Boost blocks manual and scheduled consumption despite available tickets', async () => {
  for (const source of ['manual', 'schedule']) {
    const h = harness(['new'], { remoteDone: 1 });
    const result = await h.run(source);
    assert.equal(result.skipped, true);
    assert.equal(result.details.reason, 'BOOST_DAILY_LIMIT');
    assert.equal(result.details.rewardVerification.before.done, 1);
    assert.equal(h.posted.length, 0);
    assert.equal(h.visits.length, 0);
  }
});

test('an unknown daily counter never spends a ticket', async () => {
  const h = harness(['new'], { progressAvailable: false });
  const result = await h.run('manual');
  assert.equal(result.success, false);
  assert.equal(result.details.boostConsumed, false);
  assert.equal(h.posted.length, 0);
});

test('manual and scheduled executions share one daily slot even when two tickets are available', async () => {
  for (const firstSource of ['manual', 'schedule']) {
    const h = harness(['new', 'new']);
    const first = await h.run(firstSource);
    assert.equal(first.success, true);
    h.runs.push({ taskId: 'modelBoosts', status: 'success', finishedAt: new Date().toISOString(), details: first.details });
    for (const source of ['manual', 'schedule']) assert.equal((await h.run(source)).details.reason, 'BOOST_DAILY_LIMIT');
    assert.equal(h.posted.filter(p => p.url.endsWith('/boost/boost')).length, 1);
    h.runs[0].finishedAt = new Date(Date.now() - 86400000).toISOString();
    assert.equal((await h.run('schedule')).success, true);
    assert.equal(h.posted.filter(p => p.url.endsWith('/boost/boost')).length, 2);
  }
});
