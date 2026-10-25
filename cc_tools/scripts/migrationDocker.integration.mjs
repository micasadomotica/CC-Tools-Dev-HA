// Run only in the disposable GitHub Actions runner, never against a user's HA.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dockerSourceArchive, extractMigrationArchive } from '../src/migrationTransport.js';
import { migrateAtStartup } from '../src/startupMigration.js';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('This integration check requires an isolated GitHub Actions runner.');
const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-docker-migration-'));
const supervisorName = 'hassio_supervisor';
const source = 'local_cc_tools';
let createdSupervisor = false, createdSource = false;
try {
  // Do not reuse or alter an existing container with either reserved name.
  for (const name of [supervisorName, `app_${source}`]) {
    const { stdout } = await exec('docker', ['ps', '-a', '--format', '{{.Names}}']);
    assert.ok(!stdout.split('\n').includes(name), `Container ${name} already exists`);
  }
  const original = path.join(root, 'apps/data', source);
  const dataDir = path.join(root, 'destination');
  await fs.mkdir(path.join(original, 'browser-session'), { recursive: true });
  await fs.mkdir(dataDir);
  await fs.writeFile(path.join(original, 'config.json'), JSON.stringify({ tasks: { finishPrint: { enabled: true, dailyLimit: 10 } } }));
  await fs.writeFile(path.join(original, 'runs.json'), '[]');
  await fs.writeFile(path.join(original, '.hidden'), Buffer.from([0, 1, 255]));
  await fs.chmod(path.join(original, '.hidden'), 0o640);
  await fs.symlink('/tmp/chromium-test/SingletonSocket', path.join(original, 'browser-session/SingletonSocket'));
  await fs.writeFile(path.join(original, 'options.json'), '{"timezone":"must-not-import"}');
  await fs.writeFile(path.join(dataDir, 'options.json'), '{"timezone":"UTC"}');
  await fs.writeFile(path.join(dataDir, 'existing'), 'keep');
  await exec('docker', ['run', '--rm', '-d', '--name', supervisorName, '--network', 'none',
    '--mount', `type=bind,source=${root},target=/data,readonly`, 'alpine:3.22', 'sleep', '300']);
  createdSupervisor = true;
  await exec('docker', ['run', '--rm', '-d', '--name', `app_${source}`, '--network', 'none', 'alpine:3.22', 'sleep', '300']);
  createdSource = true;
  await assert.rejects(dockerSourceArchive.assertStopped(source), /sigue activo/);
  await exec('docker', ['stop', `app_${source}`]);
  createdSource = false;
  const result = await migrateAtStartup({ dataDir,
    options: { timezone: 'UTC', migration_source: 'CC Tools Dev local', migration_confirm: true },
    // A manual stop can leave Supervisor in error even after removing the container.
    supervisor: { info: async slug => ({ slug: slug === 'self' ? '34e9898c_cc_tools' : slug, state: 'error', version: '1.0.49', watchdog: false }), disarm: async () => {} },
    sourceArchive: dockerSourceArchive, extractArchive: extractMigrationArchive
  });
  assert.equal(result.migrated, true);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'options.json'))), { timezone: 'UTC', migration_source: 'No migrar', migration_confirm: false });
  assert.equal(await fs.readFile(path.join(result.backup, 'previous/existing'), 'utf8'), 'keep');
  assert.equal((await fs.stat(path.join(dataDir, '.hidden'))).mode & 0o777, 0o640);
  assert.equal(await fs.readlink(path.join(dataDir, 'browser-session/SingletonSocket')), '/tmp/chromium-test/SingletonSocket');
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'config.json'))).migrationReview.required, true);
  assert.equal(JSON.parse(await fs.readFile(path.join(original, 'config.json'))).migrationReview, undefined);
  console.log('PASS: Docker archive transport, absent source container, full migration, permissions, links and preserved options.');
} finally {
  if (createdSource) await exec('docker', ['stop', `app_${source}`]).catch(() => {});
  if (createdSupervisor) await exec('docker', ['stop', supervisorName]).catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
}
