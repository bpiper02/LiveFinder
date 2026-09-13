(() => {
  const FIELD_DEFS = {
    artist: {
      label: 'Artist',
      hints: ['artist name', 'performer name', 'band name', 'act name', 'artist'],
      negative: ['instagram artist', 'artist email']
    },
    title: {
      label: 'Song title',
      hints: ['song title', 'track title', 'song name', 'track name', 'release title', 'title'],
      negative: ['job title', 'position title', 'page title']
    },
    songUrl: {
      label: 'Song link',
      hints: ['song link', 'track link', 'music link', 'audio link', 'streaming link', 'spotify link', 'soundcloud link', 'youtube link', 'drive link', 'song url', 'track url', 'music url', 'url', 'link'],
      negative: ['linkedin', 'portfolio', 'website', 'instagram', 'twitter', 'x.com', 'facebook']
    },
    email: {
      label: 'Email',
      hints: ['email address', 'e-mail address', 'contact email', 'email', 'e-mail'],
      negative: []
    },
    phone: {
      label: 'Phone',
      hints: ['phone number', 'mobile number', 'cell phone', 'cell number', 'contact number', 'telephone number', 'telephone', 'mobile', 'phone'],
      negative: ['fax', 'order number', 'catalog number', 'reference number', 'phone model']
    },
    instagram: {
      label: 'Instagram',
      hints: ['instagram handle', 'instagram username', 'ig handle', 'ig username', 'instagram', 'ig'],
      negative: ['password']
    },
    note: {
      label: 'Note',
      hints: ['reviewer note', 'submission note', 'note or question', 'note', 'message', 'comments', 'comment', 'anything else', 'question'],
      negative: ['password']
    }
  };

  const normalize = value => String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  function hasPhrase(text, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(text);
  }

  function scoreFieldFromText(fieldKey, rawText, meta = {}) {
    const def = FIELD_DEFS[fieldKey];
    if (!def) return 0;
    const text = normalize(rawText);
    if (!text) return 0;

    if (def.negative.some(term => hasPhrase(text, normalize(term)))) return 0;

    let score = 0;
    for (const hint of def.hints) {
      const normalizedHint = normalize(hint);
      if (text === normalizedHint) score = Math.max(score, 100);
      else if (hasPhrase(text, normalizedHint)) score = Math.max(score, 58 + Math.min(normalizedHint.length, 22));
      else if (text.includes(normalizedHint)) score = Math.max(score, 45 + Math.min(normalizedHint.length, 18));
    }

    const type = normalize(meta.type);
    const autocomplete = normalize(meta.autocomplete);
    if (fieldKey === 'email' && (type === 'email' || autocomplete === 'email')) score += 32;
    if (fieldKey === 'phone' && (type === 'tel' || autocomplete === 'tel' || autocomplete.startsWith('tel '))) score += 32;
    if (fieldKey === 'songUrl' && type === 'url') score += 18;
    if (fieldKey === 'note' && meta.multiline) score += 8;

    return Math.min(score, 140);
  }

  function visible(el) {
    if (!el || typeof getComputedStyle !== 'function') return true;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect?.();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && (!rect || (rect.width > 0 && rect.height > 0));
  }

  function labelText(el, root = document) {
    const parts = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('autocomplete'),
      el.getAttribute?.('data-label')
    ];

    if (el.id) {
      try {
        const direct = root.querySelector?.(`label[for="${CSS.escape(el.id)}"]`) || document.querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
        if (direct) parts.push(direct.innerText || direct.textContent);
      } catch {}
    }

    const wrapping = el.closest?.('label');
    if (wrapping) parts.push(wrapping.innerText || wrapping.textContent);

    const ariaLabelledBy = el.getAttribute?.('aria-labelledby');
    if (ariaLabelledBy) {
      for (const id of ariaLabelledBy.split(/\s+/)) {
        const node = document.getElementById?.(id);
        if (node) parts.push(node.innerText || node.textContent);
      }
    }

    let parent = el.parentElement;
    for (let i = 0; i < 2 && parent; i += 1, parent = parent.parentElement) {
      const text = String(parent.innerText || parent.textContent || '').trim();
      if (text && text.length <= 240) parts.push(text);
    }

    return normalize(parts.filter(Boolean).join(' '));
  }

  function controls(root = document) {
    return [...root.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"]')]
      .filter(el => visible(el) && !el.disabled)
      .filter(el => !['checkbox', 'radio', 'file', 'submit', 'button', 'reset'].includes(normalize(el.type)));
  }

  function describeControl(el, root = document) {
    return {
      el,
      text: labelText(el, root),
      type: normalize(el.type || el.tagName),
      autocomplete: normalize(el.getAttribute?.('autocomplete')),
      multiline: el.tagName === 'TEXTAREA' || el.getAttribute?.('contenteditable') === 'true'
    };
  }

  function matchFields(root = document, keys = Object.keys(FIELD_DEFS)) {
    const descriptors = controls(root).map(el => describeControl(el, root));
    const candidates = [];

    for (const fieldKey of keys) {
      for (const descriptor of descriptors) {
        const score = scoreFieldFromText(fieldKey, descriptor.text, descriptor);
        if (score >= 58) candidates.push({ fieldKey, descriptor, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const usedFields = new Set();
    const usedControls = new Set();
    const matches = {};

    for (const candidate of candidates) {
      if (usedFields.has(candidate.fieldKey) || usedControls.has(candidate.descriptor.el)) continue;
      usedFields.add(candidate.fieldKey);
      usedControls.add(candidate.descriptor.el);
      matches[candidate.fieldKey] = candidate;
    }

    return { matches, descriptors };
  }

  function setNativeValue(el, value) {
    if (!el || value == null) return false;
    const text = String(value);

    if (el.tagName === 'SELECT') {
      const target = normalize(text);
      const option = [...el.options].find(opt => normalize(opt.value) === target || normalize(opt.textContent) === target);
      if (!option) return false;
      el.value = option.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (el.getAttribute?.('contenteditable') === 'true') {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, text);
    else el.value = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillCanonical(data, root = document) {
    const requested = Object.entries(data || {}).filter(([key, value]) => FIELD_DEFS[key] && String(value ?? '').trim());
    const { matches } = matchFields(root, requested.map(([key]) => key));
    const report = { filled: [], missing: [], failed: [] };

    for (const [fieldKey, value] of requested) {
      const match = matches[fieldKey];
      if (!match) {
        report.missing.push({ field: fieldKey, label: FIELD_DEFS[fieldKey].label });
        continue;
      }
      const ok = setNativeValue(match.descriptor.el, value);
      if (ok) report.filled.push({ field: fieldKey, label: FIELD_DEFS[fieldKey].label, score: match.score });
      else report.failed.push({ field: fieldKey, label: FIELD_DEFS[fieldKey].label, score: match.score });
    }

    return report;
  }

  const api = { FIELD_DEFS, normalize, scoreFieldFromText, describeControl, matchFields, fillCanonical };
  globalThis.LiveFinderAutofill = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
