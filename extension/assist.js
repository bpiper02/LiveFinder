(() => {
  const autofill = globalThis.LiveFinderAutofill;
  const parseReviewerUrl = globalThis.LiveFinderUrl?.parseReviewerUrl;
  if (!autofill || !parseReviewerUrl) {
    console.warn('[LiveFinder Assist] required helpers missing');
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
    const parsed = parseReviewerUrl(location.href, location.origin);
    const root = activeRoot();
    const matchResult = root === document ? { matches: {} } : autofill.matchFields(root);
    const matchedFields = Object.keys(matchResult.matches || {});
    return {
      supported: !!parsed,
      site: /(^|\.)nero\.fan$/i.test(location.hostname) ? 'nero' : 'unknown',
      url: location.href,
      handle: parsed?.handle || '',
      reviewerUrl: parsed?.targetUrl || '',
      formVisible: matchedFields.length > 0,
      fieldCount: matchedFields.length
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
        if (root === document || !context.formVisible) {
          sendResponse({ ok: false, error: 'No confident submission fields detected. Open the submission form first.', context });
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
