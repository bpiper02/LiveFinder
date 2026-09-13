(() => {
  function cleanRaw(value) {
    return String(value || '').trim().replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  }

  function parseUrl(raw) {
    try { return new URL(cleanRaw(raw)); } catch { return null; }
  }

  function platformFor(input) {
    const url = input instanceof URL ? input : parseUrl(input);
    if (!url) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok';
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'YouTube';
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return 'Twitch';
    if (host === 'kick.com' || host.endsWith('.kick.com')) return 'Kick';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram';
    return '';
  }

  function normalizeReviewTarget(raw, options = {}) {
    const url = parseUrl(raw);
    if (!url) return null;
    const platform = platformFor(url);
    if (!platform) return null;

    const isLive = !!options.isLive;
    const hint = String(options.hint || '').toLowerCase();
    const label = String(options.label || '').toLowerCase();
    url.hash = '';

    const path = url.pathname;
    const lowerPath = path.toLowerCase();
    let confidence = 'social';
    let derived = false;
    let score = 20;

    if (platform === 'TikTok' && /^\/@[^/]+\/live\/?$/i.test(path)) {
      confidence = 'direct'; score = 180;
    } else if (platform === 'YouTube' && (/^\/watch$/i.test(path) || /\/live(?:\/|$)/i.test(path) || url.hostname.toLowerCase() === 'youtu.be')) {
      confidence = 'direct'; score = 180;
    } else if ((platform === 'Twitch' || platform === 'Kick') && /^\/[^/]+\/?$/i.test(path) && isLive) {
      confidence = 'direct'; score = 165;
    } else if (platform === 'Instagram' && /\/live(?:\/|$)/i.test(lowerPath)) {
      confidence = 'direct'; score = 160;
    } else if (isLive && platform === 'TikTok' && /^\/@[^/]+\/?$/i.test(path)) {
      url.pathname = `${path.replace(/\/$/, '')}/live`;
      confidence = 'derived-live'; derived = true; score = 155;
    } else if (isLive && platform === 'YouTube' && (/^\/@[^/]+\/?$/i.test(path) || /^\/channel\/[^/]+\/?$/i.test(path))) {
      url.pathname = `${path.replace(/\/$/, '')}/live`;
      confidence = 'derived-live'; derived = true; score = 150;
    } else if (platform === 'TikTok' || platform === 'YouTube') {
      score = 60;
    } else if (platform === 'Twitch' || platform === 'Kick') {
      score = 55;
    } else if (platform === 'Instagram') {
      score = 35;
    }

    if (/live|stream|broadcast|watch|review/.test(hint)) score += 28;
    if (/tiktok|youtube|twitch|kick|instagram|live|watch/.test(label)) score += 12;

    return {
      streamUrl: url.toString(),
      streamPlatform: platform,
      streamConfidence: confidence,
      streamDerived: derived,
      score
    };
  }

  function bestReviewTarget(values, options = {}) {
    const candidates = [];
    for (const value of values || []) {
      const raw = typeof value === 'string' ? value : value?.value;
      const candidate = normalizeReviewTarget(raw, {
        isLive: options.isLive,
        hint: typeof value === 'object' ? value?.hint : '',
        label: typeof value === 'object' ? value?.label : ''
      });
      if (candidate) candidates.push(candidate);
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    if (!best) return null;
    if (!['direct', 'derived-live'].includes(best.streamConfidence)) return null;
    return best;
  }

  const api = { cleanRaw, platformFor, normalizeReviewTarget, bestReviewTarget };
  globalThis.LiveFinderReviewLinks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
