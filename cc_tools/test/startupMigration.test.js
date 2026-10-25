import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { migrateAtStartup, MIGRATION_DIR } from '../src/startupMigration.js';
import { createSupervisorClient, extractMigrationArchive, assertSourceContainersStopped } from '../src/migrationTransport.js';
import { assertMigrationReviewed, acknowledgeMigrationReview, requireMigrationReview } from '../src/migrationReview.js';
import { buildHealthMetrics } from '../src/healthMetrics.js';

const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, data) => fs.writeFile(file, JSON.stringify(data));
async function fixture(t, source = 'local_cc_tools') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  const original = path.join(root, source);
  await fs.mkdir(dataDir);
  await fs.mkdir(path.join(original, 'browser-session'), { recursive: true });
  await write(path.join(original, 'config.json'), { tasks: { finishPrint: { enabled: true, dailyLimit: 3 } }, crealityProfile: { name: 'source' }, telegram: { botToken: 'test-only-secret' } });
  await write(path.join(original, 'runs.json'), [{ id: 'history' }]);
  await write(path.join(original, 'options.json'), { timezone: 'other', migration_confirm: true });
  await fs.writeFile(path.join(original, '.hidden'), 'hidden data');
  await fs.writeFile(path.join(original, 'browser-session', 'session file'), 'session');
  await write(path.join(dataDir, 'config.json'), { tasks: {}, crealityProfile: { name: 'destination' } });
  await fs.writeFile(path.join(dataDir, 'destination-only'), 'keep in backup');
  const options = { timezone: 'Europe/Madrid', migration_source: source === 'local_cc_tools' ? 'CC Tools Dev local' : 'CC Tools de TitoTB', migration_confirm: true };
  await write(path.join(dataDir, 'options.json'), options);
  const calls = [];
  const dependencies = {
    dataDir, options, log: line => { assert.doesNotMatch(line, /test-only-secret/); calls.push(line); },
    supervisor: {
      info: async slug => slug === 'self' ? { slug: '34e9898c_cc_tools' } : { slug, state: 'stopped', watchdog: false },
      disarm: async () => { calls.push('disarm'); }
    },
    sourceArchive: {
      check: async () => {},
      assertStopped: async () => {},
      download: async (_source, target) => { assert.ok(calls.includes('disarm')); await fs.writeFile(target, 'archive fixture'); }
    },
    extractArchive: async (_archive, dir, slug) => { await fs.cp(original, path.join(dir, slug), { recursive: true }); }
  };
  return { root, dataDir, original, dependencies, calls, options };
}
async function unchanged(f) {
  assert.equal((await json(path.join(f.dataDir, 'config.json'))).crealityProfile.name, 'destination');
  assert.equal(await fs.readFile(path.join(f.dataDir, 'destination-only'), 'utf8'), 'keep in backup');
  assert.equal((await json(path.join(f.original, 'config.json'))).crealityProfile.name, 'source');
}

test('normal 1.0.51 update does not require Docker, Supervisor, or create migration files', async t => {
  const f = await fixture(t);
  const result = await migrateAtStartup({ dataDir: f.dataDir, options: { timezone: 'Europe/Madrid' } });
  assert.equal(result.migrated, false);
  await unchanged(f);
  await assert.rejects(fs.stat(path.join(f.dataDir, MIGRATION_DIR)), { code: 'ENOENT' });
});

for (const source of ['local_cc_tools', '8966b8c7_cc_tools']) {
  test(`imports all data from ${source}, preserves options and source, keeps destination backup and review pause`, async t => {
    const f = await fixture(t, source);
    const result = await migrateAtStartup(f.dependencies);
    assert.equal(result.migrated, true);
    const imported = await json(path.join(f.dataDir, 'config.json'));
    assert.equal(imported.crealityProfile.name, 'source');
    assert.equal(imported.tasks.finishPrint.dailyLimit, 3);
    assert.equal(imported.migrationReview.required, true);
    assert.equal(await fs.readFile(path.join(f.dataDir, '.hidden'), 'utf8'), 'hidden data');
    assert.equal(await fs.readFile(path.join(f.dataDir, 'browser-session/session file'), 'utf8'), 'session');
    assert.deepEqual(await json(path.join(f.dataDir, 'options.json')), { ...f.options, migration_source: 'No migrar', migration_confirm: false });
    assert.equal(await fs.readFile(path.join(result.backup, 'previous/destination-only'), 'utf8'), 'keep in backup');
    assert.equal((await json(path.join(f.original, 'config.json'))).migrationReview, undefined);
    await assert.rejects(fs.stat(path.join(f.dataDir, 'destination-only')), { code: 'ENOENT' });
    const restart = await migrateAtStartup({ dataDir: f.dataDir, options: await json(path.join(f.dataDir, 'options.json')) });
    assert.equal(restart.migrated, false);
    assert.equal(f.calls.filter(c => c === 'disarm').length, 1);
  });
}

