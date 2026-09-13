(() => {
  const PROVIDERS = {
    nero: {
      id: 'nero',
      label: 'Nero',
      hosts: ['nero.fan', 'www.nero.fan'],
      supportsAssist: true,
      supportsFullAuto: true
    },
    auxchord: {
      id: 'auxchord',
      label: 'AuxChord',
      hosts: ['auxchord.app', 'www.auxchord.app'],
      supportsAssist: true,
      supportsFullAuto: true
    },
    tunetavern: {
      id: 'tunetavern',
      label: 'Tune Tavern',
      hosts: ['tunetavern.app', 'www.tunetavern.app'],
      supportsAssist: true,
      supportsFullAuto: false
    }
  };

  const cleanHandle = value => decodeURIComponent(String(value || '')).trim().replace(/^@/, '');

  function parseUrl(value) {
    try { return new URL(value); } catch { return null; }
  }

  function detectProvider(value) {
    const url = parseUrl(value);
    if (!url) return null;
    const host = url.hostname.toLowerCase();
    return Object.values(PROVIDERS).find(provider => provider.hosts.includes(host)) || null;
  }

  function contextForUrl(value) {
    const url = parseUrl(value);
    const provider = detectProvider(value);
    if (!url || !provider) return null;
    const parts = url.pathname.split('/').filter(Boolean);

    if (provider.id === 'nero') {
      const handle = cleanHandle(parts[0]);
      if (!handle || handle.toLowerCase() === 'discover') {
        return { provider: 'nero', supported: false, kind: 'discovery', url: url.href };
      }
      return {
        provider: 'nero',
        providerLabel: provider.label,
        supported: true,
        kind: 'reviewer',
        handle,
        reviewerUrl: `https://www.nero.fan/${handle}/live`,
        url: url.href,
        supportsAssist: true,
        supportsFullAuto: true
      };
    }

    if (provider.id === 'auxchord') {
      if (!parts.length) return { provider: 'auxchord', supported: false, kind: 'home', url: url.href };
      const first = cleanHandle(parts[0]);
      const isHandle = parts[0].startsWith('@');
      const handle = isHandle ? first : '';
      const numericId = /^\d+$/.test(parts[0]) ? parts[0] : '';
      const kind = handle ? (parts.includes('live') ? 'live-review' : 'creator') : (numericId ? 'creator' : 'page');
      return {
        provider: 'auxchord',
        providerLabel: provider.label,
        supported: !!(handle || numericId),
        kind,
        handle,
        reviewerId: numericId,
        reviewerUrl: url.origin + url.pathname,
        url: url.href,
        supportsAssist: true,
        supportsFullAuto: true
      };
    }

    if (provider.id === 'tunetavern') {
      if (parts[0] === 'browse-live') {
        return { provider: 'tunetavern', providerLabel: provider.label, supported: false, kind: 'discovery', url: url.href, supportsAssist: true, supportsFullAuto: false };
      }
      if (parts[0] === 'live' && parts[1]) {
        const handle = cleanHandle(parts[1]);
        return {
          provider: 'tunetavern',
          providerLabel: provider.label,
          supported: true,
          kind: 'live-review',
          handle,
          reviewerUrl: `${url.origin}/live/${encodeURIComponent(handle)}`,
          url: url.href,
          supportsAssist: true,
          supportsFullAuto: false
        };
      }
      return { provider: 'tunetavern', providerLabel: provider.label, supported: false, kind: 'page', url: url.href, supportsAssist: true, supportsFullAuto: false };
    }

    return null;
  }

  function providerLabel(id) {
    return PROVIDERS[id]?.label || String(id || 'Unknown');
  }

  const api = { PROVIDERS, detectProvider, contextForUrl, providerLabel };
  globalThis.LiveFinderProviders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
