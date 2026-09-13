(() => {
  const autofill = globalThis.LiveFinderAutofill;
  const providers = globalThis.LiveFinderProviders;
  const guard = globalThis.LiveFinderPaymentGuard;
  if (!autofill || !providers || !guard) return;

  const RUN_KEY = 'livefinder-auxchord-run';
  const MAX_RUN_AGE = 10 * 60 * 1000;
  const POLL_MS = 450;
  let busy = false;
  let finished = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => guard.norm(value);
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function runtime(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve(response);
        });
      } catch (err) { reject(err); }
    });
  }

  function buttons() {
    return [...document.querySelectorAll('button, [role="button"], a')].filter(visible);
  }

  function findAction(predicate) {
    return buttons().find(el => predicate(norm(el.innerText || el.textContent || el.getAttribute?.('aria-label') || ''), el)) || null;
  }

  function click(el) {
    if (!el || !visible(el)) return false;
    el.click();
    return true;
  }

  function pageText() {
    return norm(document.body?.innerText || document.body?.textContent || '');
  }

  function context() {
    return providers.contextForUrl(location.href);
  }

  function currentRunMatches(payload) {
    if (!payload || payload.source !== 'livefinder' || payload.provider !== 'auxchord') return false;
    const stored = sessionStorage.getItem(RUN_KEY);
    if (stored && stored === payload.runId) return true;
    const target = String(payload?.reviewer?.reviewerUrl || payload?.reviewer?.neroUrl || '');
    if (!target) return false;
    try {
      const a = new URL(target);
      const b = new URL(location.href);
      if (a.hostname !== b.hostname) return false;
      if (a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '')) {
        sessionStorage.setItem(RUN_KEY, payload.runId || 'active');
        return true;
      }
    } catch {}
    return false;
  }

  async function pending() {
    const response = await runtime({ type: 'GET_NERO_SUBMISSION' });
    const record = response?.record;
    if (!record?.payload || Date.now() - Number(record.storedAt || 0) > MAX_RUN_AGE) return null;
    if (!currentRunMatches(record.payload)) return null;
    return record.payload;
  }

  async function saveResult(payload, status, extra = {}) {
    const value = {
      runId: payload?.runId || '',
      status,
      provider: 'auxchord',
      reviewer: payload?.reviewer || null,
      song: payload?.song || null,
      completedAt: Date.now(),
      ...extra
    };
    await runtime({ type: 'SAVE_NERO_RESULT', value }).catch(() => {});
    return value;
  }

  async function stop(payload, status, reason) {
    finished = true;
    await saveResult(payload, status, { reason });
    await runtime({ type: 'CLEAR_NERO_SUBMISSION' }).catch(() => {});
    sessionStorage.removeItem(RUN_KEY);
    console.info('[LiveFinder AuxChord]', status, reason || '');
  }

  function blockedFreeReason(text) {
    if (/session is set to skips only|skip is required to submit/.test(text)) return 'This AuxChord session is skips-only.';
    if (/used your free submissions for this session/.test(text)) return 'Your free submissions for this AuxChord session are already used.';
    if (/no active live review session|not live right now/.test(text)) return 'This AuxChord reviewer is not accepting a live submission right now.';
    return '';
  }

  function chooseLinkMode() {
    const action = findAction(label => label === 'paste a link' || label.startsWith('paste a link '));
    return action ? click(action) : false;
  }

  function chooseAuthorship(authorship) {
    const wanted = norm(authorship);
    if (!wanted) return false;
    const aliases = {
      'human-generated': ['human generated', 'human-generated'],
      'ai-assisted': ['ai-assisted', 'ai assisted'],
      'hybrid': ['human + ai hybrid', 'human ai hybrid', 'hybrid'],
      'fully-ai': ['fully ai-generated', 'fully ai generated', 'ai fully ai-generated']
    };
    const terms = aliases[wanted] || [wanted];
    const action = findAction(label => terms.some(term => label === term || label.startsWith(`${term} `)));
    if (action) return click(action);

    const labels = [...document.querySelectorAll('label')].filter(visible);
    const label = labels.find(el => terms.some(term => norm(el.innerText || el.textContent).includes(term)));
    if (label) return click(label);
    return false;
  }

  function checkTerms() {
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')].filter(visible);
    for (const box of boxes) {
      const label = box.closest('label') || (box.id ? document.querySelector(`label[for="${CSS.escape(box.id)}"]`) : null);
      const text = norm(label?.innerText || label?.textContent || box.parentElement?.innerText || '');
      if (/terms|rights to this track|own or have the rights/.test(text)) {
        if (!box.checked) box.click();
        return true;
      }
    }
    return false;
  }

  function queueAhead(text) {
    const match = text.match(/(\d+)\s+(?:people?\s+)?ahead/);
    return match ? Number(match[1]) : null;
  }

  async function tick() {
    if (busy || finished) return;
    busy = true;
    try {
      const payload = await pending();
      if (!payload) return;
      const text = pageText();
      const blocked = blockedFreeReason(text);
      if (blocked) {
        await stop(payload, 'free unavailable', blocked);
        return;
      }

      // Numeric creator landing pages expose a neutral "Submit for Live" route.
      const submitForLive = findAction(label => label === 'submit for live');
      if (submitForLive) {
        click(submitForLive);
        await sleep(500);
        return;
      }

      if (/how are you adding your song/.test(text)) {
        chooseLinkMode();
        await sleep(250);
      }

      const report = autofill.fillCanonical({
        songUrl: payload.song?.songUrl,
        title: payload.song?.title,
        artist: payload.song?.artist,
        email: payload.song?.email,
        phone: payload.song?.phone,
        instagram: payload.song?.instagram,
        note: payload.song?.note
      }, document);

      if (/how was this made/.test(text)) chooseAuthorship(payload.authorship);

      if (/skip the line/.test(text)) {
        const free = findAction(label => label === 'wait in the free queue');
        if (free) {
          click(free);
          await sleep(300);
          return;
        }
      }

      if (/ready to send/.test(text)) {
        checkTerms();
        const join = findAction(label => label === 'join the free queue');
        if (join) {
          click(join);
          await sleep(600);
          return;
        }
      }

      const after = pageText();
      if (/regular submissions/.test(after) && (/now playing|queue/.test(after))) {
        const ahead = queueAhead(after);
        await saveResult(payload, 'submitted', { ahead });
        if (Number.isFinite(ahead)) {
          await runtime({ type: 'SAVE_NERO_QUEUE', value: {
            runId: payload.runId || '', provider: 'auxchord', reviewer: payload.reviewer, song: payload.song,
            ahead, capturedAt: Date.now()
          }}).catch(() => {});
        }
        await runtime({ type: 'CLEAR_NERO_SUBMISSION' }).catch(() => {});
        sessionStorage.removeItem(RUN_KEY);
        finished = true;
        return;
      }

      // Advance only through neutral Continue/Next actions. Never press anything
      // with skip/price/pay language; the explicit free actions above own those steps.
      const next = findAction(label => (label === 'continue' || label === 'next' || label === 'next →') && !guard.isPaidActionLabel(label));
      if (next && report.filled.length) {
        click(next);
        await sleep(300);
      }
    } catch (err) {
      console.info('[LiveFinder AuxChord] waiting:', String(err?.message || err));
    } finally {
      busy = false;
    }
  }

  tick();
  const observer = new MutationObserver(tick);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(tick, POLL_MS);
})();
