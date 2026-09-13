(() => {
  if (globalThis.__livefinderReviewerReactProbeInstalled) return;
  globalThis.__livefinderReviewerReactProbeInstalled = true;

  const SOURCE_IN = 'livefinder-reviewer-isolated';
  const SOURCE_OUT = 'livefinder-reviewer-main';
  const MAX_VISITS = 900;
  const MAX_DEPTH = 7;
  const MAX_FIBER_HOPS = 8;
  const PLATFORM_KEY_RE = /(tiktok|youtube|twitch|kick|instagram)/i;
  const URL_KEY_RE = /(href|url|link|stream|broadcast|watch|live|social)/i;
  const HANDLE_RE = /^@?[a-z0-9._-]{2,100}$/i;

  function addCandidate(out, seen, value, hint, score) {
    const raw = String(value || '').trim();
    if (!raw) return;
    const key = `${raw}::${hint}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value: raw, hint: String(hint || ''), score: Number(score || 0) });
  }

  function collect(value, hint, out, seenCandidates, seenObjects, state, depth = 0) {
    if (value == null || depth > MAX_DEPTH || state.visits >= MAX_VISITS) return;
    state.visits += 1;

    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return;
      if (/^https?:\/\//i.test(raw) || /^(?:www\.)?(?:tiktok\.com|youtube\.com|youtu\.be|twitch\.tv|kick\.com|instagram\.com)\//i.test(raw)) {
        addCandidate(out, seenCandidates, raw, hint, URL_KEY_RE.test(hint) ? 120 : 70);
      }
      if (PLATFORM_KEY_RE.test(hint) && HANDLE_RE.test(raw)) {
        addCandidate(out, seenCandidates, raw, `${hint}:platform-handle`, 130);
      }
      return;
    }

    if (typeof value !== 'object' || value instanceof Node || seenObjects.has(value)) return;
    seenObjects.add(value);
    let entries = [];
    try { entries = Object.entries(value); } catch { return; }
    for (const [key, child] of entries) {
      if (state.visits >= MAX_VISITS) break;
      if (key === '_owner' || key === 'ref' || typeof child === 'function' || typeof child === 'symbol') continue;
      if (key === 'children' && depth > 2) continue;
      collect(child, `${hint}.${key}`, out, seenCandidates, seenObjects, state, depth + 1);
    }
  }

  function payloads() {
    const found = [];
    const seenFibers = new Set();
    const nodes = [document.body, document.documentElement, ...document.querySelectorAll('main,section,article,[role="main"],a,button')].filter(Boolean).slice(0, 120);
    for (const node of nodes) {
      let keys = [];
      try { keys = Object.keys(node); } catch { continue; }
      for (const key of keys) {
        if (key.startsWith('__reactProps$')) {
          try { found.push({ value: node[key], hint: 'reactProps' }); } catch {}
        }
        if (!key.startsWith('__reactFiber$')) continue;
        let fiber = null;
        try { fiber = node[key]; } catch {}
        for (let hop = 0; fiber && hop < MAX_FIBER_HOPS; hop += 1, fiber = fiber.return) {
          if (seenFibers.has(fiber)) continue;
          seenFibers.add(fiber);
          if (fiber.memoizedProps) found.push({ value: fiber.memoizedProps, hint: `fiber.memoizedProps.${hop}` });
          if (fiber.pendingProps && fiber.pendingProps !== fiber.memoizedProps) found.push({ value: fiber.pendingProps, hint: `fiber.pendingProps.${hop}` });
        }
      }
    }
    return found;
  }

  function inspect() {
    const out = [];
    const seenCandidates = new Set();
    const seenObjects = new WeakSet();
    const state = { visits: 0 };
    for (const payload of payloads()) {
      if (state.visits >= MAX_VISITS) break;
      collect(payload.value, payload.hint, out, seenCandidates, seenObjects, state);
    }
    out.sort((a, b) => b.score - a.score);
    return { candidates: out.slice(0, 120), visits: state.visits };
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE_IN || message.type !== 'PROBE_REVIEWER_REACT') return;
    try {
      window.postMessage({ source: SOURCE_OUT, type: 'REVIEWER_REACT_RESULT', token: message.token, ...inspect() }, '*');
    } catch (err) {
      window.postMessage({ source: SOURCE_OUT, type: 'REVIEWER_REACT_RESULT', token: message.token, candidates: [], error: String(err?.message || err) }, '*');
    }
  });
})();