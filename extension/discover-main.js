(() => {
  if (globalThis.__livefinderDiscoverReactProbeInstalled) return;
  globalThis.__livefinderDiscoverReactProbeInstalled = true;

  const SOURCE_IN = 'livefinder-discover-isolated';
  const SOURCE_OUT = 'livefinder-discover-main';
  const MAX_VISITS = 1000;
  const MAX_DEPTH = 7;
  const MAX_FIBER_HOPS = 7;
  const HANDLE_KEY_RE = /(?:^|[._-])(username|user_name|handle|slug|creator_slug|creator_handle|profile_slug)$/i;
  const PLATFORM_KEY_RE = /(tiktok|youtube|twitch|kick|instagram)/i;
  const URL_KEY_RE = /(href|url|link|path|pathname|route|permalink|share|stream|broadcast)/i;
  const HANDLE_VALUE_RE = /^@?[a-z0-9._-]{2,100}$/i;
  const BARE_SOCIAL_RE = /^(?:www\.)?(?:tiktok\.com|youtube\.com|youtu\.be|twitch\.tv|kick\.com|instagram\.com)\//i;

  function post(type, payload) {
    window.postMessage({ source: SOURCE_OUT, type, ...payload }, '*');
  }

  function hopPenalty(hint) {
    const match = String(hint || '').match(/fiber\.(?:memoizedProps|pendingProps)\.(\d+)/);
    return match ? Math.min(50, Number(match[1]) * 8) : 0;
  }

  function addCandidate(out, seen, value, hint, score) {
    const raw = String(value || '').trim();
    if (!raw) return;
    const key = `${raw}::${hint}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      value: raw,
      hint: String(hint || ''),
      score: Math.max(0, Number(score || 0) - hopPenalty(hint))
    });
  }

  function collectValue(value, keyHint, out, seenCandidates, seenObjects, state, depth = 0) {
    if (state.visits >= MAX_VISITS || depth > MAX_DEPTH || value == null) return;
    state.visits += 1;

    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return;
      if (/^https?:\/\//i.test(raw) || raw.startsWith('/') || BARE_SOCIAL_RE.test(raw)) {
        addCandidate(out, seenCandidates, raw, keyHint, URL_KEY_RE.test(keyHint) ? 110 : 65);
      }
      if (PLATFORM_KEY_RE.test(keyHint) && HANDLE_VALUE_RE.test(raw)) {
        // Preserve the platform-bearing key as the hint. review-links.js uses it
        // to safely turn explicit tiktok/youtube/twitch/kick usernames into URLs.
        addCandidate(out, seenCandidates, raw, `${keyHint}:platform-handle`, 120);
      }
      if (HANDLE_KEY_RE.test(keyHint) && HANDLE_VALUE_RE.test(raw)) {
        const handle = raw.replace(/^@/, '');
        addCandidate(out, seenCandidates, `/${handle}/live`, `${keyHint}:handle-live`, 95);
        addCandidate(out, seenCandidates, `/${handle}`, `${keyHint}:handle`, 80);
      }
      return;
    }

    if (typeof value !== 'object' || value instanceof Node) return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    let entries;
    try { entries = Object.entries(value); } catch { return; }
    for (const [key, child] of entries) {
      if (state.visits >= MAX_VISITS) break;
      if (key === 'children' && depth > 2) continue;
      if (key === '_owner' || key === 'ref') continue;
      if (typeof child === 'function' || typeof child === 'symbol') continue;
      collectValue(child, `${keyHint}.${key}`, out, seenCandidates, seenObjects, state, depth + 1);
    }
  }

  function reactPayloadsForElement(element) {
    const payloads = [];
    const seenFibers = new Set();
    const nodes = [];

    let ancestor = element;
    for (let i = 0; i < 4 && ancestor; i += 1, ancestor = ancestor.parentElement) nodes.push(ancestor);
    for (const child of [...element.querySelectorAll('*')].slice(0, 40)) nodes.push(child);

    for (const node of nodes) {
      let keys = [];
      try { keys = Object.keys(node); } catch { continue; }
      for (const key of keys) {
        if (key.startsWith('__reactProps$')) {
          try { payloads.push({ value: node[key], hint: 'reactProps' }); } catch {}
        }
        if (!key.startsWith('__reactFiber$')) continue;
        let fiber;
        try { fiber = node[key]; } catch { fiber = null; }
        for (let hop = 0; fiber && hop < MAX_FIBER_HOPS; hop += 1, fiber = fiber.return) {
          if (seenFibers.has(fiber)) continue;
          seenFibers.add(fiber);
          if (fiber.memoizedProps) payloads.push({ value: fiber.memoizedProps, hint: `fiber.memoizedProps.${hop}` });
          if (fiber.pendingProps && fiber.pendingProps !== fiber.memoizedProps) payloads.push({ value: fiber.pendingProps, hint: `fiber.pendingProps.${hop}` });
        }
      }
    }
    return payloads;
  }

  function inspectCard(element) {
    const out = [];
    const seenCandidates = new Set();
    const seenObjects = new WeakSet();
    const state = { visits: 0 };
    const payloads = reactPayloadsForElement(element);

    for (const payload of payloads) {
      if (state.visits >= MAX_VISITS) break;
      collectValue(payload.value, payload.hint, out, seenCandidates, seenObjects, state, 0);
    }

    out.sort((a, b) => b.score - a.score);
    return {
      candidates: out.slice(0, 120),
      payloadCount: payloads.length,
      visits: state.visits
    };
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE_IN || message.type !== 'PROBE_REACT_CARD') return;

    const token = String(message.token || '');
    const probeId = String(message.probeId || '');
    if (!token || !probeId) return;

    let element = null;
    try {
      element = document.querySelector(`[data-livefinder-probe-id="${CSS.escape(probeId)}"]`);
    } catch {}

    if (!element) {
      post('REACT_CARD_PROBE_RESULT', { token, candidates: [], payloadCount: 0, visits: 0, error: 'card-not-found' });
      return;
    }

    try {
      const result = inspectCard(element);
      post('REACT_CARD_PROBE_RESULT', { token, ...result });
    } catch (err) {
      post('REACT_CARD_PROBE_RESULT', {
        token,
        candidates: [],
        payloadCount: 0,
        visits: 0,
        error: String(err?.message || err)
      });
    }
  });
})();
