(() => {
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  if (!parseReviewerUrl) {
    console.error('[LiveFinder] Discover URL parser missing. Reload the extension.');
    return;
  }

  const MAIN_SOURCE = 'livefinder-discover-main';
  const ISOLATED_SOURCE = 'livefinder-discover-isolated';
  const pendingProbes = new Map();
  const routeCache = new Map();
  let probeSeq = 0;

  const norm = value => String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== MAIN_SOURCE || message.type !== 'REACT_CARD_PROBE_RESULT') return;
    const resolve = pendingProbes.get(String(message.token || ''));
    if (!resolve) return;
    pendingProbes.delete(String(message.token || ''));
    resolve(message);
  });

  function looksLikeSessionCard(el) {
    if (!el || !visible(el)) return false;
    const text = norm(el.innerText || el.textContent || '');
    if (!text || text.length < 8 || text.length > 2200) return false;
    const hasLive = /(^|\s)live($|\s)/.test(text);
    const hasSubmissions = /\b\d[\d,]*\s+submissions?\b/.test(text);
    const hasQueueLanguage = /submit|queue|review|music|song|discovery/.test(text);
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

    return [...cards].filter(card => {
      const nested = [...cards].filter(other => other !== card && card.contains(other));
      return nested.length === 0;
    });
  }

  function extractDisplayName(card) {
    const bad = /^(live|music review|review|submissions?|submit|queue)$/i;
    const candidates = [...card.querySelectorAll('h1,h2,h3,h4,h5,strong,b,[class*="name" i],[class*="title" i]')]
      .filter(visible)
      .map(el => String(el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .filter(text => text.length <= 120)
      .filter(text => !bad.test(text))
      .filter(text => !/^\d[\d,]*\s+submissions?$/i.test(text))
      .filter(text => !/^live$/i.test(text));
    if (candidates[0]) return candidates[0];

    const lines = String(card.innerText || card.textContent || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => line.length <= 120)
      .filter(line => !/^live$/i.test(line))
      .filter(line => !/^\d[\d,]*\s+submissions?$/i.test(line));
    return lines[0] || 'Nero reviewer';
  }

  function submissionCount(cardText) {
    const raw = cardText.match(/([\d,]+)\s+submissions?/i)?.[1] || '';
    const value = Number(raw.replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function cardFingerprint(card) {
    const text = norm(card.innerText || card.textContent || '');
    return `${extractDisplayName(card)}::${submissionCount(text) || ''}::${text.slice(0, 220)}`;
  }

  function routeScope(card) {
    const out = new Set([card, ...card.querySelectorAll('*')]);
    const cardRect = card.getBoundingClientRect();
    let parent = card.parentElement;
    for (let i = 0; i < 4 && parent; i += 1, parent = parent.parentElement) {
      const rect = parent.getBoundingClientRect();
      const text = norm(parent.innerText || parent.textContent || '');
      const notMuchBroader = rect.width <= Math.max(cardRect.width * 1.35, 760) && rect.height <= Math.max(cardRect.height * 1.35, 900);
      if (!notMuchBroader || text.length > 2600) break;
      out.add(parent);
    }
    return [...out];
  }

  function directRouteCandidates(card) {
    const out = [];
    const seen = new Set();
    const attrs = ['href', 'data-href', 'data-url', 'data-to', 'to', 'data-route', 'data-path'];

    const push = (raw, source, score = 0) => {
      const value = String(raw || '').trim();
      if (!value) return;
      const key = `${value}::${source}`;
      if (seen.has(key)) return;
      seen.add(key);
      const parsed = parseReviewerUrl(value, location.origin);
      if (!parsed) return;
      out.push({ value, parsed, source, score });
    };

    for (const el of routeScope(card)) {
      for (const attr of attrs) {
        const raw = attr === 'href' && el.href ? el.href : el.getAttribute?.(attr);
        if (raw) push(raw, attr, 60);
      }
    }

    const html = card.outerHTML || '';
    const absolute = html.match(/https?:\\?\/\\?\/(?:www\\?\.)?nero\\?\.fan\\?\/[^"'<>\\\s]+/gi) || [];
    for (const raw of absolute) push(raw.replace(/\\\//g, '/').replace(/\\u002F/gi, '/'), 'card-html', 20);

    return out;
  }

  function targetUrlForCandidate(raw, parsed) {
    try {
      const url = new URL(String(raw || ''), location.origin);
      if (!/(^|\.)nero\.fan$/i.test(url.hostname)) return parsed.targetUrl;
      url.hostname = 'www.nero.fan';
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      return url.toString();
    } catch {
      return parsed.targetUrl;
    }
  }

  function scoreCandidate(candidate, cardText, title) {
    const { parsed, source } = candidate;
    let score = Number(candidate.score || 0);
    if (parsed.livePath) score += 120;
    if (['href', 'data-href', 'data-url', 'data-to', 'to', 'data-route', 'data-path'].includes(source)) score += 45;
    if (source === 'react') score += 35;
    const handle = parsed.handle.toLowerCase();
    if (cardText.includes(handle)) score += 25;
    const compactTitle = norm(title).replace(/[^a-z0-9]/g, '');
    const compactHandle = handle.replace(/[^a-z0-9]/g, '');
    if (compactTitle && compactHandle && (compactTitle.includes(compactHandle) || compactHandle.includes(compactTitle))) score += 30;
    return score;
  }

  function probeReactCard(card) {
    const token = `lf-route-${Date.now()}-${++probeSeq}-${Math.random().toString(36).slice(2, 8)}`;
    const probeId = `lf-card-${probeSeq}-${Math.random().toString(36).slice(2, 8)}`;
    card.setAttribute('data-livefinder-probe-id', probeId);

    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        pendingProbes.delete(token);
        try { card.removeAttribute('data-livefinder-probe-id'); } catch {}
        resolve(result || { candidates: [], payloadCount: 0, visits: 0, error: 'probe-timeout' });
      };

      pendingProbes.set(token, finish);
      window.postMessage({ source: ISOLATED_SOURCE, type: 'PROBE_REACT_CARD', token, probeId }, '*');
      setTimeout(() => finish(null), 900);
    });
  }

  async function resolveCardRoute(card) {
    const fingerprint = cardFingerprint(card);
    if (routeCache.has(fingerprint)) return routeCache.get(fingerprint);

    const cardText = norm(card.innerText || card.textContent || '');
    const title = extractDisplayName(card);
    const candidates = directRouteCandidates(card);
    let reactMeta = { payloadCount: 0, visits: 0, candidateCount: 0 };

    if (!candidates.length) {
      const probe = await probeReactCard(card);
      reactMeta = {
        payloadCount: Number(probe?.payloadCount || 0),
        visits: Number(probe?.visits || 0),
        candidateCount: Array.isArray(probe?.candidates) ? probe.candidates.length : 0,
        error: probe?.error || ''
      };
      for (const candidate of Array.isArray(probe?.candidates) ? probe.candidates : []) {
        const parsed = parseReviewerUrl(candidate?.value, location.origin);
        if (!parsed) continue;
        candidates.push({
          value: candidate.value,
          parsed,
          source: 'react',
          score: Number(candidate.score || 0),
          hint: candidate.hint || ''
        });
      }
    }

    if (!candidates.length) {
      const unresolved = { route: null, reactMeta, title };
      routeCache.set(fingerprint, unresolved);
      return unresolved;
    }

    candidates.sort((a, b) => scoreCandidate(b, cardText, title) - scoreCandidate(a, cardText, title));
    const best = candidates[0];
    const route = {
      parsed: best.parsed,
      targetUrl: targetUrlForCandidate(best.value, best.parsed),
      source: best.source,
      hint: best.hint || '',
      reactMeta,
      title
    };
    routeCache.set(fingerprint, { route, reactMeta, title });
    return { route, reactMeta, title };
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

  async function scrape() {
    const cards = sessionCards();
    const diagnostics = {
      sessionCards: cards.length,
      resolvedCards: 0,
      unresolvedCards: 0,
      directRoutes: 0,
      reactRoutes: 0,
      reactPayloads: 0,
      reactCandidates: 0,
      unresolvedTitles: []
    };

    const resolved = await Promise.all(cards.map(async card => ({ card, result: await resolveCardRoute(card) })));
    const found = new Map();

    for (const { card, result } of resolved) {
      diagnostics.reactPayloads += Number(result?.reactMeta?.payloadCount || 0);
      diagnostics.reactCandidates += Number(result?.reactMeta?.candidateCount || 0);
      const route = result?.route;
      if (!route) {
        diagnostics.unresolvedCards += 1;
        if (diagnostics.unresolvedTitles.length < 10) diagnostics.unresolvedTitles.push(result?.title || extractDisplayName(card));
        continue;
      }

      diagnostics.resolvedCards += 1;
      if (route.source === 'react') diagnostics.reactRoutes += 1;
      else diagnostics.directRoutes += 1;

      const cardTextRaw = String(card.innerText || card.textContent || '');
      const classified = classify(cardTextRaw, route.parsed.livePath);
      const item = {
        handle: route.parsed.handle,
        displayName: result?.title || extractDisplayName(card),
        neroUrl: route.targetUrl,
        profileUrl: route.parsed.profileUrl,
        status: classified.status,
        submissionsOpen: classified.submissionsOpen,
        signals: classified.signals,
        submissionCount: submissionCount(cardTextRaw),
        routeSource: route.source
      };

      const key = `${route.parsed.handle.toLowerCase()}::${route.targetUrl.toLowerCase()}`;
      const existing = found.get(key);
      const rank = { live: 4, open: 3, closed: 2, unknown: 1 };
      if (!existing || rank[item.status] > rank[existing.status]) found.set(key, item);
    }

    const items = [...found.values()].sort((a, b) => {
      const rank = { live: 0, open: 1, unknown: 2, closed: 3 };
      return rank[a.status] - rank[b.status] || a.displayName.localeCompare(b.displayName);
    });
    return { items, diagnostics };
  }

  let lastSignature = '';
  let saves = 0;
  let lastDiagnostics = null;
  let scanInFlight = false;
  let scanQueued = false;
  let scanTimer = null;

  async function scanAndSave() {
    if (scanInFlight) {
      scanQueued = true;
      return;
    }
    scanInFlight = true;

    try {
      const { items, diagnostics } = await scrape();
      lastDiagnostics = diagnostics;
      if (!items.length) return;

      const signature = JSON.stringify(items.map(x => [x.handle, x.status, x.neroUrl, x.submissionCount]));
      if (signature === lastSignature) return;
      lastSignature = signature;

      const response = await chrome.runtime.sendMessage({ type: 'SAVE_NERO_POOL', items, scrapedAt: Date.now(), diagnostics });
      if (response?.ok && response.count > 0) {
        saves += 1;
        console.log(`[LiveFinder] Discover saved ${response.count}/${items.length} reviewers. ${JSON.stringify(diagnostics)}`);
      } else {
        console.warn(`[LiveFinder] Discover background rejected pool. ${JSON.stringify({ response, diagnostics })}`);
      }
    } catch (err) {
      console.warn(`[LiveFinder] Discover scan failed: ${String(err?.message || err)} Diagnostics: ${JSON.stringify(lastDiagnostics || {})}`);
    } finally {
      scanInFlight = false;
      if (scanQueued) {
        scanQueued = false;
        setTimeout(scanAndSave, 80);
      }
    }
  }

  function scheduleScan(delay = 120) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndSave, delay);
  }

  scheduleScan(0);
  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'data-href', 'data-url', 'data-to', 'to', 'data-route', 'data-path']
  });
  const timer = setInterval(scanAndSave, 1800);

  setTimeout(() => {
    clearInterval(timer);
    clearTimeout(scanTimer);
    observer.disconnect();
    if (!saves) {
      console.warn(`[LiveFinder] Discover could not resolve the visible session cards. Diagnostics: ${JSON.stringify(lastDiagnostics || {})} URL: ${location.href}`);
    }
  }, 45000);
})();