for (const scenario of ['unconfirmed', 'bad-source', 'bad-target', 'running', 'watchdog', 'no-docker', 'disarm-failure', 'archive-failure', 'corrupt-data', 'source-restarted']) {
  test(`refuses ${scenario} without replacing destination`, async t => {
    const f = await fixture(t);
    const deps = f.dependencies;
    if (scenario === 'unconfirmed') deps.options.migration_confirm = false;
    if (scenario === 'bad-source') deps.options.migration_source = '../other';
    if (scenario === 'bad-target') deps.supervisor.info = async () => ({ slug: 'local_cc_tools' });
    if (scenario === 'running' || scenario === 'watchdog') deps.supervisor.info = async slug => slug === 'self' ? { slug: '34e9898c_cc_tools' } : { slug, state: scenario === 'running' ? 'started' : 'stopped', watchdog: scenario === 'watchdog' };
    if (scenario === 'no-docker') deps.sourceArchive.check = async () => { throw new Error('no Docker'); };
    if (scenario === 'disarm-failure') deps.supervisor.disarm = async () => { throw new Error('options denied'); };
    if (scenario === 'archive-failure') deps.sourceArchive.download = async () => { throw new Error('no space'); };
    if (scenario === 'corrupt-data') await fs.writeFile(path.join(f.original, 'config.json'), '{broken');
    if (scenario === 'source-restarted') {
      let reads = 0;
      deps.supervisor.info = async slug => slug === 'self' ? { slug: '34e9898c_cc_tools' } : { slug, state: ++reads === 1 ? 'stopped' : 'started' };
    }
    await assert.rejects(migrateAtStartup(deps));
    assert.equal((await json(path.join(f.dataDir, 'config.json'))).crealityProfile.name, 'destination');
    assert.equal(await fs.readFile(path.join(f.dataDir, 'destination-only'), 'utf8'), 'keep in backup');
  });
}

for (const phase of ['backup', 'install']) {
  test(`rolls back a failure during ${phase}, blocks automatic restart and allows explicit cancellation`, async t => {
    const f = await fixture(t);
    f.dependencies.checkpoint = async step => { if (step === phase) throw new Error('simulated I/O failure'); };
    await assert.rejects(migrateAtStartup(f.dependencies), /datos anteriores/);
    await unchanged(f);
    const cancelled = { ...f.dependencies, options: { migration_source: 'No migrar', migration_confirm: false } };
    await assert.rejects(migrateAtStartup(cancelled), /anterior falló/);
    cancelled.options.migration_confirm = true;
    assert.equal((await migrateAtStartup(cancelled)).migrated, false);
    await unchanged(f);
  });
}

for (const state of ['unknown', 'startup', 'started', '', null, undefined]) {
  test(`logs exact Supervisor state ${String(state)} and refuses before creating a backup`, async t => {
    const f = await fixture(t);
    const realInfo = f.dependencies.supervisor.info;
    f.dependencies.supervisor.info = async slug => slug === 'self' ? realInfo(slug) : {
      slug, state, version: '1.0.49', watchdog: false, boot: 'manual',
      options: { token: 'test-only-secret' }, unrelated: 'do-not-log',
    };
    f.dependencies.sourceArchive.check = async () => assert.fail('must reject before accessing Docker');
    const expected = JSON.stringify(state ?? null);
    await assert.rejects(migrateAtStartup(f.dependencies), error => {
      assert.ok(error.message.includes(`state=${expected}`));
      assert.ok(error.message.includes('local_cc_tools'));
      return true;
    });
    const line = f.calls.find(value => value.startsWith('[migration] Supervisor:') && value.includes('local_cc_tools'));
    const diagnostic = JSON.parse(line.slice('[migration] Supervisor: '.length));
    assert.equal(diagnostic.state, state ?? null);
    assert.equal(diagnostic.requested, 'local_cc_tools');
    assert.equal(diagnostic.slug, 'local_cc_tools');
    assert.equal(diagnostic.version, '1.0.49');
    assert.equal(diagnostic.phase, 'antes de preparar la copia');
    assert.doesNotMatch(f.calls.join('\n'), /test-only-secret|do-not-log|options/);
    assert.ok(!f.calls.includes('disarm'));
    await unchanged(f);
    await assert.rejects(fs.stat(path.join(f.dataDir, MIGRATION_DIR)), { code: 'ENOENT' });
  });
}

