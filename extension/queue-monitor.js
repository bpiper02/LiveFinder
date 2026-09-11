(() => {
  const norm = value => String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

  function reviewerKeyFromUrl(value = location.href) {
    try {
      const url = new URL(value, location.href);
      if (!/(^|\.)nero\.fan$/i.test(url.hostname)) return '';
      return decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    } catch {
      return '';
    }
  }

  function readObservation() {
    const text = String(document.body?.innerText || document.body?.textContent || '');
    const aheadMatch = text.match(/([\d,]+)\s+ahead of you/i);
    let ahead = aheadMatch ? Number(aheadMatch[1].replace(/,/g, '')) : null;

    if (ahead == null && /(?:you(?:'re| are)|your song is)\s+(?:up\s+)?next\b/i.test(text)) ahead = 0;
    if (!Number.isFinite(ahead)) return null;

    const reviewerKey = reviewerKeyFromUrl();
    if (!reviewerKey) return null;

    return {
      reviewerKey,
      url: location.href,
      ahead,
      capturedAt: Date.now(),
      source: 'nero-page'
    };
  }

  let lastSignature = '';
  let timer = null;

  async function emitIfChanged() {
    const observation = readObservation();
    if (!observation) return;
    const signature = `${observation.reviewerKey}:${observation.ahead}`;
    if (signature === lastSignature) return;
    lastSignature = signature;
    try {
      await chrome.runtime.sendMessage({ type: 'QUEUE_OBSERVATION', observation });
      console.log('[LiveFinder] queue observation', observation);
    } catch (err) {
      if (!/context invalidated|receiving end|message port/i.test(String(err?.message || err))) {
        console.warn('[LiveFinder] queue observation failed', err);
      }
    }
  }

  function scheduleEmit() {
    clearTimeout(timer);
    timer = setTimeout(emitIfChanged, 500);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SCAN_QUEUE_POSITION') return;
    sendResponse({ ok: true, observation: readObservation() });
  });

  const observer = new MutationObserver(scheduleEmit);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(emitIfChanged, 15000);
  emitIfChanged();
})();
