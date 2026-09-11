(() => {
  const RESERVED_NERO_ROUTES = new Set([
    'discover','learn','docs','home','login','signup','terms','privacy','support','pricing','about','create',
    'careers','career','jobs','games','game','partner-program','partners','partner','company','product','products',
    'features','feature','faq','contact','blog','press','legal','cookies','settings','account','profile','dashboard',
    'creators','artists','teams','business','enterprise','community','help','download','app','api','status',
    '_next','assets','static','images','favicon.ico','robots.txt','sitemap.xml'
  ]);

  function parseReviewerUrl(value, base = 'https://www.nero.fan') {
    try {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const url = new URL(raw, base);
      if (!/(^|\.)nero\.fan$/i.test(url.hostname)) return null;

      const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
      if (!parts.length) return null;

      const handle = parts[0].replace(/^@/, '');
      if (!handle || handle.length > 100 || /[\s/?#]/.test(handle)) return null;
      if (RESERVED_NERO_ROUTES.has(handle.toLowerCase())) return null;
      if (!/^[a-z0-9._-]{2,100}$/i.test(handle)) return null;

      const livePath = parts.slice(1).some(part => part.toLowerCase() === 'live');
      const encoded = encodeURIComponent(handle);
      return {
        handle,
        profileUrl: `https://www.nero.fan/${encoded}`,
        targetUrl: livePath ? `https://www.nero.fan/${encoded}/live` : `https://www.nero.fan/${encoded}`,
        livePath,
        pathParts: parts
      };
    } catch {
      return null;
    }
  }

  function validReviewerUrl(value) {
    return !!parseReviewerUrl(value);
  }

  const api = { RESERVED_NERO_ROUTES, parseReviewerUrl, validReviewerUrl };
  globalThis.LiveFinderUrl = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