test('distinguishes a wrong origin slug from a running app', async t => {
  const f = await fixture(t);
  f.dependencies.supervisor.info = async slug => slug === 'self'
    ? { slug: '34e9898c_cc_tools' } : { slug: '8966b8c7_cc_tools', state: 'stopped' };
  await assert.rejects(migrateAtStartup(f.dependencies), /Origen inesperado.*local_cc_tools.*8966b8c7_cc_tools/);
  await unchanged(f);
});

for (const source of ['local_cc_tools', '8966b8c7_cc_tools']) {
  test(`migrates ${source} in Supervisor error only after Docker confirms inactivity twice`, async t => {
    const f = await fixture(t, source);
    const info = f.dependencies.supervisor.info;
    f.dependencies.supervisor.info = async slug => slug === 'self' ? info(slug)
      : { slug, state: 'error', version: '1.0.49', watchdog: false };
    let checks = 0;
    f.dependencies.sourceArchive.assertStopped = async slug => {
      assert.equal(slug, source);
      // Supervisor may remove the container altogether after stopping it.
      assertSourceContainersStopped(slug, []);
      checks++;
    };
    assert.equal((await migrateAtStartup(f.dependencies)).migrated, true);
    assert.equal(checks, 2);
    assert.ok(f.calls.some(line => line.includes('Supervisor indica error, pero Docker confirma')));
    assert.equal((await json(path.join(f.dataDir, 'config.json'))).migrationReview.required, true);
  });
}

for (const scenario of ['running', 'paused', 'restarting', 'removing', 'unknown', 'no-docker', 'no-verifier', 'no-version', 'no-watchdog', 'watchdog', 'restarted-during-copy']) {
  test(`Supervisor error does not bypass ${scenario}`, async t => {
    const f = await fixture(t);
    const info = f.dependencies.supervisor.info;
    f.dependencies.supervisor.info = async slug => slug === 'self' ? info(slug) : {
      slug, state: 'error', version: scenario === 'no-version' ? null : '1.0.49',
      watchdog: scenario === 'no-watchdog' ? undefined : scenario === 'watchdog',
    };
    let checks = 0;
    f.dependencies.sourceArchive.assertStopped = async slug => {
      checks++;
      if (scenario === 'no-docker') throw new Error('Docker unavailable');
      assertSourceContainersStopped(slug, scenario === 'restarted-during-copy' && checks === 1 ? [] : [
        { Names: [`/app_${slug}`], State: scenario === 'restarted-during-copy' ? 'running' : scenario },
      ]);
    };
    if (scenario === 'no-verifier') delete f.dependencies.sourceArchive.assertStopped;
    await assert.rejects(migrateAtStartup(f.dependencies));
    if (scenario === 'restarted-during-copy') assert.equal(checks, 2);
    await unchanged(f);
  });
}

test('Docker verification includes stopped containers and rejects either active naming convention', () => {
  const source = 'local_cc_tools';
  for (const prefix of ['app', 'addon']) {
    for (const state of ['created', 'exited', 'dead']) {
      assert.equal(assertSourceContainersStopped(source, [{ Names: [`/${prefix}_${source}`], State: state }])[0].state, state);
    }
    for (const state of ['running', 'paused', 'restarting', 'removing', 'unknown', undefined]) {
      assert.throws(() => assertSourceContainersStopped(source, [{ Names: [`/${prefix}_${source}`], State: state }]), /Docker State=/);
    }
  }
  assert.deepEqual(assertSourceContainersStopped(source, [{ Names: ['/app_8966b8c7_cc_tools'], State: 'running' }]), []);
  assert.throws(() => assertSourceContainersStopped(source, [
    { Names: [`/app_${source}`], State: 'exited' }, { Names: [`/addon_${source}`], State: 'running' },
  ]), /sigue activo/);
  for (const invalid of [null, {}, [null], [{}], [{ Names: [null] }]]) {
    assert.throws(() => assertSourceContainersStopped(source, invalid), /lista de contenedores no válida/);
  }
});

test('records both source validations and the destination protection state', async t => {
  const f = await fixture(t);
  const realInfo = f.dependencies.supervisor.info;
  f.dependencies.supervisor.info = async slug => ({ ...await realInfo(slug), protected: slug !== 'self' });
  await migrateAtStartup(f.dependencies);
  const diagnostics = f.calls.filter(line => line.startsWith('[migration] Supervisor: '))
    .map(line => JSON.parse(line.slice('[migration] Supervisor: '.length)));
  assert.equal(diagnostics[0].phase, 'destino');
  assert.equal(diagnostics[0].protected, false);
  assert.deepEqual(diagnostics.slice(1).map(item => item.phase), ['antes de preparar la copia', 'antes de sustituir los datos']);
  assert.ok(diagnostics.slice(1).every(item => item.state === 'stopped' && item.protected));
});

