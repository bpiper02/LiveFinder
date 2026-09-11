(() => {
  const WEB_SOURCE = 'livefinder-web';
  const EXT_SOURCE = 'livefinder-extension';

  function sendRuntime(message, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('Extension runtime unavailable. Reload the LiveFinder extension, then refresh this tab.'));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Extension background did not respond in time.'));
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(message, response => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }
          resolve(response);
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async function announceReady() {
    try {
      const response = await sendRuntime({ type: 'PING' });
      if (response?.ok) {
        window.postMessage({ source: EXT_SOURCE, type: 'BRIDGE_READY', version: response.version }, '*');
      }
    } catch (err) {
      console.warn('[LiveFinder] bridge not ready', err);
    }
  }

  window.addEventListener('message', async event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== WEB_SOURCE || message.type !== 'STORE_NERO_SUBMISSION') return;

    try {
      const response = await sendRuntime({ type: 'STORE_NERO_SUBMISSION', payload: message.payload });
      if (!response?.ok) throw new Error(response?.error || 'Background rejected submission');
      window.postMessage({ source: EXT_SOURCE, type: 'NERO_SUBMISSION_STORED' }, '*');
    } catch (err) {
      console.error('[LiveFinder] Could not store pending Nero submission', err);
      window.postMessage({ source: EXT_SOURCE, type: 'NERO_SUBMISSION_STORE_FAILED', error: String(err?.message || err) }, '*');
    }
  });

  announceReady();
})();
