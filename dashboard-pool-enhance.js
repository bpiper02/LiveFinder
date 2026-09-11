(() => {
  const STORAGE_KEY = 'nero-router-state-v1';
  const EXT_SOURCE = 'livefinder-extension';
  const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
  let poolItems = [];
  let scheduled = false;
  let poolRefreshPending = false;

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
    if (!container) return;
    let link = container.querySelector(':scope > .livefinderStreamLink');
    if (!item?.streamUrl) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement('a');
      link.className = 'livefinderStreamLink';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      container.appendChild(link);
    }

    const label = streamLabel(item);
    const title = item.streamDerived
      ? 'LiveFinder derived the live path from the social profile Nero exposes.'
      : 'Open the stream destination Nero exposes.';

    if (link.getAttribute('href') !== item.streamUrl) link.setAttribute('href', item.streamUrl);
    if (link.textContent !== label) link.textContent = label;
    if (link.title !== title) link.title = title;
  }

  function neroUrlFromPoolCard(card) {
    const select = card.querySelector('select[data-pool-url]');
    if (select?.dataset.poolUrl) return select.dataset.poolUrl;
    const smalls = [...card.querySelectorAll('small')];
    return smalls.map(el => el.textContent.trim()).find(text => /^https?:\/\/(?:www\.)?nero\.fan\//i.test(text)) || '';
  }

  function existingSubmittedCard(column, key) {
    return [...column.querySelectorAll('.poolCard')].find(card => card.dataset.livefinderReviewerKey === key) || null;
  }

  function decoratePool() {
    const submittedColumn = document.getElementById('poolSubmitted');
    if (!submittedColumn) return;

    if (poolRefreshPending) {
      submittedColumn.querySelectorAll('.poolCard').forEach(card => card.remove());
      poolRefreshPending = false;
    }

    for (const id of ['poolLive', 'poolOpen', 'poolOther']) {
      const column = document.getElementById(id);
      if (!column) continue;

      for (const card of [...column.querySelectorAll('.poolCard')]) {
        const url = neroUrlFromPoolCard(card);
        const key = reviewerKey(url);
        const item = poolItemForReviewer(url);
        addStreamLink(card, item);

        const oldSubmitted = key ? existingSubmittedCard(submittedColumn, key) : null;
        const submission = currentSubmissionFor(url);
        if (!submission) {
          oldSubmitted?.remove();
          continue;
        }

        if (oldSubmitted && oldSubmitted !== card) oldSubmitted.remove();
        const select = card.querySelector('select[data-pool-url]');
        if (select && !select.disabled) {
          select.disabled = true;
          select.title = 'Already submitted to this reviewer recently.';
        }
        const chip = card.querySelector('.statusChip');
        const status = submission.status === 'submitted' ? 'submitted' : submission.status;
        if (chip && chip.textContent !== status) chip.textContent = status;
        card.dataset.livefinderSubmitted = '1';
        card.dataset.livefinderReviewerKey = key;
        submittedColumn.appendChild(card);
      }
    }

    const hasCards = !!submittedColumn.querySelector('.poolCard');
    const empty = submittedColumn.querySelector(':scope > .empty');
    if (!hasCards && !empty) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No recent submissions in this pool.';
      submittedColumn.appendChild(p);
    }
    if (hasCards && empty) empty.remove();
  }

  function decorateHistory() {
    const rows = document.getElementById('submissionRows');
    if (!rows) return;
    for (const row of rows.querySelectorAll('.tr')) {
      const reviewer = row.querySelector('.historyReviewer');
      if (!reviewer?.href) continue;
      const cell = reviewer.parentElement;
      if (!cell) continue;
      addStreamLink(cell, poolItemForReviewer(reviewer.href));
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
      poolRefreshPending = true;
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
