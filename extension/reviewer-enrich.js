(() => {
  const parseReviewerUrl = globalThis.LiveFinderUrl?.parseReviewerUrl;
  const bestReviewTarget = globalThis.LiveFinderReviewLinks?.bestReviewTarget;
  const isExcludedReviewUrl = globalThis.LiveFinderReviewLinks?.isExcludedReviewUrl;
  if (!parseReviewerUrl || !bestReviewTarget || !isExcludedReviewUrl) return;

  const parsed = parseReviewerUrl(location.href, location.origin);
  if (!parsed?.handle || /\/discover(?:\/|$)/i.test(location.pathname)) return;

  const SOURCE_IN = 'livefinder-reviewer-isolated';
  const SOURCE_OUT = 'livefinder-reviewer-main';
  const pending = new Map();
  let running = false;
  let lastTarget = '';
  let seq = 0;

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

  function probeReact() {
    const token = `reviewer-${Date.now()}-${++seq}`;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        pending.delete(token);
        resolve([]);
      }, 650);
      pending.set(token, candidates => {
        clearTimeout(timer);
        pending.delete(token);
        resolve(Array.isArray(candidates) ? candidates : []);
      });
      window.postMessage({ source: SOURCE_IN, type: 'PROBE_REVIEWER_REACT', token }, '*');
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE_OUT || message.type !== 'REVIEWER_REACT_RESULT') return;
    const done = pending.get(String(message.token || ''));
    if (done) done(message.candidates || []);
  });

  async function songUrlsToExclude() {
    const urls = [];
    const [libraryResult, pendingResult, statusResult] = await Promise.allSettled([
      chrome.runtime.sendMessage({ type: 'GET_SONG_LIBRARY' }),
      chrome.runtime.sendMessage({ type: 'GET_NERO_SUBMISSION' }),
      chrome.runtime.sendMessage({ type: 'GET_NERO_STATUS' })
    ]);
    if (libraryResult.status === 'fulfilled') {
      for (const song of libraryResult.value?.library?.songs || []) {
        if (song?.songUrl) urls.push(String(song.songUrl));
      }
    }
    if (pendingResult.status === 'fulfilled') {
      const songUrl = pendingResult.value?.record?.payload?.song?.songUrl;
      if (songUrl) urls.push(String(songUrl));
    }
    if (statusResult.status === 'fulfilled') {
      for (const value of [statusResult.value?.queue, statusResult.value?.result]) {
        if (value?.song?.songUrl) urls.push(String(value.song.songUrl));
      }
    }
    return [...new Set(urls.filter(Boolean))];
  }

  function scrubContaminatedTarget(item, excludeUrls) {
    if (!item) return false;
    const contaminated = isExcludedReviewUrl(item.streamUrl, excludeUrls) || isExcludedReviewUrl(item.reviewUrl, excludeUrls);
    if (!contaminated) return false;
    for (const key of ['streamUrl','streamPlatform','streamConfidence','streamDerived','reviewUrl','reviewPlatform','reviewConfidence']) delete item[key];
    return true;
  }

  async function enrich() {
    if (running) return;
    running = true;
    try {
      const excludeUrls = await songUrlsToExclude();
      const values = valuesFromPage();
      const reactCandidates = await probeReact();
      for (const candidate of reactCandidates) {
        values.push({ value: candidate.value, hint: candidate.hint || 'reviewer-react', label: '' });
      }

      const target = bestReviewTarget(values, { isLive: isLivePage(), excludeUrls });
      const response = await chrome.runtime.sendMessage({ type: 'GET_NERO_POOL' });
      const pool = response?.pool;
      const items = Array.isArray(pool?.items) ? pool.items : [];
      const handle = parsed.handle.toLowerCase();
      const item = items.find(candidate => String(candidate?.handle || '').toLowerCase() === handle)
        || items.find(candidate => globalThis.LiveFinderUrl?.parseReviewerUrl(candidate?.neroUrl)?.handle?.toLowerCase() === handle);
      if (!item) return;

      let changed = scrubContaminatedTarget(item, excludeUrls);
      if (target && !(item.streamUrl === target.streamUrl && item.streamConfidence === target.streamConfidence)) {
        Object.assign(item, target, {
          reviewUrl: target.streamUrl,
          reviewPlatform: target.streamPlatform,
          reviewConfidence: target.streamConfidence
        });
        changed = true;
      }

      if (!changed) {
        if (target) lastTarget = target.streamUrl;
        return;
      }

      const saved = await chrome.runtime.sendMessage({
        type: 'SAVE_NERO_POOL',
        items,
        scrapedAt: Number(pool?.scrapedAt || Date.now()),
        diagnostics: pool?.diagnostics || null
      });
      if (saved?.ok) {
        lastTarget = target?.streamUrl || '';
        if (target) console.log('[LiveFinder] learned direct review link from reviewer page', target.streamPlatform);
        else console.log('[LiveFinder] removed submitted-song URL from reviewer metadata');
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
