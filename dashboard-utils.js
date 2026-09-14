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

  function comparableMediaKey(input) {
    try {
      const parsed = new URL(String(input || '').trim());
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const path = parsed.pathname.replace(/\/+$/, '') || '/';
      if (host === 'youtu.be') {
        const id = path.split('/').filter(Boolean)[0] || '';
        if (id) return `youtube:video:${id.toLowerCase()}`;
      }
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        const watchId = parsed.searchParams.get('v');
        if (/^\/watch\/?$/i.test(path) && watchId) return `youtube:video:${watchId.toLowerCase()}`;
        const direct = path.match(/^\/(?:shorts|embed|live)\/([^/]+)/i);
        if (direct?.[1]) return `youtube:video:${direct[1].toLowerCase()}`;
      }
      if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
        const video = path.match(/^\/@[^/]+\/video\/(\d+)/i);
        if (video?.[1]) return `tiktok:video:${video[1]}`;
      }
      for (const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','si','feature','fbclid','gclid']) parsed.searchParams.delete(key);
      const params = [...parsed.searchParams.entries()].sort(([a],[b]) => a.localeCompare(b));
      parsed.search = '';
      for (const [key, value] of params) parsed.searchParams.append(key, value);
      return `${host}${path}${parsed.search}`.toLowerCase();
    } catch {
      return '';
    }
  }

  function isKnownSongLink(url, songs = []) {
    const key = comparableMediaKey(url);
    if (!key) return false;
    return (Array.isArray(songs) ? songs : []).some(song => comparableMediaKey(song?.songUrl || song) === key);
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
    comparableMediaKey,
    isKnownSongLink,
    isActiveSubmission,
    activeReviewerKeys,
    filterAvailablePool,
    poolSignature,
    bestReviewerLabel
  };

  globalThis.LiveFinderDashboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
