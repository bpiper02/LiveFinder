(() => {
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function hasDetailsFields() {
    const text = norm(document.body?.innerText || '');
    return text.includes('artist name') && text.includes('song title') && text.includes('email');
  }

  function findTermsCheckbox() {
    const inputs = [...document.querySelectorAll('input[type="checkbox"]')];
    for (const input of inputs) {
      const id = input.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrapping = input.closest('label');
      const nearby = input.parentElement?.innerText || '';
      const haystack = norm([
        input.getAttribute('aria-label'),
        input.name,
        label?.innerText,
        wrapping?.innerText,
        nearby
      ].filter(Boolean).join(' '));
      if (/terms|conditions|agree|accept/.test(haystack)) return input;
    }

    const textTargets = [...document.querySelectorAll('label, p, span, div')]
      .filter(visible)
      .filter(el => /terms|conditions|agree|accept/.test(norm(el.innerText || el.textContent)));

    for (const target of textTargets) {
      const container = target.closest('label, div, section, form') || target.parentElement;
      const input = container?.querySelector?.('input[type="checkbox"]');
      if (input) return input;
      const roleCheckbox = container?.querySelector?.('[role="checkbox"]');
      if (roleCheckbox) return roleCheckbox;
    }

    const visibleCheckboxes = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')].filter(visible);
    if (hasDetailsFields() && visibleCheckboxes.length === 1) return visibleCheckboxes[0];
    return null;
  }

  function isChecked(el) {
    if (!el) return false;
    if (el.matches('input[type="checkbox"]')) return el.checked;
    return el.getAttribute('aria-checked') === 'true';
  }

  function checkTerms() {
    if (!hasDetailsFields()) return;
    const checkbox = findTermsCheckbox();
    if (!checkbox || isChecked(checkbox)) return;

    checkbox.scrollIntoView?.({ block: 'center', inline: 'center' });
    checkbox.click();
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[LiveFinder] terms checkbox accepted');
  }

  const observer = new MutationObserver(checkTerms);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'class', 'disabled'] });
  setInterval(checkTerms, 400);
  checkTerms();
})();
