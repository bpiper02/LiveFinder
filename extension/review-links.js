(() => {
  function cleanRaw(value) {
    return String(value || '').trim().replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  }

  function parseUrl(raw) {
    let value = cleanRaw(raw);
    if (!value) return null;
    if (/^(?:www\.)?(?:tiktok\.com|youtube\.com|youtu\.be|twitch\.tv|kick\.com|instagram\.com)\//i.test(value)) {
      value = `https://${value.replace(/^www\./i, 'www.')}`;
    }
    try { return new URL(value); } catch { return null; }
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

  function inferredValues(raw, hint = '') {
    const value = cleanRaw(raw);
    if (!value) return [];
    const values = [value];
    const lowerHint = String(hint || '').toLowerCase();
    const token = value.replace(/^@/, '').trim();
    const handleLike = /^[a-z0-9._-]{2,100}$/i.test(token);

    if (/^(?:www\.)?(?:tiktok\.com|youtube\.com|youtu\.be|twitch\.tv|kick\.com|instagram\.com)\//i.test(value)) {
      values.push(`https://${value.replace(/^www\./i, 'www.')}`);
    }

    if (!handleLike) return [...new Set(values)];
    if (/tiktok/.test(lowerHint)) values.push(`https://www.tiktok.com/@${token}`);
    if (/youtube/.test(lowerHint)) {
      if (/channel(?:id)?/.test(lowerHint) && /^UC[a-z0-9_-]+$/i.test(token)) values.push(`https://www.youtube.com/channel/${token}`);
      else values.push(`https://www.youtube.com/@${token}`);
    }
    if (/twitch/.test(lowerHint)) values.push(`https://www.twitch.tv/${token}`);
    if (/kick/.test(lowerHint)) values.push(`https://kick.com/${token}`);
    if (/instagram|\big\b/.test(lowerHint)) values.push(`https://www.instagram.com/${token}`);
    return [...new Set(values)];
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
      const hint = typeof value === 'object' ? value?.hint : '';
      const label = typeof value === 'object' ? value?.label : '';
      for (const inferred of inferredValues(raw, hint)) {
        const candidate = normalizeReviewTarget(inferred, { isLive: options.isLive, hint, label });
        if (candidate) candidates.push(candidate);
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    if (!best) return null;
    if (!['direct', 'derived-live'].includes(best.streamConfidence)) return null;
    return best;
  }

  const api = { cleanRaw, platformFor, inferredValues, normalizeReviewTarget, bestReviewTarget };
  globalThis.LiveFinderReviewLinks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
