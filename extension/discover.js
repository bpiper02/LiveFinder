(() => {
  const RESERVED = new Set([
    'discover','learn','docs','home','login','signup','terms','privacy','support','pricing','about','create',
    'careers','career','jobs','games','game','partner-program','partners','partner','company','product','products',
    'features','feature','faq','contact','blog','press','legal','cookies','settings','account','profile','dashboard',
    'creators','artists','teams','business','enterprise','community','help','download','app','api','status'
  ]);
  const SUFFIXES = new Set(['live','submit','submission','review']);
  const NON_CREATOR_WORDS = /\b(company|careers?|jobs?|product|games?|partner program|partners?|pricing|privacy|terms|support|docs?|learn|about|contact|features?|faq|blog|press|legal|cookies?)\b/i;

  const norm = value => String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  function parseReviewerHref(href) {
    try {
      const url = new URL(href, location.origin);
      if (!/(^|\.)nero\.fan$/i.test(url.hostname)) return null;

      const parts = url.pathname.split('/').filter(Boolean).map(p => decodeURIComponent(p));
      if (!parts.length) return null;

      const first = parts[0].toLowerCase();
      if (RESERVED.has(first)) return null;
      if (!/^[a-z0-9._-]{2,80}$/i.test(parts[0])) return null;

      // Creator/session URLs are either /handle or /handle/<known session suffix>.
      // Reject deeper generic site routes so nav/footer links never enter the pool.
      if (parts.length > 2) return null;
      if (parts.length === 2 && !SUFFIXES.has(parts[1].toLowerCase())) return null;

      const handle = parts[0];
      const livePath = parts[1]?.toLowerCase() === 'live';
      return {
        handle,
        profileUrl: `https://www.nero.fan/${encodeURIComponent(handle)}`,
        targetUrl: livePath ? `https://www.nero.fan/${encodeURIComponent(handle)}/live` : `https://www.nero.fan/${encodeURIComponent(handle)}`,
        livePath
      };
    } catch {
      return null;
    }
  }

  function nearestCard(anchor) {
    let el = anchor;
    for (let i = 0; i < 6 && el?.parentElement; i += 1) {
      const parent = el.parentElement;
      const text = norm(parent.innerText || parent.textContent);
      const links = parent.querySelectorAll?.('a[href]').length || 0;
      if (text.length >= 10 && text.length <= 1400 && links <= 12) return parent;
      el = parent;
    }
    return anchor;
  }

  function cardLooksLikeCreator(card, handle) {
    const text = String(card.innerText || card.textContent || '').trim();
    if (!text) return false;
    if (NON_CREATOR_WORDS.test(text) && !/\blive\b|submit|queue|review|song|music/i.test(text)) return false;

    const hrefs = [...card.querySelectorAll('a[href]')].map(a => a.getAttribute('href') || '');
    const hasOwnLink = hrefs.some(href => {
      try {
        const u = new URL(href, location.origin);
        const p = u.pathname.split('/').filter(Boolean).map(x => decodeURIComponent(x));
        return p[0]?.toLowerCase() === handle.toLowerCase();
      } catch {
        return false;
      }
    });

    return hasOwnLink;
  }

  function extractDisplayName(card, handle) {
    const candidates = [...card.querySelectorAll('h1,h2,h3,h4,strong,b,[class*="name" i]')]
      .filter(visible)
      .map(el => String(el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .filter(text => text.length <= 100 && !/live|submit|queue|review/i.test(text) && !NON_CREATOR_WORDS.test(text));
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

  function scrape() {
    const found = new Map();
    for (const anchor of [...document.querySelectorAll('a[href]')].filter(visible)) {
      const parsed = parseReviewerHref(anchor.href);
      if (!parsed) continue;

      const card = nearestCard(anchor);
      if (!cardLooksLikeCreator(card, parsed.handle)) continue;

      const text = String(card.innerText || card.textContent || '');
      const classified = classify(text, parsed.livePath);
      const existing = found.get(parsed.handle.toLowerCase());
      const rank = { live: 4, open: 3, closed: 2, unknown: 1 };
      const item = {
        handle: parsed.handle,
        displayName: extractDisplayName(card, parsed.handle),
        neroUrl: parsed.targetUrl,
        profileUrl: parsed.profileUrl,
        status: classified.status,
        submissionsOpen: classified.submissionsOpen,
        signals: classified.signals
      };
      if (!existing || rank[item.status] > rank[existing.status]) found.set(parsed.handle.toLowerCase(), item);
    }

    return [...found.values()].sort((a, b) => {
      const rank = { live: 0, open: 1, unknown: 2, closed: 3 };
      return rank[a.status] - rank[b.status] || a.handle.localeCompare(b.handle);
    });
  }

  let lastSignature = '';
  let saves = 0;
  async function scanAndSave() {
    const items = scrape();
    const signature = JSON.stringify(items.map(x => [x.handle, x.status, x.neroUrl]));
    if (signature === lastSignature) return;
    lastSignature = signature;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SAVE_NERO_POOL', items, scrapedAt: Date.now() });
      if (response?.ok) {
        saves += 1;
        console.log(`[LiveFinder] Discover scan saved ${items.length} reviewers`);
      }
    } catch (err) {
      console.warn('[LiveFinder] Discover scan failed', err);
    }
  }

  scanAndSave();
  const observer = new MutationObserver(() => scanAndSave());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(scanAndSave, 1500);
  setTimeout(() => {
    clearInterval(timer);
    observer.disconnect();
    if (!saves) console.warn('[LiveFinder] Discover scan produced no pool update.');
  }, 15000);
})();
