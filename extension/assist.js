(() => {
  const autofill = globalThis.LiveFinderAutofill;
  if (!autofill) {
    console.warn('[LiveFinder Assist] autofill core missing');
    return;
  }

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function activeRoot() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog')]
      .filter(visible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    if (dialogs[0]) return dialogs[0];

    const forms = [...document.querySelectorAll('form')]
      .filter(visible)
      .filter(form => form.querySelector('input, textarea, select, [contenteditable="true"]'));
    if (forms[0]) return forms[0];

    return document;
  }

  function pageContext() {
    const isNero = /(^|\.)nero\.fan$/i.test(location.hostname);
    const parts = location.pathname.split('/').filter(Boolean);
    const reserved = new Set(['discover','learn','docs','home','login','signup','terms','privacy','support','pricing','about','create','careers','jobs','games','partner-program','settings','account','dashboard']);
    const handle = parts[0] && !reserved.has(parts[0].toLowerCase()) ? decodeURIComponent(parts[0].replace(/^@/, '')) : '';
    const root = activeRoot();
    const controls = root === document ? [] : autofill.matchFields(root).descriptors;
    return {
      supported: isNero && !!handle,
      site: isNero ? 'nero' : 'unknown',
      url: location.href,
      handle,
      reviewerUrl: handle ? `https://www.nero.fan/${encodeURIComponent(handle)}${parts.includes('live') ? '/live' : ''}` : '',
      formVisible: controls.length > 0,
      fieldCount: controls.length
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return;

    if (message.type === 'LIVEFINDER_ASSIST_STATUS') {
      sendResponse({ ok: true, context: pageContext() });
      return;
    }

    if (message.type === 'LIVEFINDER_AUTOFILL_CURRENT') {
      try {
        const context = pageContext();
        if (!context.supported) {
          sendResponse({ ok: false, error: 'This page is not a supported reviewer page yet.', context });
          return;
        }
        const root = activeRoot();
        if (root === document) {
          sendResponse({ ok: false, error: 'No visible submission form detected. Open the submission form first.', context });
          return;
        }
        const report = autofill.fillCanonical(message.draft || {}, root);
        sendResponse({ ok: true, report, context: pageContext() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }
  });
})();
