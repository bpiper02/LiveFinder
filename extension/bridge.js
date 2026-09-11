(() => {
  const SOURCE = 'livefinder-web';

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE || message.type !== 'STORE_NERO_SUBMISSION') return;

    try {
      chrome.runtime.sendMessage(
        { type: 'STORE_NERO_SUBMISSION', payload: message.payload },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            console.error('[LiveFinder] Could not store pending Nero submission', runtimeError);
            window.postMessage({ source: 'livefinder-extension', type: 'NERO_SUBMISSION_STORE_FAILED' }, '*');
            return;
          }

          if (response?.ok) {
            window.postMessage({ source: 'livefinder-extension', type: 'NERO_SUBMISSION_STORED' }, '*');
          } else {
            console.error('[LiveFinder] Could not store pending Nero submission', response?.error || 'Unknown background error');
            window.postMessage({ source: 'livefinder-extension', type: 'NERO_SUBMISSION_STORE_FAILED' }, '*');
          }
        }
      );
    } catch (err) {
      console.error('[LiveFinder] Could not store pending Nero submission', err);
      window.postMessage({ source: 'livefinder-extension', type: 'NERO_SUBMISSION_STORE_FAILED' }, '*');
    }
  });

  window.postMessage({ source: 'livefinder-extension', type: 'BRIDGE_READY' }, '*');
})();
