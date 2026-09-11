(() => {
  const STORAGE_KEYS = ['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt'];
  const MAX_AGE_MS = 10 * 60 * 1000;
  let payload = null;
  let lastAction = '';
  let lastActionAt = 0;
  let queueAhead = null;
  let finished = false;
  let lastState = '';

  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function showBadge(message, kind = 'info') {
    let badge = document.getElementById('livefinder-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'livefinder-badge';
      Object.assign(badge.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
        background: '#111', color: '#fff', padding: '10px 14px', borderRadius: '10px',
        font: '13px/1.35 system-ui, sans-serif', boxShadow: '0 6px 24px rgba(0,0,0,.25)',
        maxWidth: '380px', border: '1px solid rgba(255,255,255,.16)'
      });
      document.documentElement.appendChild(badge);
    }
    badge.textContent = message;
    badge.style.background = kind === 'error' ? '#5b1717' : kind === 'success' ? '#153d27' : '#111';
  }

  function activeModal() {
    const candidates = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog')].filter(visible);
    if (candidates.length) {
      return candidates.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];
    }

    // Nero may not expose dialog semantics. Find the largest visible fixed/absolute panel
    // containing the workflow's distinctive text.
    const workflowTerms = ['choose a method below', 'artist name', 'song title', 'ahead of you', 'submit a link'];
    const fallback = [...document.querySelectorAll('div, section, form')]
      .filter(visible)
      .filter(el => {
        const text = norm(el.innerText);
        return text.length < 2500 && workflowTerms.some(term => text.includes(term));
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });

    return fallback[0] || document.body;
  }

  function rootText(root = activeModal()) {
    return norm(root?.innerText || root?.textContent || '');
  }

  function textFor(el, root = activeModal()) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute?.('aria-label'), el.getAttribute?.('autocomplete')];
    if (el.id) {
      const label = root.querySelector?.(`label[for="${CSS.escape(el.id)}"]`) || document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && visible(label)) parts.push(label.textContent);
    }
    const wrappingLabel = el.closest?.('label');
    if (wrappingLabel && visible(wrappingLabel)) parts.push(wrappingLabel.textContent);
    const parentText = el.parentElement?.innerText;
    if (parentText && parentText.length < 220) parts.push(parentText);
    return norm(parts.filter(Boolean).join(' '));
  }

  function setNativeValue(el, value) {
    if (!el || value == null) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function bestField(hints, root = activeModal()) {
    const candidates = [...root.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea')]
      .filter(el => visible(el) && !el.disabled);
    return candidates.map(el => {
      const haystack = textFor(el, root);
      const score = hints.reduce((sum, hint) => sum + (haystack.includes(hint) ? hint.length : 0), 0);
      return { el, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function guardedClick(el, action) {
    const now = Date.now();
    if (!el || !visible(el) || el.disabled) return false;
    if (lastAction === action && now - lastActionAt < 1200) return false;
    lastAction = action;
    lastActionAt = now;
    el.scrollIntoView?.({ block: 'center', inline: 'center' });
    el.click();
    console.log('[LiveFinder] action:', action);
    return true;
  }

  function findClickableByText(text, root = activeModal()) {
    const wanted = norm(text);
    return [...root.querySelectorAll('button, a, [role="button"], div')]
      .filter(visible)
      .find(el => norm(el.innerText || el.textContent) === wanted) || null;
  }

  function detectState() {
    const root = activeModal();
    const text = rootText(root);

    // Most specific/later states first in case Nero keeps old step markup mounted.
    if (/submission received|successfully submitted|added to (the )?queue|you('|’)re in|you are in the queue/.test(text)) return { state: 'COMPLETE', root };
    if (/ahead of you/.test(text) && /skip/.test(text)) return { state: 'QUEUE', root };
    if (/artist name/.test(text) && /song title/.test(text) && /email/.test(text)) return { state: 'DETAILS', root };
    if (/choose a method below/.test(text) && /submit a link/.test(text)) return { state: 'METHOD', root };
    return { state: 'REVIEWER', root: document.body };
  }

  function findNextButton(root = activeModal()) {
    return [...root.querySelectorAll('button, [role="button"]')]
      .filter(el => visible(el) && !el.disabled)
      .find(el => norm(el.innerText || el.textContent) === 'next') || null;
  }

  function openSubmissionModal() {
    const candidates = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter(el => visible(el) && !el.disabled)
      .filter(el => {
        const t = norm(el.innerText || el.textContent);
        return t === 'submit' || t === 'submit song' || t === 'submit a song';
      });
    if (!candidates[0]) {
      showBadge('LiveFinder is connected. Waiting for the Nero submit button…');
      return;
    }
    showBadge('LiveFinder: opening Nero submission flow…');
    guardedClick(candidates[0], 'open-submit-modal');
  }

  function handleMethod(root) {
    showBadge('LiveFinder: link submission…');

    const urlField = bestField(['song link', 'track link', 'music link', 'url', 'link'], root);
    if (!urlField) {
      const linkChoice = findClickableByText('submit a link', root);
      if (linkChoice) guardedClick(linkChoice, 'choose-submit-link');
      return;
    }

    if (payload.song?.songUrl && String(urlField.value || '') !== payload.song.songUrl) {
      setNativeValue(urlField, payload.song.songUrl);
      console.log('[LiveFinder] filled song URL');
      return;
    }

    const next = findNextButton(root);
    if (next) {
      showBadge('LiveFinder: song link entered. Moving to details…');
      guardedClick(next, 'method-next');
    }
  }

  function handleDetails(root) {
    const song = payload.song || {};
    const mappings = [
      { value: song.artist, hints: ['artist name', 'artist'] },
      { value: song.title, hints: ['song title', 'track title', 'song name', 'track name'] },
      { value: song.email, hints: ['email address', 'email', 'e-mail'] },
      { value: song.instagram, hints: ['instagram handle', 'instagram', 'ig handle'] },
      { value: song.note, hints: ['note', 'message', 'comments', 'description', 'question'] }
    ];

    let changed = false;
    const knownFields = new Set();

    for (const mapping of mappings) {
      if (!mapping.value) continue;
      const el = bestField(mapping.hints, root);
      if (!el) continue;
      knownFields.add(el);
      if (String(el.value || '') !== String(mapping.value)) {
        setNativeValue(el, mapping.value);
        changed = true;
      }
    }

    const checkboxes = [...root.querySelectorAll('input[type="checkbox"]')].filter(visible);
    let termsCheckbox = checkboxes.find(el => /terms|conditions|accept/.test(textFor(el, root)));
    if (!termsCheckbox && checkboxes.length === 1) termsCheckbox = checkboxes[0];

    if (termsCheckbox && !termsCheckbox.checked) {
      termsCheckbox.click();
      termsCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      changed = true;
      console.log('[LiveFinder] accepted terms');
    }

    if (changed) {
      showBadge('LiveFinder: filled details and accepted terms…');
      return;
    }

    const unknownRequired = [...root.querySelectorAll('input[required], textarea[required]')]
      .filter(el => visible(el) && !el.disabled && el.type !== 'checkbox' && !knownFields.has(el) && !String(el.value || '').trim());

    if (unknownRequired.length) {
      showBadge('LiveFinder stopped: this reviewer has an extra required question. Complete it manually, then press Next.', 'error');
      return;
    }

    const next = findNextButton(root);
    if (next) {
      showBadge('LiveFinder: details complete. Moving to queue…');
      guardedClick(next, 'details-next');
    } else {
      showBadge('LiveFinder filled the details, but Nero has not enabled Next yet.', 'error');
    }
  }

  async function handleQueue(root) {
    const raw = root.innerText || root.textContent || '';
    const match = raw.match(/([\d,]+)\s+ahead of you/i);
    if (match) queueAhead = Number(match[1].replace(/,/g, ''));

    await chrome.storage.local.set({
      lastNeroQueue: {
        reviewer: payload.reviewer,
        song: payload.song,
        ahead: queueAhead,
        capturedAt: Date.now()
      }
    });

    showBadge(`LiveFinder: ${queueAhead ?? '?'} ahead. Free queue selected; no paid skip.`);

    // Only the footer Next is allowed. Never click SKIP/SUPER SKIP/THRONE.
    const next = findNextButton(root);
    if (next) guardedClick(next, 'queue-free-next');
  }

  async function handleComplete() {
    if (finished) return;
    finished = true;
    await chrome.storage.local.set({
      lastNeroResult: {
        status: 'submitted',
        reviewer: payload.reviewer,
        song: payload.song,
        ahead: queueAhead,
        completedAt: Date.now()
      }
    });
    await chrome.storage.local.remove(STORAGE_KEYS);
    showBadge(`LiveFinder: submitted${queueAhead != null ? ` · ${queueAhead} were ahead` : ''}.`, 'success');
    console.log('[LiveFinder] Nero submission complete', { queueAhead });
  }

  async function getPendingPayload() {
    const result = await chrome.storage.local.get(STORAGE_KEYS);
    const candidate = result.pendingNeroSubmission;
    const storedAt = result.pendingNeroSubmissionStoredAt || 0;
    if (!candidate || Date.now() - storedAt > MAX_AGE_MS) {
      await chrome.storage.local.remove(STORAGE_KEYS);
      return null;
    }
    if (candidate.source !== 'livefinder' || candidate.type !== 'PREPARE_NERO_SUBMISSION') return null;
    return candidate;
  }

  async function tick() {
    if (!payload || finished) return;
    try {
      const { state, root } = detectState();
      if (state !== lastState) {
        console.log('[LiveFinder] state:', state);
        lastState = state;
      }
      if (state === 'REVIEWER') openSubmissionModal();
      else if (state === 'METHOD') handleMethod(root);
      else if (state === 'DETAILS') handleDetails(root);
      else if (state === 'QUEUE') await handleQueue(root);
      else if (state === 'COMPLETE') await handleComplete();
    } catch (err) {
      console.error('[LiveFinder] automation error', err);
      showBadge('LiveFinder hit an unexpected Nero state. Check the console.', 'error');
    }
  }

  async function main() {
    console.log('[LiveFinder] Nero workflow script loaded on', location.href);
    payload = await getPendingPayload();
    if (!payload) {
      console.log('[LiveFinder] No pending Nero submission found.');
      return;
    }
    showBadge('LiveFinder connected. Starting Nero submission…');
    setInterval(tick, 500);
    tick();
  }

  main();
})();
