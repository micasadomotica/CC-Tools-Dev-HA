import { sameNavigationTarget } from './crealityNavigation.js';

// Listen before navigation, but start the response deadline only when the caller
// has finished navigation (including any manual security verification).
export function captureCommentFeed(page, target) {
  const requests = new WeakSet();
  let response = null;
  let stopped = false;
  let finishRead = null;
  let timer = null;

  const onRequest = (request) => {
    if (!/\/api\/cxy\/comment\/modelFeedList(?:\?|$)/.test(request.url())
      || request.method() !== 'POST') return;
    try {
      if (request.frame() === page.mainFrame() && sameNavigationTarget(request.frame().url(), target)) {
        requests.add(request);
      }
    } catch { /* Requests without a document cannot identify this model. */ }
  };
  const onResponse = (value) => {
    if (response || !requests.has(value.request())) return;
    response = value;
    finishRead?.(response);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('close', stop);
    finishRead?.(null);
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('close', stop);

  return {
    async read({ timeoutMs = 15000 } = {}) {
      if (stopped) return null;
      if (response) return response;
      try {
        return await new Promise(resolve => {
          finishRead = resolve;
          timer = setTimeout(() => resolve(null), timeoutMs);
        });
      } finally {
        clearTimeout(timer);
        finishRead = null;
      }
    },
    stop
  };
}
