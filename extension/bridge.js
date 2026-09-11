(() => {
  const SOURCE = 'livefinder-web';

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE || message.type !== 'STORE_NERO_SUBMISSION') return;

    try {
      await chrome.storage.local.set({
        pendingNeroSubmission: message.payload,
        pendingNeroSubmissionStoredAt: Date.now()
      });
      window.postMessage({ source: 'livefinder-extension', type: 'NERO_SUBMISSION_STORED' }, '*');
    } catch (err) {
      console.error('[LiveFinder] Could not store pending Nero submission', err);
      window.postMessage({ source: 'livefinder-extension', type: 'NERO_SUBMISSION_STORE_FAILED' }, '*');
    }
  });

  window.postMessage({ source: 'livefinder-extension', type: 'BRIDGE_READY' }, '*');
})();
