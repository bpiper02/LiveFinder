(() => {
  const STORAGE_KEYS = ['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt'];
  const MAX_AGE_MS = 10 * 60 * 1000;
  let payload = null;
  let lastAction = '';
  let lastActionAt = 0;
  let queueAhead = null;
  let finished = false;

  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
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
        maxWidth: '360px', border: '1px solid rgba(255,255,255,.16)'
      });
      document.documentElement.appendChild(badge);
    }
    badge.textContent = message;
    badge.style.background = kind === 'error' ? '#5b1717' : kind === 'success' ? '#153d27' : '#111';
  }

  function textFor(el) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute?.('aria-label'), el.getAttribute?.('autocomplete')];
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(label.textContent);
    }
    const wrappingLabel = el.closest?.('label');
    if (wrappingLabel) parts.push(wrappingLabel.textContent);
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
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function bestField(hints) {
    const candidates = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea')]
      .filter(el => visible(el) && !el.disabled);
    return candidates.map(el => {
      const haystack = textFor(el);
      const score = hints.reduce((sum, hint) => sum + (haystack.includes(hint) ? hint.length : 0), 0);
      return { el, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function clickText(exactText, { tagNames = ['BUTTON', 'A', 'DIV'], reject = [] } = {}) {
    const wanted = norm(exactText);
    const candidates = [...document.querySelectorAll(tagNames.map(t => t.toLowerCase()).join(','))]
      .filter(el => visible(el) && !el.disabled)
      .filter(el => norm(el.innerText || el.textContent) === wanted)
      .filter(el => !reject.some(term => norm(el.innerText || el.textContent).includes(norm(term))));
    const el = candidates[0];
    if (!el) return false;
    return guardedClick(el, `text:${wanted}`);
  }

  function guardedClick(el, action) {
    const now = Date.now();
    if (lastAction === action && now - lastActionAt < 1200) return false;
    lastAction = action;
    lastActionAt = now;
    el.click();
    console.log('[LiveFinder] action:', action);
    return true;
  }

  function bodyText() {
    return norm(document.body?.innerText);
  }

  function detectState() {
    const text = bodyText();
    if (/choose a method below/.test(text) && /submit a link/.test(text)) return 'METHOD';
    if (/artist name\s*\*/.test(text) && /song title\s*\*/.test(text) && /email\s*\*/.test(text)) return 'DETAILS';
    if (/ahead of you/.test(text) && /want to skip ahead/.test(text)) return 'QUEUE';
    if (/submission received|successfully submitted|added to (the )?queue|you('|’)re in|you are in the queue/.test(text)) return 'COMPLETE';
    return 'REVIEWER';
  }

  function findNextButton() {
    return [...document.querySelectorAll('button')]
      .filter(el => visible(el) && !el.disabled)
      .find(el => norm(el.innerText || el.textContent) === 'next') || null;
  }

  function openSubmissionModal() {
    const candidates = [...document.querySelectorAll('button, a')]
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

  function handleMethod() {
    showBadge('LiveFinder: choosing link submission…');

    const urlField = bestField(['submit a link', 'song link', 'track link', 'music link', 'url', 'link']);
    if (!urlField) {
      clickText('submit a link');
      return;
    }

    if (payload.song?.songUrl && urlField.value !== payload.song.songUrl) {
      setNativeValue(urlField, payload.song.songUrl);
      console.log('[LiveFinder] filled song URL');
      return;
    }

    const next = findNextButton();
    if (next) guardedClick(next, 'method-next');
  }

  function handleDetails() {
    const song = payload.song || {};
    const mappings = [
      { value: song.artist, hints: ['artist name', 'artist'] },
      { value: song.title, hints: ['song title', 'track title', 'song name', 'track name'] },
      { value: song.email, hints: ['email address', 'email', 'e-mail'] },
      { value: song.instagram, hints: ['instagram handle', 'instagram', 'ig handle'] },
      { value: song.note, hints: ['note', 'message', 'comments', 'description', 'question'] }
    ];

    let changed = false;
    for (const mapping of mappings) {
      if (!mapping.value) continue;
      const el = bestField(mapping.hints);
      if (el && el.value !== mapping.value) {
        setNativeValue(el, mapping.value);
        changed = true;
      }
    }

    const termsCheckbox = [...document.querySelectorAll('input[type="checkbox"]')]
      .find(el => visible(el) && /terms|conditions|accept/.test(textFor(el)));
    if (termsCheckbox && !termsCheckbox.checked) {
      termsCheckbox.click();
      changed = true;
      console.log('[LiveFinder] accepted terms');
    }

    if (changed) {
      showBadge('LiveFinder: filled details and accepted terms…');
      return;
    }

    const knownFields = new Set(mappings.map(m => bestField(m.hints)).filter(Boolean));
    const unknownRequired = [...document.querySelectorAll('input[required], textarea[required]')]
      .filter(el => visible(el) && !el.disabled && el.type !== 'checkbox' && !knownFields.has(el) && !String(el.value || '').trim());

    if (unknownRequired.length) {
      showBadge('LiveFinder stopped: this reviewer has an extra required question. Complete it manually, then press Next.', 'error');
      return;
    }

    const next = findNextButton();
    if (next) {
      showBadge('LiveFinder: details complete. Moving to queue…');
      guardedClick(next, 'details-next');
    }
  }

  async function handleQueue() {
    const match = document.body?.innerText.match(/([\d,]+)\s+ahead of you/i);
    if (match) queueAhead = Number(match[1].replace(/,/g, ''));

    await chrome.storage.local.set({
      lastNeroQueue: {
        reviewer: payload.reviewer,
        song: payload.song,
        ahead: queueAhead,
        capturedAt: Date.now()
      }
    });

    showBadge(`LiveFinder: ${queueAhead ?? '?'} ahead. Staying on the free path — no skips selected.`);

    const next = findNextButton();
    if (!next) return;
    guardedClick(next, 'queue-free-next');
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
      const state = detectState();
      console.debug('[LiveFinder] state:', state);
      if (state === 'REVIEWER') openSubmissionModal();
      if (state === 'METHOD') handleMethod();
      if (state === 'DETAILS') handleDetails();
      if (state === 'QUEUE') await handleQueue();
      if (state === 'COMPLETE') await handleComplete();
    } catch (err) {
      console.error('[LiveFinder] automation error', err);
      showBadge('LiveFinder hit an unexpected Nero state. Automation paused; check the console.', 'error');
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
    setInterval(tick, 650);
    tick();
  }

  main();
})();
