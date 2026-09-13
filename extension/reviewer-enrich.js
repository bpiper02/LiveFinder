(() => {
  const parseReviewerUrl = globalThis.LiveFinderUrl?.parseReviewerUrl;
  const bestReviewTarget = globalThis.LiveFinderReviewLinks?.bestReviewTarget;
  if (!parseReviewerUrl || !bestReviewTarget) return;

  const parsed = parseReviewerUrl(location.href, location.origin);
  if (!parsed?.handle || /\/discover(?:\/|$)/i.test(location.pathname)) return;

  let running = false;
  let lastTarget = '';

  function valuesFromPage() {
    const values = [];
    for (const anchor of document.querySelectorAll('a[href]')) {
      values.push({
        value: anchor.href,
        hint: `${anchor.getAttribute('data-testid') || ''} ${anchor.className || ''} href`,
        label: `${anchor.getAttribute('aria-label') || ''} ${anchor.title || ''} ${anchor.textContent || ''}`
      });
    }
    for (const el of document.querySelectorAll('[data-href],[data-url],[data-link],[data-stream-url]')) {
      for (const attr of ['data-href', 'data-url', 'data-link', 'data-stream-url']) {
        const value = el.getAttribute(attr);
        if (value) values.push({ value, hint: attr, label: el.textContent || '' });
      }
    }

    // Hydration/state scripts often contain the creator's external live URL even
    // when the visible UI only exposes a Nero link.
    for (const script of [...document.scripts].slice(0, 80)) {
      const text = String(script.textContent || '');
      if (!text || text.length > 1_500_000) continue;
      const urls = text.match(/https?:\\?\/\\?\/[^"'<>\s]+/gi) || [];
      for (const value of urls.slice(0, 100)) values.push({ value, hint: 'page-state-script', label: '' });
      const platformPairs = text.match(/(?:tiktok|youtube|twitch|kick|instagram)[^"'\n]{0,50}["']?\s*[:=]\s*["']?@?[a-z0-9._-]{2,100}/gi) || [];
      for (const pair of platformPairs.slice(0, 50)) {
        const match = pair.match(/(tiktok|youtube|twitch|kick|instagram).*?@?([a-z0-9._-]{2,100})$/i);
        if (match) values.push({ value: match[2], hint: `${match[1]} platform handle`, label: '' });
      }
    }
    return values;
  }

  function isLivePage() {
    if (/\/live\/?$/i.test(location.pathname)) return true;
    const text = String(document.body?.innerText || '').toLowerCase();
    return /\blive now\b|\bcurrently live\b|\bwatch live\b|\bon air\b/.test(text);
  }

  async function enrich() {
    if (running) return;
    running = true;
    try {
      const target = bestReviewTarget(valuesFromPage(), { isLive: isLivePage() });
      if (!target || target.streamUrl === lastTarget) return;

      const response = await chrome.runtime.sendMessage({ type: 'GET_NERO_POOL' });
      const pool = response?.pool;
      const items = Array.isArray(pool?.items) ? pool.items : [];
      const handle = parsed.handle.toLowerCase();
      const item = items.find(candidate => String(candidate?.handle || '').toLowerCase() === handle)
        || items.find(candidate => globalThis.LiveFinderUrl?.parseReviewerUrl(candidate?.neroUrl)?.handle?.toLowerCase() === handle);
      if (!item) return;

      if (item.streamUrl === target.streamUrl && item.streamConfidence === target.streamConfidence) {
        lastTarget = target.streamUrl;
        return;
      }

      Object.assign(item, target, {
        reviewUrl: target.streamUrl,
        reviewPlatform: target.streamPlatform,
        reviewConfidence: target.streamConfidence
      });
      const saved = await chrome.runtime.sendMessage({
        type: 'SAVE_NERO_POOL',
        items,
        scrapedAt: Number(pool?.scrapedAt || Date.now()),
        diagnostics: pool?.diagnostics || null
      });
      if (saved?.ok) {
        lastTarget = target.streamUrl;
        console.log('[LiveFinder] learned direct review link from reviewer page', target.streamPlatform);
      }
    } catch {}
    finally { running = false; }
  }

  let timer = null;
  const schedule = (delay = 500) => {
    clearTimeout(timer);
    timer = setTimeout(enrich, delay);
  };

  schedule(800);
  const observer = new MutationObserver(() => schedule());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  setInterval(enrich, 8000);
})();
