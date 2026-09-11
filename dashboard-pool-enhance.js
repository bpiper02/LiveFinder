(() => {
  const STORAGE_KEY = 'nero-router-state-v1';
  const EXT_SOURCE = 'livefinder-extension';
  const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
  let poolItems = [];
  let scheduled = false;

  const norm = value => String(value || '').trim().toLowerCase();

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.submissions ||= [];
      return state;
    } catch {
      return { submissions: [] };
    }
  }

  function reviewerKey(url) {
    try {
      const parsed = new URL(String(url || ''));
      return decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[0] || '').replace(/^@/, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function poolItemForReviewer(url) {
    const key = reviewerKey(url);
    return poolItems.find(item => String(item?.handle || '').toLowerCase() === key) || null;
  }

  function currentSubmissionFor(url) {
    const key = reviewerKey(url);
    if (!key) return null;
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    return readState().submissions
      .filter(item => reviewerKey(item?.reviewerUrl) === key)
      .filter(item => Number(item?.createdAtMs || 0) >= cutoff)
      .filter(item => ['automation started', 'queued', 'submitted'].includes(String(item?.status || '').toLowerCase()))
      .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))[0] || null;
  }

  function streamLabel(item) {
    const platform = String(item?.streamPlatform || 'stream').trim();
    if (item?.streamConfidence === 'social') return `Open ${platform} ↗`;
    return `Open ${platform} live ↗`;
  }

  function addStreamLink(container, item) {
    if (!container || !item?.streamUrl) return;
    let link = container.querySelector(':scope > .livefinderStreamLink');
    if (!link) {
      link = document.createElement('a');
      link.className = 'livefinderStreamLink';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      container.appendChild(link);
    }
    link.href = item.streamUrl;
    link.textContent = streamLabel(item);
    link.title = item.streamDerived ? 'LiveFinder derived the live path from the social profile Nero exposes.' : 'Open the stream destination Nero exposes.';
  }

  function neroUrlFromPoolCard(card) {
    const select = card.querySelector('select[data-pool-url]');
    if (select?.dataset.poolUrl) return select.dataset.poolUrl;
    const smalls = [...card.querySelectorAll('small')];
    return smalls.map(el => el.textContent.trim()).find(text => /^https?:\/\/(?:www\.)?nero\.fan\//i.test(text)) || '';
  }

  function decoratePool() {
    const submittedColumn = document.getElementById('poolSubmitted');
    if (!submittedColumn) return;

    const sourceColumns = ['poolLive', 'poolOpen', 'poolOther'];
    for (const id of sourceColumns) {
      const column = document.getElementById(id);
      if (!column) continue;
      for (const card of [...column.querySelectorAll('.poolCard')]) {
        const url = neroUrlFromPoolCard(card);
        const item = poolItemForReviewer(url);
        if (item) addStreamLink(card, item);
        const submission = currentSubmissionFor(url);
        if (!submission) continue;

        const select = card.querySelector('select[data-pool-url]');
        if (select) {
          select.disabled = true;
          select.title = 'Already submitted to this reviewer recently.';
        }
        const chip = card.querySelector('.statusChip');
        if (chip) chip.textContent = submission.status === 'submitted' ? 'submitted' : submission.status;
        card.dataset.livefinderSubmitted = '1';
        submittedColumn.appendChild(card);
      }
    }

    if (!submittedColumn.querySelector('.poolCard')) {
      submittedColumn.innerHTML = '<p class="empty">No recent submissions in this pool.</p>';
    } else {
      submittedColumn.querySelectorAll('.empty').forEach(el => el.remove());
    }
  }

  function decorateHistory() {
    const rows = document.getElementById('submissionRows');
    if (!rows) return;
    for (const row of rows.querySelectorAll('.tr')) {
      const reviewer = row.querySelector('.historyReviewer');
      if (!reviewer?.href) continue;
      const item = poolItemForReviewer(reviewer.href);
      if (!item?.streamUrl) continue;
      const cell = reviewer.parentElement;
      if (!cell) continue;
      addStreamLink(cell, item);
    }
  }

  function run() {
    scheduled = false;
    decoratePool();
    decorateHistory();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== EXT_SOURCE) return;
    if (message.type === 'NERO_POOL') {
      poolItems = Array.isArray(message.pool?.items) ? message.pool.items : [];
      schedule();
    }
    if (message.type === 'NERO_STATUS' || message.type === 'DASHBOARD_RUNS') schedule();
  });

  const root = document.querySelector('.discovery') || document.body;
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  const history = document.getElementById('submissionRows');
  if (history) observer.observe(history, { childList: true, subtree: true });

  schedule();
})();
