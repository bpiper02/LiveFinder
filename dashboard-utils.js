(() => {
  const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const ACTIVE_STATUSES = new Set(['automation started', 'queued', 'submitted']);
  const GENERIC_LABELS = new Set([
    '',
    'nero reviewer',
    '@nero reviewer',
    'reviewer',
    '@live',
    '@submit',
    '@submission',
    '@review',
    'live',
    'submit',
    'submission',
    'review'
  ]);

  function normalizeNeroUrl(input) {
    let url = String(input || '').trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const parsed = new URL(url);
    if (!/(^|\.)nero\.fan$/i.test(parsed.hostname)) throw new Error('Not a Nero URL');
    parsed.hostname = 'www.nero.fan';
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  }

  function reviewerKey(url) {
    try {
      const parsed = new URL(normalizeNeroUrl(url));
      return decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[0] || '')
        .replace(/^@/, '')
        .toLowerCase();
    } catch {
      return '';
    }
  }

  function reviewerLabel(url) {
    const key = reviewerKey(url);
    return key ? `@${key}` : 'Nero reviewer';
  }

  function isGenericReviewerLabel(value) {
    return GENERIC_LABELS.has(String(value || '').trim().toLowerCase());
  }

  function isActiveSubmission(submission, now = Date.now(), windowMs = ACTIVE_WINDOW_MS) {
    if (!submission) return false;
    const status = String(submission.status || '').trim().toLowerCase();
    if (!ACTIVE_STATUSES.has(status)) return false;
    const createdAtMs = Number(submission.createdAtMs || 0);
    return Number.isFinite(createdAtMs) && createdAtMs >= now - windowMs;
  }

  function activeReviewerKeys(submissions, now = Date.now(), windowMs = ACTIVE_WINDOW_MS) {
    const keys = new Set();
    for (const submission of Array.isArray(submissions) ? submissions : []) {
      if (!isActiveSubmission(submission, now, windowMs)) continue;
      const key = reviewerKey(submission.reviewerUrl);
      if (key) keys.add(key);
    }
    return keys;
  }

  function filterAvailablePool(items, submissions, now = Date.now(), windowMs = ACTIVE_WINDOW_MS) {
    const active = activeReviewerKeys(submissions, now, windowMs);
    return (Array.isArray(items) ? items : []).filter(item => {
      const key = reviewerKey(item?.neroUrl || item?.profileUrl || '');
      return key && !active.has(key);
    });
  }

  function poolSignature(items) {
    return JSON.stringify((Array.isArray(items) ? items : []).map(item => [
      reviewerKey(item?.neroUrl || item?.profileUrl || ''),
      String(item?.status || ''),
      String(item?.displayName || ''),
      String(item?.neroUrl || ''),
      String(item?.streamUrl || ''),
      String(item?.streamPlatform || ''),
      String(item?.streamConfidence || ''),
      Number(item?.submissionCount || 0)
    ]));
  }

  function bestReviewerLabel({ url = '', poolDisplayName = '', savedLabel = '', fallback = '' } = {}) {
    for (const candidate of [poolDisplayName, savedLabel, fallback]) {
      const value = String(candidate || '').trim();
      if (value && !isGenericReviewerLabel(value)) return value;
    }
    return reviewerLabel(url);
  }

  const api = {
    ACTIVE_WINDOW_MS,
    normalizeNeroUrl,
    reviewerKey,
    reviewerLabel,
    isGenericReviewerLabel,
    isActiveSubmission,
    activeReviewerKeys,
    filterAvailablePool,
    poolSignature,
    bestReviewerLabel
  };

  globalThis.LiveFinderDashboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
