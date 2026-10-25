import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import vm from 'node:vm';
import { installShutdownHandlers } from '../src/shutdown.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('SIGTERM closes upgraded sockets, waits for cleanup and writes, and exits zero once', async t => {
  const server = createServer((_req, res) => res.end('ok'));
  server.on('upgrade', (_req, socket) => socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
  const events = [], processTarget = new EventEmitter(), finished = deferred(), browser = deferred();
  processTarget.exit = code => { events.push(`exit:${code}`); finished.resolve(code); };
  const shutdown = installShutdownHandlers({ server, processTarget, drainMs: 20, timeoutMs: 1000,
    stopWork: async () => { events.push('stop'); },
    closeResources: async () => { events.push('browser'); await browser.promise; },
    flushWrites: async () => { events.push('flush'); await delay(10); }, log: () => {}, errorLog: () => {},
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const socket = net.connect(server.address().port, '127.0.0.1');
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  socket.write('GET /novnc HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  await once(socket, 'data');
  processTarget.emit('SIGTERM');
  processTarget.emit('SIGTERM'); processTarget.emit('SIGINT');
  assert.equal(shutdown.isStopping(), true);
  await delay(40);
  assert.ok(!events.some(event => event.startsWith('exit:')));
  browser.resolve();
  assert.equal(await finished.promise, 0);
  assert.deepEqual(events, ['stop', 'browser', 'flush', 'exit:0']);
});

test('a browser that never closes hits the deadline, rather than hanging before installing a timer', async () => {
  const server = createServer(), processTarget = new EventEmitter(), finished = deferred(), errors = [];
  processTarget.exit = code => finished.resolve(code);
  installShutdownHandlers({ server, processTarget, timeoutMs: 30,
    stopWork: async () => {}, closeResources: () => new Promise(() => {}),
    flushWrites: async () => assert.fail('cleanup has not completed'), log: () => {}, errorLog: message => errors.push(message),
  });
  processTarget.emit('SIGTERM');
  assert.equal(await finished.promise, 1);
  assert.match(errors[0], /plazo/);
});

test('real cleanup failures still report nonzero after flushing writes', async () => {
  const processTarget = new EventEmitter(), errors = [], events = [];
  processTarget.exit = code => events.push(`exit:${code}`);
  const lifecycle = installShutdownHandlers({ server: createServer(), processTarget,
    stopWork: async () => { throw new Error('unfinished task'); }, closeResources: async () => events.push('closed'),
    flushWrites: async () => events.push('flushed'), log: () => {}, errorLog: message => errors.push(message),
  });
  await lifecycle.shutdown('SIGTERM');
  assert.deepEqual(events, ['closed', 'flushed', 'exit:1']);
  assert.match(errors[0], /unfinished task/);
});

function browserModule(chromium) {
  const source = fs.readFileSync(new URL('../src/browserManager.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ chromium, process, console, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  return context;
}

test('shutdown closes isolated browsers and refuses subsequent browser launches', async () => {
  let closes = 0;
  const entered = deferred(), work = deferred();
  const browser = { newContext: async () => ({ close: async () => {} }), close: async () => { closes++; } };
  const context = browserModule({ launch: async () => browser });
  const operation = context.withIsolatedBrowser({}, async () => { entered.resolve(); await work.promise; });
  await entered.promise;
  await context.shutdownBrowser();
  assert.equal(closes, 1);
  await assert.rejects(context.withIsolatedBrowser({}, async () => {}), { code: 'APP_STOPPING' });
  await assert.rejects(context.withAutomationBrowser({}, async () => {}), { code: 'APP_STOPPING' });
  work.resolve(); await operation;
});

test('a browser launch completing during shutdown is closed before the process exits', async () => {
  const launch = deferred(); let closes = 0, callback = false;
  const context = browserModule({ launch: () => launch.promise });
  const operation = context.withIsolatedBrowser({}, async () => { callback = true; });
  const rejected = assert.rejects(operation, { code: 'APP_STOPPING' });
  const shutdown = context.shutdownBrowser();
  launch.resolve({ close: async () => { closes++; } });
  await shutdown; await rejected;
  assert.equal(closes, 1); assert.equal(callback, false);
});

test('stopScheduler clears its timer and prevents a run already waiting in tick from starting', async () => {
  const events = [];
  const source = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ console, clearInterval: value => events.push(value) });
  vm.runInContext(source, context);
  vm.runInContext('timer = "scheduler-timer"', context);
  await context.stopScheduler();
  assert.deepEqual(events, ['scheduler-timer']);
  assert.throws(() => context.beginSchedulerRun('creality', 'schedule', 1000), { code: 'APP_STOPPING' });
  await context.tick();
});