test('Supervisor request failures identify endpoint and response status without dumping response data', async () => {
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, status: 200, json: async () => ({ result: 'error', data: { token: 'test-only-secret' } }) },
  ]) {
    const client = createSupervisorClient({}, { token: 'test-token', request: async () => response });
    await assert.rejects(client.info('local_cc_tools'), error => {
      assert.ok(error.message.includes('/addons/local_cc_tools/info'));
      assert.ok(error.message.includes(`HTTP ${response.status}`));
      assert.doesNotMatch(error.message, /test-only-secret|test-token/);
      if (response.ok) assert.ok(error.message.includes('result="error"'));
      return true;
    });
  }
});

test('recovers a process killed during installation before allowing a retry', async t => {
  const f = await fixture(t);
  const id = randomUUID();
  const control = path.join(f.dataDir, MIGRATION_DIR);
  const previous = path.join(control, id, 'previous');
  await fs.mkdir(previous, { recursive: true });
  for (const name of ['config.json', 'destination-only']) await fs.rename(path.join(f.dataDir, name), path.join(previous, name));
  await fs.writeFile(path.join(f.dataDir, 'partial-import'), 'partial');
  await write(path.join(control, 'state.json'), { id, source: 'local_cc_tools', phase: 'installing' });
  await assert.rejects(migrateAtStartup(f.dependencies), /interrupción/);
  await unchanged(f);
  await assert.rejects(fs.stat(path.join(f.dataDir, 'partial-import')), { code: 'ENOENT' });
  assert.equal((await json(path.join(control, 'state.json'))).phase, 'failed');
});

test('a completed migration can be explicitly requested again, preserving both backups', async t => {
  const f = await fixture(t);
  const first = await migrateAtStartup(f.dependencies);
  const second = await migrateAtStartup(f.dependencies);
  assert.notEqual(first.backup, second.backup);
  assert.equal((await json(path.join(first.backup, 'previous/config.json'))).crealityProfile.name, 'destination');
  assert.equal((await json(path.join(second.backup, 'previous/config.json'))).crealityProfile.name, 'source');
});

test('migration review survives unrelated session-health updates until explicitly acknowledged', () => {
  const config = requireMigrationReview({ tasks: {} }, 'local_cc_tools');
  config.automationHealth.state = 'active';
  assert.throws(() => assertMigrationReviewed(config), /Datos migrados/);
  assert.equal(buildHealthMetrics(config).state, 'paused');
  acknowledgeMigrationReview(config);
  assert.doesNotThrow(() => assertMigrationReviewed(config));
});

test('Supervisor disarm preserves unrelated options and resets the one-shot selection', async () => {
  let sent;
  const client = createSupervisorClient({ timezone: 'UTC', migration_source: 'CC Tools Dev local', migration_confirm: true }, {
    token: 'test-token', request: async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ result: 'ok' }) }; }
  });
  await client.disarm();
  assert.equal(sent.url, 'http://supervisor/addons/self/options');
  assert.deepEqual(JSON.parse(sent.init.body), { options: { timezone: 'UTC', migration_source: 'No migrar', migration_confirm: false } });
});

test('Linux tar verifies binary data, hidden files, permissions and session symlinks', { skip: process.platform !== 'linux' }, async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.original, 'binary'), Buffer.from([0, 1, 254, 255]));
  await fs.chmod(path.join(f.original, 'binary'), 0o640);
  await fs.symlink('/tmp/chromium-test/SingletonSocket', path.join(f.original, 'browser-session/SingletonSocket'));
  const archive = path.join(f.root, 'test.tar');
  await promisify(execFile)('tar', ['-cpf', archive, '-C', f.root, 'local_cc_tools']);
  const destination = path.join(f.root, 'extract');
  await fs.mkdir(destination);
  await extractMigrationArchive(archive, destination, 'local_cc_tools');
  assert.equal((await fs.stat(path.join(destination, 'local_cc_tools/binary'))).mode & 0o777, 0o640);
  assert.equal(await fs.readlink(path.join(destination, 'local_cc_tools/browser-session/SingletonSocket')), '/tmp/chromium-test/SingletonSocket');
  await assert.rejects(fs.stat(path.join(destination, 'local_cc_tools/options.json')), { code: 'ENOENT' });
});
