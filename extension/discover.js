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

  function nearestCard(element) {
    let el = element;
    for (let i = 0; i < 7 && el?.parentElement; i += 1) {
      const parent = el.parentElement;
      const text = norm(parent.innerText || parent.textContent);
      if (text.length >= 8 && text.length <= 1800) return parent;
      el = parent;
    }
    return element;
  }

  function extractDisplayName(card, handle) {
    if (!card?.querySelectorAll) return `@${handle}`;
    const candidates = [...card.querySelectorAll('h1,h2,h3,h4,strong,b,[class*="name" i]')]
      .filter(visible)
      .map(el => String(el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .filter(text => text.length <= 100 && !/live|submit|queue|review/i.test(text));
    return candidates[0] || `@${handle}`;
  }

  function classify(cardText, livePath) {
    const text = norm(cardText);
    const live = livePath || /\blive now\b|\bcurrently live\b|\bwatch live\b|\bon air\b/.test(text);
    const closed = /submissions? closed|queue closed|not accepting|paused/.test(text);
    const open = !closed && /submissions? open|accepting submissions?|submit now|join queue|submit a song|send (a )?song|next stream|upcoming/.test(text);
    return {
      status: live ? 'live' : open ? 'open' : closed ? 'closed' : 'unknown',
      submissionsOpen: live || open,
      signals: text.slice(0, 500)
    };
  }

  function candidateElements() {
    const seen = new Set();
    const out = [];
    const push = (el, raw, source) => {
      const value = String(raw || '').trim();
      if (!value) return;
      const key = `${source}:${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ el, raw: value, source });
    };

    const attrs = ['href', 'data-href', 'data-url', 'data-to', 'to'];
    for (const attr of attrs) {
      for (const el of document.querySelectorAll(`[${attr}]`)) {
        const raw = attr === 'href' && el.href ? el.href : el.getAttribute(attr);
        push(el, raw, attr);
      }
    }

    // React apps sometimes serialize route URLs into the page before/without
    // rendering a clickable anchor. Recover Nero URLs and creator live routes
    // from the rendered HTML as a fallback. The shared parser still rejects
    // reserved site routes such as /careers and /games.
    const html = document.documentElement?.innerHTML || '';
    const absolute = html.match(/https?:\\?\/\\?\/(?:www\\?\.)?nero\\?\.fan\\?\/[^"'<>\\\s]+/gi) || [];
    for (const raw of absolute) push(document.body, raw.replace(/\\\//g, '/').replace(/\\u002F/gi, '/'), 'html-absolute');

    const creatorRoutes = html.match(/["']\\?\/[a-z0-9._-]{2,100}\\?\/(?:live|submit|submission|review)(?:\\?\/[^"'<>\\\s]*)?/gi) || [];
    for (const raw of creatorRoutes) {
      const clean = raw.replace(/^["']/, '').replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
      push(document.body, clean, 'html-route');
    }

    return out;
  }

  function scrape() {
    const found = new Map();
    const candidates = candidateElements();
    let validCandidates = 0;
    const sourceCounts = {};

    for (const candidate of candidates) {
      const parsed = parseReviewerUrl(candidate.raw, location.origin);
      if (!parsed) continue;
      validCandidates += 1;
      sourceCounts[candidate.source] = (sourceCounts[candidate.source] || 0) + 1;

      const card = candidate.el === document.body ? document.body : nearestCard(candidate.el);
      const text = String(card?.innerText || card?.textContent || candidate.el?.innerText || '');
      const classified = classify(text, parsed.livePath);
      const existing = found.get(parsed.handle.toLowerCase());
      const rank = { live: 4, open: 3, closed: 2, unknown: 1 };
      const item = {
        handle: parsed.handle,
        displayName: candidate.el === document.body ? `@${parsed.handle}` : extractDisplayName(card, parsed.handle),
        neroUrl: parsed.targetUrl,
        profileUrl: parsed.profileUrl,
        status: classified.status,
        submissionsOpen: classified.submissionsOpen,
        signals: classified.signals
      };
      if (!existing || rank[item.status] > rank[existing.status]) found.set(parsed.handle.toLowerCase(), item);
    }

    const items = [...found.values()].sort((a, b) => {
      const rank = { live: 0, open: 1, unknown: 2, closed: 3 };
      return rank[a.status] - rank[b.status] || a.handle.localeCompare(b.handle);
    });

    return { items, diagnostics: { candidates: candidates.length, validCandidates, uniqueReviewers: items.length, sourceCounts } };
  }

  let lastSignature = '';
  let saves = 0;
  let lastDiagnostics = null;

  async function scanAndSave() {
    const { items, diagnostics } = scrape();
    lastDiagnostics = diagnostics;
    if (!items.length) return;

    const signature = JSON.stringify(items.map(x => [x.handle, x.status, x.neroUrl]));
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
      console.warn('[LiveFinder] Discover scan found no reviewer pool. Diagnostics:', lastDiagnostics, 'URL:', location.href);
    }
  }, 30000);
})();
