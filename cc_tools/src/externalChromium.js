import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const connectionDiagnostics = new WeakMap();
export const externalConnectionDiagnostics = context => connectionDiagnostics.get(context) || {};

async function probeWebdriver(endpoint) {
  const pages = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
  const target = pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
  if (!target) return null;
  return new Promise(resolve => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    let finished = false;
    const finish = value => { if (finished) return; finished = true; clearTimeout(timer); resolve(value); try { socket.close(); } catch {} };
    const timer = setTimeout(() => finish(null), 1000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'navigator.webdriver', returnByValue: true } })));
    socket.addEventListener('error', () => finish(null));
    socket.addEventListener('close', () => finish(null));
    socket.addEventListener('message', event => {
      try { const message = JSON.parse(event.data); if (message.id === 1) finish(typeof message.result?.result?.value === 'boolean' ? message.result.result.value : null); } catch { finish(null); }
    });
  });
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Own the process as well as the CDP connection: browser.close() on a CDP
// connection alone does not guarantee that an independently launched process exits.
export async function launchExternalChromium(profile, options = {}, onExit = () => {}) {
  await fs.mkdir(profile, { recursive: true });
  const port = await reservePort();
  const args = [
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-dev-shm-usage',
    `--lang=${options.locale || 'es-ES'}`, '--window-size=1366,768',
    ...(options.headless ? ['--headless=new'] : []), 'about:blank'
  ];
  const child = spawn(options.executablePath || chromium.executablePath(), args, {
    env: { ...process.env, ...options.env }, windowsHide: true, stdio: 'ignore'
  });
  let exited = false, spawnFailed = false, browser, stopPromise, webdriverBeforeConnect = null;
  const exit = new Promise(resolve => {
    child.once('error', () => { spawnFailed = true; exited = true; resolve(); });
    child.once('exit', (code, signal) => { exited = true; onExit({ code, signal, pid: child.pid }); resolve(); });
  });
  const stop = () => stopPromise ||= (async () => {
    if (!exited && browser?.isConnected()) {
      try {
        const session = await browser.newBrowserCDPSession();
        await Promise.race([session.send('Browser.close').catch(() => {}), pause(2000)]);
      } catch {}
    }
    await Promise.race([exit, pause(3000)]);
    if (!exited) child.kill('SIGTERM');
    await Promise.race([exit, pause(1500)]);
    if (!exited) child.kill('SIGKILL');
    await Promise.race([exit, pause(1500)]);
    await browser?.close().catch(() => {});
    if (!exited) throw Object.assign(new Error('Chromium no terminó dentro del plazo.'), { code: 'BROWSER_STOP_TIMEOUT' });
  })();
  try {
    const deadline = Date.now() + (options.timeout || 45000);
    const probeDeadline = Math.min(deadline, Date.now() + 5000);
    while (!exited && Date.now() < deadline) {
      try {
        webdriverBeforeConnect = await probeWebdriver(`http://127.0.0.1:${port}`);
        // The debugging endpoint may be ready before the initial tab exists.
        if (webdriverBeforeConnect === null && Date.now() < probeDeadline) { await pause(100); continue; }
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
          timeout: 1000, isLocal: true,
          artifactsDir: options.downloadsPath || path.join(profile, 'cdp-downloads')
        });
        break;
      } catch { await pause(100); }
    }
    if (!browser || exited) throw Object.assign(new Error(spawnFailed
      ? 'No se pudo iniciar Chromium externo.' : 'No se pudo conectar con Chromium externo.'), { code: 'EXTERNAL_BROWSER_START_FAILED' });
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chromium externo no creó un contexto.');
    // The default context and on-disk profile are shared by all modules.
    context.close = stop;
    connectionDiagnostics.set(context, { webdriverBeforeConnect });
    browser.once('disconnected', () => { void stop().catch(() => {}); });
    return context;
  } catch (error) {
    await stop();
    throw error;
  }
}
