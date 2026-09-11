(() => {
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  if (!parseReviewerUrl) return;

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

  function platformFor(url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok';
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'YouTube';
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return 'Twitch';
    if (host === 'kick.com' || host.endsWith('.kick.com')) return 'Kick';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram';
    return '';
  }

  function normalizeStream(raw, isLive) {
    let url;
    try { url = new URL(String(raw || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/')); } catch { return null; }
    const platform = platformFor(url);
    if (!platform) return null;
    url.hash = '';

    const lowerPath = url.pathname.toLowerCase();
    let score = 20;
    let derived = false;
    let confidence = 'social';

    if (/\/live(?:\/|$)/.test(lowerPath) || (platform === 'YouTube' && /\/watch(?:\/|$)/.test(lowerPath))) {
      score = 140;
      confidence = 'direct';
    } else if (platform === 'Twitch' || platform === 'Kick') {
      score = isLive ? 120 : 80;
      confidence = isLive ? 'direct' : 'social';
    } else if (isLive && platform === 'TikTok' && /^\/@[^/]+\/?$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/live`;
      score = 125;
      derived = true;
      confidence = 'derived-live';
    } else if (isLive && platform === 'YouTube' && (/^\/@[^/]+\/?$/i.test(url.pathname) || /^\/channel\/[^/]+\/?$/i.test(url.pathname))) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/live`;
      score = 115;
      derived = true;
      confidence = 'derived-live';
    } else if (platform === 'TikTok' || platform === 'YouTube') {
      score = 70;
    } else if (platform === 'Instagram') {
      score = 35;
    }

    return { streamUrl: url.toString(), streamPlatform: platform, streamConfidence: confidence, streamDerived: derived, score };
  }

  function streamForCard(card) {
    const text = norm(card.innerText || card.textContent || '');
    const isLive = /(^|\s)live($|\s)|live now|currently live|watch live|on air/.test(text);
    const candidates = [];

    for (const anchor of card.querySelectorAll('a[href]')) {
      const candidate = normalizeStream(anchor.href, isLive);
      if (!candidate) continue;
      const label = norm(`${anchor.getAttribute('aria-label') || ''} ${anchor.title || ''} ${anchor.textContent || ''}`);
      if (label.includes(candidate.streamPlatform.toLowerCase())) candidate.score += 15;
      candidates.push(candidate);
    }

    const html = String(card.outerHTML || '');
    const urls = html.match(/https?:\\?\/\\?\/[^"'<>\s]+/gi) || [];
    for (const raw of urls) {
      const candidate = normalizeStream(raw, isLive);
      if (candidate) candidates.push(candidate);
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
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

  async function enrich() {
    let response;
    try { response = await chrome.runtime.sendMessage({ type: 'GET_NERO_POOL' }); } catch { return; }
    const pool = response?.pool;
    const items = Array.isArray(pool?.items) ? pool.items : [];
    if (!items.length) return;

    let changed = false;
    const byHandle = new Map(items.map(item => [String(item.handle || '').toLowerCase(), item]));
    const byName = new Map(items.map(item => [norm(item.displayName), item]));

    for (const card of sessionCards()) {
      const stream = streamForCard(card);
      if (!stream) continue;
      const handle = reviewerHandleFromCard(card);
      const item = (handle && byHandle.get(handle)) || byName.get(norm(extractDisplayName(card)));
      if (!item) continue;
      if (item.streamUrl === stream.streamUrl && item.streamPlatform === stream.streamPlatform) continue;
      Object.assign(item, stream);
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
      console.log('[LiveFinder] Discover stream links enriched');
    } catch {}
  }

  let timer = null;
  function schedule(delay = 250) {
    clearTimeout(timer);
    timer = setTimeout(enrich, delay);
  }

  schedule(800);
  const observer = new MutationObserver(() => schedule());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  setInterval(enrich, 4000);
})();
