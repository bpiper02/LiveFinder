(() => {
  const norm = value => String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const FREE_EXIT_LABELS = new Set([
    "i'm good",
    'im good',
    "i'm all set",
    'im all set',
    'no thanks',
    'no, thanks',
    'not now',
    'maybe later',
    'continue without add-ons',
    'continue without addons',
    'continue without add ons',
    'continue without extras',
    'continue without upgrade',
    'skip add-ons',
    'skip addons',
    'decline add-ons',
    'decline addons',
    "i'll wait",
    'ill wait',
    'wait for free',
    'wait for free submission',
    'wait in the free queue',
    'join the free queue',
    'free queue',
    'use free option',
    'continue free'
  ]);

  const HARD_PAID_RE = /(?:\$\s?\d|\b(?:usd|eur|gbp|cad|aud)\s?\d|\b(?:pay|purchase|buy|checkout|billing|card number|credit card|debit card|apple pay|google pay|paypal|super skip|throne)\b)/i;
  const UPSELL_RE = /\b(?:add[- ]?ons?|enhance your submission|cover art|motion cover|featured placement|featured submission|feature submission)\b/i;
  const QUEUE_RE = /\b(?:ahead of you|queue|super skip|throne|skip)\b/i;
  const PAYMENT_FORM_RE = /\b(?:card number|expiry|expiration|cvv|cvc|billing address|checkout|payment method|apple pay|google pay|paypal)\b/i;

  function hasMoney(text) {
    return /(?:[$€£]\s?\d|\b(?:usd|eur|gbp|cad|aud)\s?\d)/i.test(String(text || ''));
  }

  function isVerifiedFreeLabel(value) {
    const label = norm(value);
    if (!label || HARD_PAID_RE.test(label) || hasMoney(label)) return false;
    return FREE_EXIT_LABELS.has(label);
  }

  function isPaidActionLabel(value) {
    const label = norm(value);
    if (!label) return false;
    if (isVerifiedFreeLabel(label)) return false;
    return HARD_PAID_RE.test(label) || hasMoney(label) || /\bskip\b/i.test(label);
  }

  function isSafeQueueWaitAction(label, surfaceText = '') {
    const normalized = norm(label);
    if (!/\bwait\b/.test(normalized)) return false;
    return actionDecision(label, surfaceText).decision === 'safe-free';
  }

  function classifySurfaceText(value) {
    const text = norm(value);
    if (!text) return { kind: 'none', monetized: false, reason: '' };

    const hasFreeExit = [...FREE_EXIT_LABELS].some(label => text.includes(label));
    const paymentForm = PAYMENT_FORM_RE.test(text);
    const priced = hasMoney(text) || HARD_PAID_RE.test(text);

    if (QUEUE_RE.test(text) && (text.includes('ahead of you') || /super skip|throne/.test(text))) {
      return { kind: 'queue-options', monetized: priced, reason: priced ? 'paid queue acceleration offered' : 'queue options detected' };
    }

    if (UPSELL_RE.test(text) && (priced || hasFreeExit)) {
      return { kind: 'optional-upsell', monetized: true, reason: hasFreeExit ? 'optional paid add-ons with a free exit' : 'paid add-ons detected' };
    }

    if (paymentForm || (priced && /\b(?:submit|submission|continue|proceed|pay|purchase|checkout)\b/.test(text) && !hasFreeExit)) {
      return { kind: 'payment-required', monetized: true, reason: paymentForm ? 'payment form detected' : 'payment appears required to continue' };
    }

    if (priced) return { kind: 'monetized-unknown', monetized: true, reason: 'priced action detected' };
    return { kind: 'none', monetized: false, reason: '' };
  }

  function extractPrices(value) {
    const text = String(value || '');
    const matches = text.match(/(?:[$€£]\s?\d+(?:\.\d{1,2})?|\b(?:USD|EUR|GBP|CAD|AUD)\s?\d+(?:\.\d{1,2})?)/gi) || [];
    return [...new Set(matches.map(item => item.replace(/\s+/g, ' ').trim()))].slice(0, 8);
  }

  function actionDecision(label, surfaceText = '') {
    const normalized = norm(label);
    if (isVerifiedFreeLabel(normalized)) return { decision: 'safe-free', reason: 'verified free action' };
    if (isPaidActionLabel(normalized)) return { decision: 'blocked-paid', reason: 'paid or ambiguous monetized action' };
    const surface = classifySurfaceText(surfaceText);
    if (surface.monetized) return { decision: 'blocked-unknown', reason: 'unverified action on monetized surface' };
    return { decision: 'neutral', reason: 'not a monetized action' };
  }

  const api = {
    norm,
    hasMoney,
    isVerifiedFreeLabel,
    isPaidActionLabel,
    isSafeQueueWaitAction,
    classifySurfaceText,
    extractPrices,
    actionDecision,
    FREE_EXIT_LABELS: [...FREE_EXIT_LABELS]
  };

  globalThis.LiveFinderPaymentGuard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
