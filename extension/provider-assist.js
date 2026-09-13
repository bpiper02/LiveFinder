(() => {
  const autofill = globalThis.LiveFinderAutofill;
  const providers = globalThis.LiveFinderProviders;
  if (!autofill || !providers) return;

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function candidateRoots() {
    const roots = [];
    const seen = new Set();
    const push = root => { if (root && !seen.has(root)) { seen.add(root); roots.push(root); } };
    [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, form')].filter(visible).forEach(push);
    [...document.querySelectorAll('section, main, [class*="modal" i], [class*="dialog" i], [class*="form" i], [class*="step" i]')]
      .filter(visible)
      .filter(el => el.querySelector('input:not([type="hidden"]), textarea, select, [contenteditable="true"]'))
      .filter(el => String(el.innerText || el.textContent || '').length <= 6000)
      .forEach(push);
    push(document);
    return roots;
  }

  function inspectRoot(root) {
    const result = autofill.matchFields(root);
    const matchedFields = Object.keys(result.matches || {});
    const area = root === document ? Number.POSITIVE_INFINITY : (() => {
      const rect = root.getBoundingClientRect?.();
      return rect ? Math.max(1, rect.width * rect.height) : Number.POSITIVE_INFINITY;
    })();
    return { root, matchedFields, area };
  }

  function activeRootInfo() {
    const inspected = candidateRoots().map(inspectRoot);
    const semantic = inspected
      .filter(info => info.root !== document && info.matchedFields.length > 0)
      .sort((a, b) => b.matchedFields.length - a.matchedFields.length || a.area - b.area);
    return semantic[0] || inspected.find(info => info.root === document) || inspectRoot(document);
  }

  function pageContext() {
    const base = providers.contextForUrl(location.href);
    const info = activeRootInfo();
    return {
      ...(base || { supported: false, provider: 'unknown', providerLabel: 'Unsupported', url: location.href }),
      site: base?.provider || 'unknown',
      formVisible: info.matchedFields.length > 0,
      fieldCount: info.matchedFields.length,
      assistReachable: true
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
          sendResponse({ ok: false, error: 'Open a specific supported review page first.', context });
          return;
        }
        const info = activeRootInfo();
        if (!info.matchedFields.length) {
          sendResponse({ ok: false, error: 'No confident submission fields are visible yet. Open the submission step, then try again.', context });
          return;
        }
        const report = autofill.fillCanonical(message.draft || {}, info.root);
        sendResponse({ ok: true, report, context: pageContext() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    }
  });
})();
