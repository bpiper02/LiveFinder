(() => {
  const STORAGE_KEYS = ['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt'];
  const MAX_AGE_MS = 10 * 60 * 1000;

  let payload = null;
  let queueAhead = null;
  let finished = false;
  let lastState = '';
  let lastAction = '';
  let lastActionAt = 0;

  // Lifecycle guards. A LiveFinder run may open Nero's submission flow ONCE.
  // Returning to the reviewer page after that is treated as an abort/close,
  // never as permission to reopen the modal forever.
  let flowOpened = false;
  let flowOpenedAt = 0;
  let enteredWorkflow = false;
  let reviewerSince = 0;

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

  function textFor(el, root = document) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute?.('aria-label'), el.getAttribute?.('autocomplete')];
    if (el.id) {
      const label = root.querySelector?.(`label[for="${CSS.escape(el.id)}"]`) || document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && visible(label)) parts.push(label.textContent);
    }
    const wrappingLabel = el.closest?.('label');
    if (wrappingLabel && visible(wrappingLabel)) parts.push(wrappingLabel.textContent);
    const parentText = el.parentElement?.innerText;
    if (parentText && parentText.length < 260) parts.push(parentText);
    return norm(parts.filter(Boolean).join(' '));
  }

  function setNativeValue(el, value) {
    if (!el || value == null) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(el, String(value));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

  function clickableElements(root = document) {
    return [...root.querySelectorAll('button, a, [role="button"]')].filter(el => visible(el) && !el.disabled);
  }

  function findClickableContaining(text, root = document) {
    const wanted = norm(text);
    return clickableElements(root).find(el => norm(el.innerText || el.textContent).includes(wanted)) || null;
  }

  function visibleInputs(root = document) {
    return [...root.querySelectorAll('input:not([type="hidden"]), textarea')].filter(el => visible(el) && !el.disabled);
  }

  function bestField(hints, root = document) {
    const candidates = visibleInputs(root).filter(el => !['file', 'checkbox', 'radio'].includes(el.type));
    return candidates.map(el => {
      const haystack = textFor(el, root);
      const score = hints.reduce((sum, hint) => sum + (haystack.includes(hint) ? hint.length : 0), 0);
      return { el, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function activeWorkflowRoot() {
    const semantic = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog')]
      .filter(visible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    if (semantic[0]) return semantic[0];

    // Nero does not always expose dialog semantics. Find a visible container that
    // actually contains controls/text unique to the submission wizard.
    const containers = [...document.querySelectorAll('form, section, div')].filter(visible);
    const scored = containers.map(el => {
      const text = norm(el.innerText || '');
      if (!text || text.length > 3500) return { el, score: 0 };
      let score = 0;
      if (text.includes('submit a link')) score += 8;
      if (text.includes('artist name')) score += 6;
      if (text.includes('song title')) score += 6;
      if (text.includes('ahead of you')) score += 10;
      if (text.includes('skip')) score += 3;
      if (text.includes('email')) score += 2;
      return { el, score };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.el.getBoundingClientRect().width * a.el.getBoundingClientRect().height) - (b.el.getBoundingClientRect().width * b.el.getBoundingClientRect().height));

    return scored[0]?.el || null;
  }

  function detectState() {
    const root = activeWorkflowRoot();
    if (!root) return { state: 'REVIEWER', root: document.body };

    const text = norm(root.innerText || root.textContent || '');
    const inputs = visibleInputs(root);

    // Later/more specific states first.
    if (/submission received|successfully submitted|added to (the )?queue|you('|’)re in|you are in the queue/.test(text)) {
      return { state: 'COMPLETE', root };
    }

    if (/ahead of you/.test(text) && /skip/.test(text)) {
      return { state: 'QUEUE', root };
    }

    const hasArtist = inputs.some(el => /artist/.test(textFor(el, root)));
    const hasTitle = inputs.some(el => /song title|track title|song name|track name|title/.test(textFor(el, root)));
    const hasEmail = inputs.some(el => /email|e-mail/.test(textFor(el, root)));
    if ((hasArtist && hasTitle && hasEmail) || (/artist name/.test(text) && /song title/.test(text) && /email/.test(text))) {
      return { state: 'DETAILS', root };
    }

    // Method screen: do not depend on one exact heading sentence.
    const hasSubmitLinkControl = !!findClickableContaining('submit a link', root);
    const hasUrlField = inputs.some(el => /url|link|spotify|soundcloud|youtube|drive/.test(textFor(el, root)));
    if (hasSubmitLinkControl || hasUrlField || text.includes('submit a link')) {
      return { state: 'METHOD', root };
    }

    return { state: 'UNKNOWN', root };
  }

  function findNextButton(root) {
    return clickableElements(root).find(el => norm(el.innerText || el.textContent) === 'next') || null;
  }

  function openSubmissionModal() {
    if (flowOpened) return;
    const button = clickableElements(document).find(el => {
      const t = norm(el.innerText || el.textContent);
      return t === 'submit' || t === 'submit song' || t === 'submit a song';
    });

    if (!button) {
      showBadge('LiveFinder is connected. Waiting for Nero\'s Submit button…');
      return;
    }

    flowOpened = true;
    flowOpenedAt = Date.now();
    showBadge('LiveFinder: opening Nero submission flow…');
    guardedClick(button, 'open-submit-modal');
  }

  function handleMethod(root) {
    enteredWorkflow = true;
    reviewerSince = 0;
    showBadge('LiveFinder: choosing link submission…');

    let urlField = bestField(['song link', 'track link', 'music link', 'url', 'link', 'spotify', 'soundcloud', 'youtube', 'drive'], root);

    if (!urlField) {
      const linkChoice = findClickableContaining('submit a link', root);
      if (linkChoice) guardedClick(linkChoice, 'choose-submit-link');
      return;
    }

    if (payload.song?.songUrl && String(urlField.value || '') !== String(payload.song.songUrl)) {
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
    enteredWorkflow = true;
    reviewerSince = 0;
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
      showBadge('LiveFinder stopped: reviewer has an extra required field. Fill it manually, then press Next.', 'error');
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
    enteredWorkflow = true;
    reviewerSince = 0;
    const raw = root.innerText || root.textContent || '';
    const match = raw.match(/([\d,]+)\s+ahead of you/i);
    if (match) queueAhead = Number(match[1].replace(/,/g, ''));

    await chrome.storage.local.set({
      lastNeroQueue: { reviewer: payload.reviewer, song: payload.song, ahead: queueAhead, capturedAt: Date.now() }
    });

    showBadge(`LiveFinder: ${queueAhead ?? '?'} ahead. Taking free path; no paid skip.`);

    // Only the footer Next is allowed. Never click Skip/Super Skip/Throne.
    const next = findNextButton(root);
    if (next) guardedClick(next, 'queue-free-next');
  }

  async function handleComplete() {
    if (finished) return;
    finished = true;
    await chrome.storage.local.set({
      lastNeroResult: { status: 'submitted', reviewer: payload.reviewer, song: payload.song, ahead: queueAhead, completedAt: Date.now() }
    });
    await chrome.storage.local.remove(STORAGE_KEYS);
    showBadge(`LiveFinder: submitted${queueAhead != null ? ` · ${queueAhead} ahead captured` : ''}.`, 'success');
    console.log('[LiveFinder] Nero submission complete', { queueAhead });
  }

  async function abortRun(reason) {
    if (finished) return;
    finished = true;
    await chrome.storage.local.remove(STORAGE_KEYS);
    showBadge(`LiveFinder stopped: ${reason}`, 'error');
    console.warn('[LiveFinder] run aborted:', reason);
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

      if (state === 'REVIEWER') {
        if (!flowOpened) {
          openSubmissionModal();
          return;
        }

        // Give Nero time to animate/render the first step after the one allowed click.
        if (!enteredWorkflow && Date.now() - flowOpenedAt > 6000) {
          await abortRun('opened Submit, but could not recognize Nero\'s first submission screen.');
          return;
        }

        // If we were already inside the wizard and are now back on the reviewer page,
        // the user closed/cancelled it or Nero exited the flow. Never reopen automatically.
        if (enteredWorkflow) {
          reviewerSince ||= Date.now();
          if (Date.now() - reviewerSince > 1200) {
            await abortRun('submission window was closed or exited.');
          }
        }
        return;
      }

      if (state === 'UNKNOWN') {
        if (flowOpened && Date.now() - flowOpenedAt > 6000 && !enteredWorkflow) {
          await abortRun('Nero opened a screen LiveFinder does not recognize yet.');
        }
        return;
      }

      if (state === 'METHOD') handleMethod(root);
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
