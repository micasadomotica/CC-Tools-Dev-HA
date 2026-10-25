// Normal stops exit successfully; cleanup errors and deadlines remain failures.
export function installShutdownHandlers({ server, stopWork, closeResources, flushWrites,
  processTarget = process, timeoutMs = 8000, drainMs = 1000, log = console.log, errorLog = console.error }) {
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  let stopping = false;
  let completion;
  function shutdown(signal) {
    if (stopping) return completion;
    stopping = true;
    log(`[shutdown] ${signal}: deteniendo tareas y cerrando conexiones y Chromium.`);
    const deadline = setTimeout(() => {
      errorLog('[shutdown] No se completó el cierre dentro del plazo; salida con error.');
      processTarget.exit(1);
    }, timeoutMs);
    let drain;
    const closeHttp = new Promise((resolve, reject) => {
      // closeAllConnections does not close upgraded noVNC/WebSocket sockets.
      const disconnect = () => { for (const socket of sockets) socket.destroy(); };
      if (!server.listening) { disconnect(); resolve(); return; }
      server.close(err => { clearTimeout(drain); err ? reject(err) : resolve(); });
      server.closeIdleConnections?.();
      drain = setTimeout(disconnect, drainMs);
    });
    completion = (async () => {
      try {
        // Invoke synchronously so stopping flags precede the first await.
        const stopped = stopWork();
        const closed = closeResources();
        const results = await Promise.allSettled([stopped, closed, closeHttp]);
        await flushWrites();
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        log('[shutdown] Cierre completado. Código de salida 0.');
        processTarget.exit(0);
      } catch (error) {
        errorLog(`[shutdown] Error durante el cierre: ${error?.message || String(error)}`);
        processTarget.exit(1);
      } finally {
        clearTimeout(deadline);
        clearTimeout(drain);
      }
    })();
    return completion;
  }
  // Keep the handlers installed: repeated signals must not interrupt cleanup.
  processTarget.on('SIGTERM', () => shutdown('SIGTERM'));
  processTarget.on('SIGINT', () => shutdown('SIGINT'));
  return { isStopping: () => stopping, shutdown };
}
