chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'STORE_NERO_SUBMISSION') return;

  chrome.storage.local.set({
    pendingNeroSubmission: message.payload,
    pendingNeroSubmissionStoredAt: Date.now()
  }).then(() => {
    sendResponse({ ok: true });
  }).catch((err) => {
    console.error('[LiveFinder] background storage failed', err);
    sendResponse({ ok: false, error: String(err?.message || err) });
  });

  return true;
});
