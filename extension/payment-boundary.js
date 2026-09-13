(() => {
  const guard = globalThis.LiveFinderPaymentGuard;
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  if (!guard || !parseReviewerUrl) return;

  const state = globalThis.LiveFinderPaymentBoundary = globalThis.LiveFinderPaymentBoundary || {
    blocked: false,
    kind: '',
    reason: '',
    prices: []
  };

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

  function roots() {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, form, section, div')]
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
  }

  function freeExit(rootInfo) {
    return [...rootInfo.el.querySelectorAll('button, [role="button"], a')]
      .filter(visible)
      .find(el => {
        const label = el.innerText || el.textContent || el.getAttribute?.('aria-label') || '';
        return guard.actionDecision(label, rootInfo.text).decision === 'safe-free';
      }) || null;
  }

  function showBoundaryBadge(message) {
    let badge = document.getElementById('livefinder-payment-boundary');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'livefinder-payment-boundary';
      Object.assign(badge.style, {
        position: 'fixed', right: '16px', bottom: '72px', zIndex: '2147483647',
        background: '#5b1717', color: '#fff', padding: '10px 14px', border: '2px solid #fff',
        font: '700 13px/1.35 system-ui, sans-serif', maxWidth: '390px', boxShadow: '0 6px 24px rgba(0,0,0,.3)'
      });
      document.documentElement.appendChild(badge);
    }
    badge.textContent = message;
  }

  let firstSeenAt = 0;
  let reported = false;

  async function reportBoundary(rootInfo, payload) {
    if (reported) return;
    reported = true;
    state.blocked = true;
    state.kind = rootInfo.surface.kind;
    state.reason = rootInfo.surface.reason || 'payment required';
    state.prices = guard.extractPrices(rootInfo.text);

    const policy = payload?.paymentPolicy === 'show-paid' ? 'show-paid' : 'free-only';
    const result = {
      runId: payload?.runId || '',
      status: 'payment required',
      reviewer: payload?.reviewer || null,
      song: payload?.song || null,
      reason: state.reason,
      prices: state.prices,
      paymentPolicy: policy,
      completedAt: Date.now()
    };

    await runtimeSend({ type: 'SAVE_NERO_RESULT', value: result }).catch(() => {});
    await runtimeSend({ type: 'CLEAR_NERO_SUBMISSION' }).catch(() => {});

    const priceCopy = state.prices.length ? ` (${state.prices.join(', ')})` : '';
    showBoundaryBadge(policy === 'show-paid'
      ? `LiveFinder paused at a paid step${priceCopy}. Continue manually only if you want to pay.`
      : `LiveFinder stopped: payment is required${priceCopy}. No charge was attempted.`);
    console.warn('[LiveFinder] payment boundary', result);
  }

  async function inspect() {
    if (reported) return;
    const rootInfo = roots()[0];
    if (!rootInfo) {
      firstSeenAt = 0;
      return;
    }

    // Optional add-ons and queue acceleration are not hard stops when a verified
    // free path exists; addon-bypass / Nero's wait handler own those paths.
    if (freeExit(rootInfo)) {
      firstSeenAt = 0;
      return;
    }

    if (!['payment-required', 'monetized-unknown', 'optional-upsell'].includes(rootInfo.surface.kind)) {
      firstSeenAt = 0;
      return;
    }

    if (!firstSeenAt) firstSeenAt = Date.now();
    if (Date.now() - firstSeenAt < 1200) return; // allow late-rendered free exits to appear

    let response;
    try { response = await runtimeSend({ type: 'GET_NERO_SUBMISSION' }); } catch { return; }
    const payload = response?.record?.payload;
    if (!payload || payload.source !== 'livefinder' || !sameReviewer(payload?.reviewer?.neroUrl)) return;
    await reportBoundary(rootInfo, payload);
  }

  // Safety backstop: block LiveFinder-style programmatic clicks on genuine paid
  // boundaries. The known Nero queue-options screen is excluded here because its
  // existing controller uses a neutral Next transition before selecting the
  // explicit free "I'll wait" choice. Paid skip buttons remain untouched by that
  // controller and are separately classified as paid actions.
  document.addEventListener('click', event => {
    if (event.isTrusted) return;
    const rootInfo = roots()[0];
    if (!rootInfo || rootInfo.surface.kind === 'queue-options') return;
    const target = event.target instanceof Element ? event.target.closest('button, [role="button"], a') : null;
    if (!target) return;
    const label = target.innerText || target.textContent || target.getAttribute?.('aria-label') || '';
    const decision = guard.actionDecision(label, rootInfo.text).decision;
    if (decision === 'safe-free') return;
    if (!rootInfo.surface.monetized) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn('[LiveFinder] blocked programmatic action on monetized surface:', guard.norm(label));
  }, true);

  inspect();
  const observer = new MutationObserver(inspect);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(inspect, 450);
})();
