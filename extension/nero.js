(() => {
  const MAX_RUN_AGE_MS = 10 * 60 * 1000;
  const TICK_MS = 350;
  const MAX_RUN_MS = 2 * 60 * 1000;

  let payload = null;
  let queueAhead = null;
  let finished = false;
  let intervalId = null;
  let startedAt = Date.now();
  let lastState = '';
  let lastAction = '';
  let lastActionAt = 0;
  let flowOpened = false;
  let flowOpenedAt = 0;
  let enteredWorkflow = false;
  let reviewerSince = 0;

  const norm = value => String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

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
        maxWidth: '390px', border: '1px solid rgba(255,255,255,.16)'
      });
      document.documentElement.appendChild(badge);
    }
    badge.textContent = message;
    badge.style.background = kind === 'error' ? '#5b1717' : kind === 'success' ? '#153d27' : '#111';
  }

  function stopLoop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  function runtimeSend(message, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('Extension context unavailable. Reload the extension and refresh this Nero tab.'));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Extension background did not respond in time.'));
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(message, response => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }
          resolve(response);
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  function textFor(el, root = document) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute?.('aria-label'), el.getAttribute?.('autocomplete')];
    if (el.id) {
      const label = root.querySelector?.(`label[for="${CSS.escape(el.id)}"]`) || document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(label.textContent);
    }
    const wrappingLabel = el.closest?.('label');
    if (wrappingLabel) parts.push(wrappingLabel.textContent);
    const parentText = el.parentElement?.innerText;
    if (parentText && parentText.length < 280) parts.push(parentText);
    return norm(parts.filter(Boolean).join(' '));
  }

  function setNativeValue(el, value) {
    if (!el || value == null) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(el, String(value));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function guardedClick(el, action, cooldown = 900) {
    const now = Date.now();
    if (!el || !visible(el) || el.disabled) return false;
    if (lastAction === action && now - lastActionAt < cooldown) return false;
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

  function findClickable(text, root = document, exact = false) {
    const wanted = norm(text);
    return clickableElements(root).find(el => {
      const value = norm(el.innerText || el.textContent);
      return exact ? value === wanted : value.includes(wanted);
    }) || null;
  }

  function visibleInputs(root = document) {
    return [...root.querySelectorAll('input:not([type="hidden"]), textarea')].filter(el => visible(el) && !el.disabled);
  }

  function bestField(hints, root = document) {
    return visibleInputs(root)
      .filter(el => !['file', 'checkbox', 'radio'].includes(el.type))
      .map(el => {
        const haystack = textFor(el, root);
        const score = hints.reduce((sum, hint) => sum + (haystack.includes(hint) ? hint.length : 0), 0);
        return { el, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.el || null;
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

    const terms = ['submit a link', 'artist name', 'song title', 'ahead of you', "i'll wait", 'super skip', 'throne'];
    const scored = [...document.querySelectorAll('form, section, div')]
      .filter(visible)
      .map(el => {
        const text = norm(el.innerText || '');
        if (!text || text.length > 4000) return { el, score: 0 };
        const score = terms.reduce((sum, term) => sum + (text.includes(term) ? term.length : 0), 0);
        return { el, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.el || null;
  }

  function detectState() {
    const root = activeWorkflowRoot();
    if (!root) return { state: 'REVIEWER', root: document.body };

    const text = norm(root.innerText || root.textContent || '');
    const inputs = visibleInputs(root);

    if (/submission received|successfully submitted|added to (the )?queue|you are in the queue|you're in/.test(text)) {
      return { state: 'COMPLETE', root };
    }

    if (text.includes("i'll wait")) return { state: 'WAIT', root };
    if (text.includes('ahead of you') && /skip|super skip|throne/.test(text)) return { state: 'QUEUE', root };

    const hasArtist = inputs.some(el => /artist/.test(textFor(el, root)));
    const hasTitle = inputs.some(el => /song title|track title|song name|track name|title/.test(textFor(el, root)));
    const hasEmail = inputs.some(el => /email|e-mail/.test(textFor(el, root)));
    if ((hasArtist && hasTitle && hasEmail) || (text.includes('artist name') && text.includes('song title') && text.includes('email'))) {
      return { state: 'DETAILS', root };
    }

    const hasSubmitLinkControl = !!findClickable('submit a link', root);
    const hasUrlField = inputs.some(el => /url|link|spotify|soundcloud|youtube|drive/.test(textFor(el, root)));
    if (hasSubmitLinkControl || hasUrlField || text.includes('submit a link')) return { state: 'METHOD', root };

    return { state: 'UNKNOWN', root };
  }

  function findNextButton(root) {
    return findClickable('next', root, true);
  }

  function findTermsControl(root) {
    const native = [...root.querySelectorAll('input[type="checkbox"]')];
    for (const checkbox of native) {
      const haystack = textFor(checkbox, root);
      if (/terms|conditions|agree|accept/.test(haystack)) return checkbox;
    }

    const roleBoxes = [...root.querySelectorAll('[role="checkbox"]')].filter(visible);
    for (const checkbox of roleBoxes) {
      const text = norm(`${checkbox.getAttribute('aria-label') || ''} ${checkbox.parentElement?.innerText || ''}`);
      if (/terms|conditions|agree|accept/.test(text)) return checkbox;
    }

    const textNode = [...root.querySelectorAll('label, span, p, div')]
      .filter(visible)
      .find(el => /terms|conditions|agree|accept/.test(norm(el.innerText || el.textContent)));
    if (textNode) {
      const label = textNode.closest('label');
      if (label) return label;
      const container = textNode.closest('div, section');
      const box = container?.querySelector?.('input[type="checkbox"], [role="checkbox"]');
      if (box) return box;
    }

    const all = [...root.querySelectorAll('input[type="checkbox"], [role="checkbox"]')];
    if (all.length === 1) return all[0];
    return null;
  }

  function controlChecked(control) {
    if (!control) return false;
    if (control.matches?.('input[type="checkbox"]')) return !!control.checked;
    return control.getAttribute?.('aria-checked') === 'true' || control.querySelector?.('input[type="checkbox"]')?.checked === true;
  }

  function ensureTerms(root) {
    const control = findTermsControl(root);
    if (!control) return false;
    if (controlChecked(control)) return true;

    control.scrollIntoView?.({ block: 'center' });
    control.click();
    control.dispatchEvent?.(new Event('input', { bubbles: true }));
    control.dispatchEvent?.(new Event('change', { bubbles: true }));
    console.log('[LiveFinder] terms accepted');
    return controlChecked(control) || true;
  }

  function openSubmissionModal() {
    if (flowOpened) return;
    const button = clickableElements(document).find(el => {
      const text = norm(el.innerText || el.textContent);
      return text === 'submit' || text === 'submit song' || text === 'submit a song';
    });
    if (!button) {
      showBadge('LiveFinder: waiting for Nero Submit button…');
      return;
    }
    flowOpened = true;
    flowOpenedAt = Date.now();
    showBadge('LiveFinder: opening submission…');
    guardedClick(button, 'open-submit');
  }

  function handleMethod(root) {
    enteredWorkflow = true;
    reviewerSince = 0;

    const songUrl = payload.song?.songUrl;
    let urlField = bestField(['song link', 'track link', 'music link', 'url', 'link', 'spotify', 'soundcloud', 'youtube', 'drive'], root);

    if (!urlField) {
      const choice = findClickable('submit a link', root);
      if (choice) guardedClick(choice, 'choose-link');
      return;
    }

    if (songUrl && String(urlField.value || '') !== String(songUrl)) {
      setNativeValue(urlField, songUrl);
      showBadge('LiveFinder: song link filled…');
      return;
    }

    const next = findNextButton(root);
    if (next) {
      showBadge('LiveFinder: moving to details…');
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
    const known = new Set();

    for (const mapping of mappings) {
      if (!mapping.value) continue;
      const field = bestField(mapping.hints, root);
      if (!field) continue;
      known.add(field);
      if (String(field.value || '') !== String(mapping.value)) {
        setNativeValue(field, mapping.value);
        changed = true;
      }
    }

    const termsWasChecked = ensureTerms(root);
    if (changed) {
      showBadge('LiveFinder: details filled…');
      return;
    }

    const requiredUnknown = [...root.querySelectorAll('input[required], textarea[required]')]
      .filter(el => visible(el) && !el.disabled && el.type !== 'checkbox' && !known.has(el) && !String(el.value || '').trim());
    if (requiredUnknown.length) {
      showBadge('LiveFinder stopped: reviewer has an extra required field.', 'error');
      return;
    }

    const next = findNextButton(root);
    if (!next) {
      showBadge(termsWasChecked ? 'LiveFinder: waiting for Nero to enable Next…' : 'LiveFinder: waiting for terms control…');
      return;
    }

    showBadge('LiveFinder: details complete. Moving to queue…');
    guardedClick(next, 'details-next');
  }

  async function handleQueue(root) {
    enteredWorkflow = true;
    reviewerSince = 0;

    const raw = root.innerText || root.textContent || '';
    const match = raw.match(/([\d,]+)\s+ahead of you/i);
    if (match) queueAhead = Number(match[1].replace(/,/g, ''));

    runtimeSend({
      type: 'SAVE_NERO_QUEUE',
      value: { reviewer: payload.reviewer, song: payload.song, ahead: queueAhead, capturedAt: Date.now() }
    }).catch(() => {});

    showBadge(`LiveFinder: ${queueAhead ?? '?'} ahead. Avoiding all paid skips.`);

    const next = findNextButton(root);
    if (next) guardedClick(next, 'queue-next');
  }

  function handleWait(root) {
    enteredWorkflow = true;
    reviewerSince = 0;

    const waitButton = clickableElements(root).find(el => {
      const text = norm(el.innerText || el.textContent);
      return text.includes("i'll wait") && !text.includes('skip') && !text.includes('$');
    });

    if (!waitButton) {
      showBadge("LiveFinder: waiting for the free 'I'll wait' option…");
      return;
    }

    showBadge("LiveFinder: choosing 'I'll wait'…");
    guardedClick(waitButton, 'ill-wait');
  }

  async function completeRun() {
    if (finished) return;
    finished = true;
    stopLoop();

    const result = { status: 'submitted', reviewer: payload.reviewer, song: payload.song, ahead: queueAhead, completedAt: Date.now() };
    await runtimeSend({ type: 'SAVE_NERO_RESULT', value: result }).catch(() => {});
    await runtimeSend({ type: 'CLEAR_NERO_SUBMISSION' }).catch(() => {});
    showBadge(`LiveFinder: submitted${queueAhead != null ? ` · ${queueAhead} ahead captured` : ''}.`, 'success');
    console.log('[LiveFinder] complete', result);
  }

  async function abortRun(reason) {
    if (finished) return;
    finished = true;
    stopLoop();
    await runtimeSend({ type: 'CLEAR_NERO_SUBMISSION' }).catch(() => {});
    showBadge(`LiveFinder stopped: ${reason}`, 'error');
    console.warn('[LiveFinder] stopped:', reason);
  }

  async function tick() {
    if (!payload || finished) return;

    if (Date.now() - startedAt > MAX_RUN_MS) {
      await abortRun('run timed out after two minutes.');
      return;
    }

    try {
      const { state, root } = detectState();
      if (state !== lastState) {
        lastState = state;
        console.log('[LiveFinder] state:', state);
      }

      if (state === 'REVIEWER') {
        if (!flowOpened) {
          openSubmissionModal();
          return;
        }
        if (!enteredWorkflow && Date.now() - flowOpenedAt > 7000) {
          await abortRun('could not recognize Nero first step.');
          return;
        }
        if (enteredWorkflow) {
          reviewerSince ||= Date.now();
          if (Date.now() - reviewerSince > 1400) await abortRun('submission window was closed or exited.');
        }
        return;
      }

      reviewerSince = 0;

      if (state === 'METHOD') handleMethod(root);
      else if (state === 'DETAILS') handleDetails(root);
      else if (state === 'QUEUE') await handleQueue(root);
      else if (state === 'WAIT') handleWait(root);
      else if (state === 'COMPLETE') await completeRun();
      else if (state === 'UNKNOWN' && flowOpened && !enteredWorkflow && Date.now() - flowOpenedAt > 7000) {
        await abortRun('Nero opened an unrecognized submission screen.');
      }
    } catch (err) {
      const message = String(err?.message || err);
      console.error('[LiveFinder] automation error', err);
      if (/extension context|receiving end|message port|runtime unavailable/i.test(message)) {
        finished = true;
        stopLoop();
        showBadge('LiveFinder extension was reloaded. Refresh this Nero tab and start a new run.', 'error');
        return;
      }
      showBadge(`LiveFinder error: ${message}`, 'error');
    }
  }

  async function main() {
    console.log('[LiveFinder] controller loaded', location.href);

    try {
      const response = await runtimeSend({ type: 'GET_NERO_SUBMISSION' });
      const record = response?.record;
      if (!response?.ok || !record?.payload) {
        console.log('[LiveFinder] no pending run');
        return;
      }
      if (Date.now() - Number(record.storedAt || 0) > MAX_RUN_AGE_MS) {
        await runtimeSend({ type: 'CLEAR_NERO_SUBMISSION' }).catch(() => {});
        console.log('[LiveFinder] pending run expired');
        return;
      }

      payload = record.payload;
      startedAt = Date.now();
      showBadge('LiveFinder connected. Starting Nero submission…');
      intervalId = setInterval(tick, TICK_MS);
      tick();
    } catch (err) {
      console.error('[LiveFinder] startup failed', err);
      showBadge('LiveFinder could not reach its extension background. Reload extension + refresh this tab.', 'error');
    }
  }

  main();
})();
