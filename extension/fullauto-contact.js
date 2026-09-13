(() => {
  const autofill = globalThis.LiveFinderAutofill;
  const parseReviewerUrl = globalThis.LiveFinderUrl?.parseReviewerUrl;
  if (!autofill || !parseReviewerUrl) return;

  const startedAt = Date.now();
  const MAX_LIFETIME_MS = 2 * 60 * 1000;
  let stopped = false;
  let filled = false;

  function reviewerKey(value) {
    return parseReviewerUrl(value, location.origin)?.handle?.toLowerCase() || '';
  }

  function send(message, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('background timeout'));
      }, timeoutMs);
      try {
        chrome.runtime.sendMessage(message, response => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message || String(err)));
          else resolve(response);
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async function tick() {
    if (stopped || filled) return;
    if (Date.now() - startedAt > MAX_LIFETIME_MS) {
      stopped = true;
      return;
    }

    let response;
    try { response = await send({ type: 'GET_NERO_SUBMISSION' }); }
    catch { return; }
    const record = response?.record;
    const payload = record?.payload;
    if (!payload) {
      stopped = true;
      return;
    }

    const target = reviewerKey(payload.reviewer?.neroUrl);
    const current = reviewerKey(location.href);
    if (!target || !current || target !== current) return;
    const phone = String(payload.song?.phone || '').trim();
    if (!phone) {
      stopped = true;
      return;
    }

    const report = autofill.fillCanonical({ phone }, document);
    if (report.filled.length) {
      filled = true;
      console.log('[LiveFinder] full auto contact helper filled phone');
    }
  }

  const interval = setInterval(() => {
    if (stopped || filled) {
      clearInterval(interval);
      return;
    }
    tick();
  }, 450);
  tick();
})();
