(() => {
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  const { bestReviewTarget, isExcludedReviewUrl } = globalThis.LiveFinderReviewLinks || {};
  if (!parseReviewerUrl || !bestReviewTarget || !isExcludedReviewUrl) return;

  const SOURCE_IN = 'livefinder-discover-isolated';
  const SOURCE_OUT = 'livefinder-discover-main';
  const pendingProbes = new Map();
  let probeSeq = 0;

  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function looksLikeSessionCard(el) {
    if (!el || !visible(el)) return false;
    const text = norm(el.innerText || el.textContent || '');
    if (!text || text.length < 8 || text.length > 2200) return false;
    return ((/(^|\s)live($|\s)/.test(text) && /submit|queue|review|music|song|discovery/.test(text)) || /\b\d[\d,]*\s+submissions?\b/.test(text));
  }

  function nearestSessionCard(seed) {
    let el = seed;
    for (let i = 0; i < 9 && el; i += 1, el = el.parentElement) {
      if (looksLikeSessionCard(el)) return el;
    }
    return null;
  }

  function sessionCards() {
    const cards = new Set();
    const seeds = [...document.querySelectorAll('div,article,section,li,a,button,span')]
      .filter(visible)
      .filter(el => {
        const text = norm(el.innerText || el.textContent || '');
        return text === 'live' || /\b\d[\d,]*\s+submissions?\b/.test(text);
      });
    for (const seed of seeds) {
      const card = nearestSessionCard(seed);
      if (card) cards.add(card);
    }
    return [...cards].filter(card => ![...cards].some(other => other !== card && card.contains(other)));
  }

  function extractDisplayName(card) {
    const bad = /^(live|music review|review|submissions?|submit|queue)$/i;
    const candidates = [...card.querySelectorAll('h1,h2,h3,h4,h5,strong,b,[class*="name" i],[class*="title" i]')]
      .filter(visible)
      .map(el => String(el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .filter(text => text.length <= 120 && !bad.test(text) && !/^\d[\d,]*\s+submissions?$/i.test(text));
    if (candidates[0]) return candidates[0];
    return String(card.innerText || card.textContent || '').split(/\n+/).map(x => x.trim()).find(x => x && x.length <= 120 && !/^live$/i.test(x) && !/^\d[\d,]*\s+submissions?$/i.test(x)) || '';
  }

  function reviewerHandleFromCard(card) {
    for (const el of [card, ...card.querySelectorAll('[href],[data-href],[data-url],[data-to],[to]')]) {
      for (const attr of ['href', 'data-href', 'data-url', 'data-to', 'to']) {
        const raw = attr === 'href' && el.href ? el.href : el.getAttribute?.(attr);
        const parsed = parseReviewerUrl(raw, location.origin);
        if (parsed?.handle) return parsed.handle.toLowerCase();
      }
    }
    return '';
  }

  function isLiveCard(card) {
    const text = norm(card.innerText || card.textContent || '');
    return /(^|\s)live($|\s)|live now|currently live|watch live|on air/.test(text);
  }

  function domCandidates(card) {
    const values = [];
    for (const anchor of card.querySelectorAll('a[href]')) {
      values.push({
        value: anchor.href,
        hint: `${anchor.getAttribute('data-testid') || ''} ${anchor.className || ''} href`,
        label: `${anchor.getAttribute('aria-label') || ''} ${anchor.title || ''} ${anchor.textContent || ''}`
      });
    }
    for (const el of card.querySelectorAll('[data-href],[data-url],[data-link],[data-stream-url]')) {
      for (const attr of ['data-href', 'data-url', 'data-link', 'data-stream-url']) {
        const value = el.getAttribute(attr);
        if (value) values.push({ value, hint: attr, label: el.textContent || '' });
      }
    }
    const html = String(card.outerHTML || '');
    const urls = html.match(/https?:\\?\/\\?\/[^"'<>\s]+/gi) || [];
    for (const value of urls) values.push({ value, hint: 'serialized-card', label: '' });
    return values;
  }

  function probeReact(card) {
    const token = `review-link-${Date.now()}-${++probeSeq}`;
    const previous = card.getAttribute('data-livefinder-probe-id');
    const probeId = `review-${Date.now()}-${probeSeq}`;
    card.setAttribute('data-livefinder-probe-id', probeId);

    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        pendingProbes.delete(token);
        if (previous == null) card.removeAttribute('data-livefinder-probe-id');
        else card.setAttribute('data-livefinder-probe-id', previous);
        resolve([]);
      }, 550);

      pendingProbes.set(token, payload => {
        clearTimeout(timeout);
        pendingProbes.delete(token);
        if (previous == null) card.removeAttribute('data-livefinder-probe-id');
        else card.setAttribute('data-livefinder-probe-id', previous);
        resolve(Array.isArray(payload?.candidates) ? payload.candidates : []);
      });

      window.postMessage({ source: SOURCE_IN, type: 'PROBE_REACT_CARD', token, probeId }, '*');
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE_OUT || message.type !== 'REACT_CARD_PROBE_RESULT') return;
    const done = pendingProbes.get(String(message.token || ''));
    if (done) done(message);
  });

  async function reviewTargetForCard(card, excludeUrls) {
    const live = isLiveCard(card);
    const values = domCandidates(card);
    const reactCandidates = await probeReact(card);
    for (const candidate of reactCandidates) {
      values.push({ value: candidate.value, hint: candidate.hint || 'react', label: '' });
    }
    return bestReviewTarget(values, { isLive: live, excludeUrls });
  }

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

  function scrubContaminatedTargets(items, excludeUrls) {
    let changed = false;
    for (const item of items) {
      const contaminated = isExcludedReviewUrl(item?.streamUrl, excludeUrls) || isExcludedReviewUrl(item?.reviewUrl, excludeUrls);
      if (!contaminated) continue;
      for (const key of ['streamUrl','streamPlatform','streamConfidence','streamDerived','reviewUrl','reviewPlatform','reviewConfidence']) delete item[key];
      changed = true;
    }
    return changed;
  }

  async function enrich() {
    let response;
    try { response = await chrome.runtime.sendMessage({ type: 'GET_NERO_POOL' }); } catch { return; }
    const pool = response?.pool;
    const items = Array.isArray(pool?.items) ? pool.items : [];
    if (!items.length) return;

    const excludeUrls = await songUrlsToExclude();
    let changed = scrubContaminatedTargets(items, excludeUrls);
    const byHandle = new Map(items.map(item => [String(item.handle || '').toLowerCase(), item]));
    const byName = new Map(items.map(item => [norm(item.displayName), item]));

    for (const card of sessionCards()) {
      const target = await reviewTargetForCard(card, excludeUrls);
      if (!target) continue;
      const handle = reviewerHandleFromCard(card);
      const item = (handle && byHandle.get(handle)) || byName.get(norm(extractDisplayName(card)));
      if (!item) continue;
      if (item.streamUrl === target.streamUrl && item.streamPlatform === target.streamPlatform && item.streamConfidence === target.streamConfidence) continue;
      Object.assign(item, target, {
        reviewUrl: target.streamUrl,
        reviewPlatform: target.streamPlatform,
        reviewConfidence: target.streamConfidence
      });
      changed = true;
    }

    if (!changed) return;
    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_NERO_POOL',
        items,
        scrapedAt: Number(pool.scrapedAt || Date.now()),
        diagnostics: pool.diagnostics || null
      });
      console.log('[LiveFinder] Discover review links sanitized/enriched');
    } catch {}
  }

  let timer = null;
  function schedule(delay = 250) {
    clearTimeout(timer);
    timer = setTimeout(enrich, delay);
  }

  schedule(700);
  const observer = new MutationObserver(() => schedule());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  setInterval(enrich, 5000);
})();
