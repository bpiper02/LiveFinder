(() => {
  function textFor(el) {
    const parts = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('autocomplete')
    ];

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(label.textContent);
    }

    const wrappingLabel = el.closest('label');
    if (wrappingLabel) parts.push(wrappingLabel.textContent);

    const parentText = el.parentElement?.innerText;
    if (parentText && parentText.length < 220) parts.push(parentText);

    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function scoreField(el, hints) {
    const haystack = textFor(el);
    let score = 0;
    for (const hint of hints) {
      if (haystack.includes(hint)) score += hint.length;
    }
    return score;
  }

  function bestField(hints, used = new Set()) {
    const candidates = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea')]
      .filter(el => !el.disabled && !used.has(el));

    return candidates
      .map(el => ({ el, score: scoreField(el, hints) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function fillForm(payload) {
    const song = payload.song || {};
    const used = new Set();
    let filled = 0;

    const mappings = [
      { value: song.songUrl, hints: ['song link', 'track link', 'music link', 'spotify', 'soundcloud', 'youtube', 'google drive', 'bandlab', 'url', 'link'] },
      { value: song.artist, hints: ['artist name', 'artist', 'performer', 'your name', 'name'] },
      { value: song.email, hints: ['email address', 'email', 'e-mail'] },
      { value: song.title, hints: ['track name', 'track title', 'song title', 'song name', 'title'] },
      { value: song.note, hints: ['note', 'message', 'anything else', 'comments', 'description', 'question'] }
    ];

    for (const mapping of mappings) {
      if (!mapping.value) continue;
      const el = bestField(mapping.hints, used);
      if (!el) continue;
      setNativeValue(el, mapping.value);
      used.add(el);
      filled += 1;
    }

    if (filled > 0) {
      console.log(`[LiveFinder] Autofilled ${filled} Nero field(s). Final submission remains manual.`);
      showBadge(`LiveFinder filled ${filled} field${filled === 1 ? '' : 's'}. Review, then submit.`);
      return true;
    }
    return false;
  }

  function showBadge(message) {
    let badge = document.getElementById('livefinder-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'livefinder-badge';
      Object.assign(badge.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '2147483647',
        background: '#111',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: '10px',
        font: '13px/1.35 system-ui, sans-serif',
        boxShadow: '0 6px 24px rgba(0,0,0,.25)',
        maxWidth: '340px'
      });
      document.documentElement.appendChild(badge);
    }
    badge.textContent = message;
  }

  async function getPendingPayload() {
    try {
      const result = await chrome.storage.local.get(['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt']);
      const payload = result.pendingNeroSubmission;
      const storedAt = result.pendingNeroSubmissionStoredAt || 0;
      if (!payload) return null;
      if (Date.now() - storedAt > 5 * 60 * 1000) {
        await chrome.storage.local.remove(['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt']);
        return null;
      }
      if (payload.source !== 'livefinder' || payload.type !== 'PREPARE_NERO_SUBMISSION') return null;
      return payload;
    } catch (err) {
      console.error('[LiveFinder] Could not read pending submission', err);
      return null;
    }
  }

  async function main() {
    console.log('[LiveFinder] Nero content script loaded on', location.href);
    const payload = await getPendingPayload();
    if (!payload) {
      console.log('[LiveFinder] No pending Nero submission found.');
      return;
    }

    showBadge('LiveFinder connected. Waiting for Nero form…');

    let attempts = 0;
    let observer;
    const tryFill = async () => {
      attempts += 1;
      if (fillForm(payload)) {
        observer?.disconnect();
        await chrome.storage.local.remove(['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt']);
        return;
      }
      if (attempts >= 60) {
        observer?.disconnect();
        showBadge('LiveFinder is connected, but could not identify Nero’s form fields.');
        console.warn('[LiveFinder] No matching Nero form fields found.');
      }
    };

    observer = new MutationObserver(() => tryFill());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    tryFill();
    const timer = setInterval(() => {
      if (attempts >= 60 || document.getElementById('livefinder-badge')?.textContent?.startsWith('LiveFinder filled')) {
        clearInterval(timer);
        return;
      }
      tryFill();
    }, 500);
  }

  main();
})();
