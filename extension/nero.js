(() => {
  const PREFIX = '#nr=';

  function decodePayload() {
    if (!location.hash.startsWith(PREFIX)) return null;
    try {
      const encoded = location.hash.slice(PREFIX.length);
      const json = decodeURIComponent(escape(atob(encoded)));
      const payload = JSON.parse(json);
      if (payload?.source !== 'nero-router' || payload?.type !== 'PREPARE_NERO_SUBMISSION') return null;
      return payload;
    } catch (err) {
      console.error('[LiveFinder] Could not decode payload', err);
      return null;
    }
  }

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
    if (parentText && parentText.length < 180) parts.push(parentText);

    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
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
      { value: song.artist, hints: ['artist name', 'artist', 'performer'] },
      { value: song.title, hints: ['song title', 'track title', 'title', 'song name', 'track name'] },
      { value: song.email, hints: ['email address', 'email', 'e-mail'] },
      { value: song.songUrl, hints: ['song link', 'track link', 'music link', 'spotify', 'soundcloud', 'youtube', 'url', 'link'] },
      { value: song.note, hints: ['note', 'message', 'anything else', 'comments', 'description'] }
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
    if (document.getElementById('livefinder-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'livefinder-badge';
    badge.textContent = message;
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
      maxWidth: '320px'
    });
    document.body.appendChild(badge);
  }

  const payload = decodePayload();
  if (!payload) return;

  let attempts = 0;
  const tryFill = () => {
    attempts += 1;
    if (fillForm(payload)) {
      observer.disconnect();
      return;
    }
    if (attempts >= 30) {
      observer.disconnect();
      showBadge('LiveFinder found the Nero page but could not identify the form fields.');
      console.warn('[LiveFinder] No matching Nero form fields found.');
    }
  };

  const observer = new MutationObserver(() => tryFill());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryFill();
})();
