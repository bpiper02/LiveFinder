(() => {
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  const guard = globalThis.LiveFinderPaymentGuard;
  if (!parseReviewerUrl || !guard) return;

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function runtimeSend(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(response);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function sameReviewer(targetUrl) {
    const current = parseReviewerUrl(location.href);
    const target = parseReviewerUrl(targetUrl);
    return !!current?.handle && !!target?.handle && current.handle.toLowerCase() === target.handle.toLowerCase();
  }

  function monetizedRoot() {
    const candidates = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, section, div')]
      .filter(visible)
      .map(el => {
        const text = String(el.innerText || el.textContent || '');
        if (!text || text.length > 5000) return null;
        const surface = guard.classifySurfaceText(text);
        if (!surface.monetized) return null;
        const rect = el.getBoundingClientRect();
        return { el, text, surface, area: rect.width * rect.height };
      })
      .filter(Boolean)
      .sort((a, b) => a.area - b.area);
    return candidates[0] || null;
  }

  function verifiedFreeExit(rootInfo) {
    if (!rootInfo || rootInfo.surface.kind !== 'optional-upsell') return null;
    return [...rootInfo.el.querySelectorAll('button, [role="button"], a')]
      .filter(visible)
      .find(el => {
        const label = el.innerText || el.textContent || el.getAttribute?.('aria-label') || '';
        return guard.actionDecision(label, rootInfo.text).decision === 'safe-free';
      }) || null;
  }

  async function pendingForThisReviewer() {
    try {
      const response = await runtimeSend({ type: 'GET_NERO_SUBMISSION' });
      const payload = response?.record?.payload;
      return !!payload && payload.source === 'livefinder' && sameReviewer(payload?.reviewer?.neroUrl);
    } catch {
      return false;
    }
  }

  let clicked = false;

  async function tick() {
    if (clicked) return;
    const rootInfo = monetizedRoot();
    if (!rootInfo || rootInfo.surface.kind !== 'optional-upsell') return;
    const button = verifiedFreeExit(rootInfo);
    if (!button) return;

    // Revalidate the pending run immediately before every click. This prevents a
    // stale SPA tab from dismissing an upsell during a later manual Nero session.
    if (!(await pendingForThisReviewer())) return;

    const label = guard.norm(button.innerText || button.textContent || button.getAttribute?.('aria-label'));
    clicked = true;
    button.scrollIntoView?.({ block: 'center', inline: 'center' });
    button.click();
    console.log(`[LiveFinder] monetization guard: chose verified free upsell exit "${label}"`);
    setTimeout(() => { clicked = false; }, 1800);
  }

  tick();
  const observer = new MutationObserver(tick);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(tick, 500);
})();
