import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`production server exits zero on ${signal}`, { timeout: 15000 }, async t => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-shutdown-'));
    const root = fileURLToPath(new URL('..', import.meta.url));
    await fs.writeFile(path.join(data, 'config.json'), JSON.stringify({ setup: { assistantCompleted: false } }));
    // Windows cannot deliver POSIX signals; exercise the same listeners via IPC.
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      'process.on("message", signal => process.emit(signal)); await import("./src/server.js");'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, CCTOOLS_DATA_DIR: data, CCTOOLS_HOST: '127.0.0.1', CCTOOLS_PORT: '0' },
    });
    let logs = '';
    const exited = once(child, 'exit');
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      assert.equal(path.dirname(data), path.resolve(os.tmpdir()));
      await fs.rm(data, { recursive: true, force: true });
    });
    for (let tries = 0; tries < 100 && !logs.includes('escuchando'); tries++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(logs, /escuchando/, logs);
    if (process.platform === 'win32') child.send(signal);
    else child.kill(signal);
    const [code, terminatedBy] = await exited;
    assert.equal(code, 0, logs);
    assert.equal(terminatedBy, null, logs);
    assert.match(logs, /Cierre completado\. Código de salida 0\./);
    JSON.parse(await fs.readFile(path.join(data, 'config.json'), 'utf8'));
  });
}
