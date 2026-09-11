(() => {
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  if (!parseReviewerUrl) {
    console.error('[LiveFinder] Discover URL parser missing. Reload the extension.');
    return;
  }

  const norm = value => String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  function looksLikeSessionCard(el) {
    if (!el) return false;
    const text = norm(el.innerText || el.textContent || '');
    if (!text || text.length < 8 || text.length > 2200) return false;
    const hasLive = /(^|\s)live($|\s)/.test(text);
    const hasSubmissions = /\b\d[\d,]*\s+submissions?\b/.test(text);
    const hasQueueLanguage = /submit|queue|review|music|song/.test(text);
    return (hasLive && hasQueueLanguage) || hasSubmissions;
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
    const seeds = [...document.querySelectorAll('div,article,section,li,a,button')]
      .filter(visible)
      .filter(el => {
        const text = norm(el.innerText || el.textContent || '');
        return /(^|\s)live($|\s)/.test(text) || /\b\d[\d,]*\s+submissions?\b/.test(text);
      });

    for (const seed of seeds) {
      const card = nearestSessionCard(seed);
      if (card) cards.add(card);
    }

    // Remove broad containers that merely wrap several real cards.
    return [...cards].filter(card => {
      const nested = [...cards].filter(other => other !== card && card.contains(other));
      return nested.length === 0;
    });
  }

  function routeCandidates(card) {
    const out = [];
    const seen = new Set();
    const push = (raw, source, el = card) => {
      const value = String(raw || '').trim();
      if (!value) return;
      const key = `${source}:${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      const parsed = parseReviewerUrl(value, location.origin);
      if (!parsed) return;
      out.push({ parsed, source, el });
    };

    const attrs = ['href', 'data-href', 'data-url', 'data-to', 'to'];
    const scoped = [card, ...card.querySelectorAll('*')];
    for (const el of scoped) {
      for (const attr of attrs) {
        const raw = attr === 'href' && el.href ? el.href : el.getAttribute?.(attr);
        if (raw) push(raw, attr, el);
      }
    }

    // Some React components keep the navigation target only in serialized props.
    // Restrict fallback parsing to THIS session card, never the whole document.
    const html = card.outerHTML || '';
    const absolute = html.match(/https?:\\?\/\\?\/(?:www\\?\.)?nero\\?\.fan\\?\/[^"'<>\\\s]+/gi) || [];
    for (const raw of absolute) push(raw.replace(/\\\//g, '/').replace(/\\u002F/gi, '/'), 'card-html-absolute');

    const relative = html.match(/(?:href|to|url|pathname)[^"']{0,30}["'](\\?\/[a-z0-9@._-]{2,100}(?:\\?\/[^"'<>\\\s]*)?)["']/gi) || [];
    for (const match of relative) {
      const path = match.match(/["'](\\?\/[^"']+)["']/)?.[1];
      if (path) push(path.replace(/\\\//g, '/').replace(/\\u002F/gi, '/'), 'card-html-route');
    }

    return out;
  }

  function scoreCandidate(candidate, cardText) {
    const { parsed, source } = candidate;
    let score = 0;
    if (parsed.livePath) score += 100;
    if (['href','data-href','data-url','data-to','to'].includes(source)) score += 30;
    if (source.startsWith('card-html')) score += 10;
    if (cardText.includes(parsed.handle.toLowerCase())) score += 15;
    return score;
  }

  function extractDisplayName(card, handle) {
    const bad = /^(live|music review|review|submissions?)$/i;
    const candidates = [...card.querySelectorAll('h1,h2,h3,h4,h5,strong,b,[class*="name" i],[class*="title" i]')]
      .filter(visible)
      .map(el => String(el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .filter(text => text.length <= 120 && !bad.test(text) && !/^\d[\d,]*\s+submissions?$/i.test(text));
    return candidates[0] || `@${handle}`;
  }

  function classify(cardText, livePath) {
    const text = norm(cardText);
    const live = livePath || /(^|\s)live($|\s)|live now|currently live|watch live|on air/.test(text);
    const closed = /submissions? closed|queue closed|not accepting|paused/.test(text);
    const open = !closed && (/submissions? open|accepting submissions?|submit now|join queue|submit a song|send (a )?song|next stream|upcoming/.test(text) || /\b\d[\d,]*\s+submissions?\b/.test(text));
    return {
      status: live ? 'live' : open ? 'open' : closed ? 'closed' : 'unknown',
      submissionsOpen: live || open,
      signals: text.slice(0, 500)
    };
  }

  function scrape() {
    const cards = sessionCards();
    const found = new Map();
    let unresolvedCards = 0;
    const diagnostics = { sessionCards: cards.length, resolvedCards: 0, unresolvedCards: 0, candidateRoutes: 0 };

    for (const card of cards) {
      const cardTextRaw = String(card.innerText || card.textContent || '');
      const cardText = norm(cardTextRaw);
      const candidates = routeCandidates(card);
      diagnostics.candidateRoutes += candidates.length;
      if (!candidates.length) {
        unresolvedCards += 1;
        continue;
      }

      candidates.sort((a, b) => scoreCandidate(b, cardText) - scoreCandidate(a, cardText));
      const parsed = candidates[0].parsed;
      const classified = classify(cardTextRaw, parsed.livePath);
      const item = {
        handle: parsed.handle,
        displayName: extractDisplayName(card, parsed.handle),
        neroUrl: parsed.targetUrl,
        profileUrl: parsed.profileUrl,
        status: classified.status,
        submissionsOpen: classified.submissionsOpen,
        signals: classified.signals,
        submissionCount: Number((cardTextRaw.match(/([\d,]+)\s+submissions?/i)?.[1] || '').replace(/,/g, '')) || null
      };

      const key = parsed.handle.toLowerCase();
      const existing = found.get(key);
      const rank = { live: 4, open: 3, closed: 2, unknown: 1 };
      if (!existing || rank[item.status] > rank[existing.status]) found.set(key, item);
      diagnostics.resolvedCards += 1;
    }

    diagnostics.unresolvedCards = unresolvedCards;
    const items = [...found.values()].sort((a, b) => {
      const rank = { live: 0, open: 1, unknown: 2, closed: 3 };
      return rank[a.status] - rank[b.status] || a.handle.localeCompare(b.handle);
    });
    return { items, diagnostics };
  }

  let lastSignature = '';
  let saves = 0;
  let lastDiagnostics = null;

  async function scanAndSave() {
    const { items, diagnostics } = scrape();
    lastDiagnostics = diagnostics;
    if (!items.length) return;

    const signature = JSON.stringify(items.map(x => [x.handle, x.status, x.neroUrl, x.submissionCount]));
    if (signature === lastSignature) return;
    lastSignature = signature;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SAVE_NERO_POOL', items, scrapedAt: Date.now(), diagnostics });
      if (response?.ok && response.count > 0) {
        saves += 1;
        console.log(`[LiveFinder] Discover saved ${response.count}/${items.length} reviewers`, diagnostics);
      } else {
        console.warn('[LiveFinder] Discover background rejected pool', response, diagnostics);
      }
    } catch (err) {
      console.warn('[LiveFinder] Discover scan failed', err, diagnostics);
    }
  }

  scanAndSave();
  const observer = new MutationObserver(() => scanAndSave());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'data-href', 'data-url', 'data-to', 'to'] });
  const timer = setInterval(scanAndSave, 1000);

  setTimeout(() => {
    clearInterval(timer);
    observer.disconnect();
    if (!saves) {
      console.warn('[LiveFinder] Discover found session cards but could not resolve reviewer routes. Diagnostics:', lastDiagnostics, 'URL:', location.href);
    }
  }, 30000);
})();
