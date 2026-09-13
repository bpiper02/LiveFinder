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

  function candidateRoots() {
    const roots = [];
    const seen = new Set();
    const push = root => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    };

    [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, form')]
      .filter(visible)
      .forEach(push);

    [...document.querySelectorAll('section, main, [class*="modal" i], [class*="dialog" i], [class*="form" i]')]
      .filter(visible)
      .filter(el => el.querySelector('input:not([type="hidden"]), textarea, select, [contenteditable="true"]'))
      .filter(el => String(el.innerText || el.textContent || '').length <= 5000)
      .forEach(push);

    push(document);
    return roots;
  }

  function inspectRoot(root) {
    const result = autofill.matchFields(root);
    const matchedFields = Object.keys(result.matches || {});
    const descriptors = Array.isArray(result.descriptors) ? result.descriptors : [];
    const area = root === document
      ? Number.POSITIVE_INFINITY
      : (() => {
          const rect = root.getBoundingClientRect?.();
          return rect ? Math.max(1, rect.width * rect.height) : Number.POSITIVE_INFINITY;
        })();
    return { root, result, matchedFields, descriptors, area };
  }

  function activeRootInfo() {
    const inspected = candidateRoots().map(inspectRoot);
    const semantic = inspected
      .filter(info => info.root !== document && info.matchedFields.length > 0)
      .sort((a, b) => {
        if (b.matchedFields.length !== a.matchedFields.length) return b.matchedFields.length - a.matchedFields.length;
        return a.area - b.area;
      });

    // A visible form/dialog/container wins over the page-wide fallback. This
    // keeps one-step autofill from accidentally preferring unrelated fields
    // elsewhere on the reviewer page when the actual submission step is open.
    if (semantic[0]) return semantic[0];
    return inspected.find(info => info.root === document) || inspectRoot(document);
  }

  function pageContext() {
    const parsed = parseReviewerUrl(location.href, location.origin);
    const info = activeRootInfo();
    return {
      supported: !!parsed,
      site: /(^|\.)nero\.fan$/i.test(location.hostname) ? 'nero' : 'unknown',
      url: location.href,
      handle: parsed?.handle || '',
      reviewerUrl: parsed?.targetUrl || '',
      formVisible: info.matchedFields.length > 0,
      fieldCount: info.matchedFields.length
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
        const parsed = parseReviewerUrl(location.href, location.origin);
        if (!parsed) {
          const context = pageContext();
          sendResponse({ ok: false, error: 'This page is not a supported reviewer page yet.', context });
          return;
        }

        const info = activeRootInfo();
        const context = {
          supported: true,
          site: 'nero',
          url: location.href,
          handle: parsed.handle || '',
          reviewerUrl: parsed.targetUrl || '',
          formVisible: info.matchedFields.length > 0,
          fieldCount: info.matchedFields.length
        };

        if (!context.formVisible) {
          sendResponse({ ok: false, error: 'No confident submission fields are visible yet. Open the current submission step, then try again.', context });
          return;
        }

        const report = autofill.fillCanonical(message.draft || {}, info.root);
        sendResponse({ ok: true, report, context: pageContext() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }
  });
})();
