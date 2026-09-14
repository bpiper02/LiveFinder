(() => {
  const KEY = 'nero-router-state-v1';
  const dashboard = globalThis.LiveFinderDashboard;
  if (!dashboard?.isKnownSongLink) return;

  const REVIEW_KEYS = ['streamUrl','streamPlatform','streamConfidence','streamDerived','reviewUrl','reviewPlatform','reviewConfidence'];

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }

  function contaminated(record, songs) {
    return dashboard.isKnownSongLink(record?.streamUrl, songs) || dashboard.isKnownSongLink(record?.reviewUrl, songs);
  }

  function scrubRecord(record, songs) {
    if (!record || !contaminated(record, songs)) return false;
    for (const key of REVIEW_KEYS) delete record[key];
    return true;
  }

  function scrubStoredState() {
    const state = readState();
    const songs = Array.isArray(state.songs) ? state.songs : [];
    let changed = false;
    for (const reviewer of Array.isArray(state.reviewers) ? state.reviewers : []) changed = scrubRecord(reviewer, songs) || changed;
    for (const submission of Array.isArray(state.submissions) ? state.submissions : []) changed = scrubRecord(submission, songs) || changed;
    if (changed) localStorage.setItem(KEY, JSON.stringify(state));
    return { songs, changed };
  }

  function guardRenderedLinks() {
    const { songs } = scrubStoredState();
    if (!songs.length) return;
    for (const anchor of document.querySelectorAll('a.poolReviewerLink[href], a.historyReviewer[href]')) {
      if (!dashboard.isKnownSongLink(anchor.href, songs)) continue;
      const poolUrl = anchor.closest('.poolCard')?.querySelector('select[data-pool-url]')?.dataset?.poolUrl || '';
      if (poolUrl) {
        try {
          anchor.href = dashboard.normalizeNeroUrl(poolUrl);
          const small = anchor.querySelector('small');
          if (small) small.textContent = 'Nero ↗';
          anchor.title = 'Open reviewer on Nero';
          continue;
        } catch {}
      }
      anchor.removeAttribute('href');
      anchor.title = 'Reviewer live link hidden because it matched a saved song URL.';
      const small = anchor.querySelector('small');
      if (small) small.textContent = 'Reviewer link unavailable';
    }
  }

  scrubStoredState();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guardRenderedLinks, { once: true });
  else guardRenderedLinks();

  const observer = new MutationObserver(() => guardRenderedLinks());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
})();
