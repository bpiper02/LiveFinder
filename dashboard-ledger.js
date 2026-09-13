(() => {
  const STORAGE_KEY = 'nero-router-state-v1';
  const WEB_SOURCE = 'livefinder-web';
  const EXT_SOURCE = 'livefinder-extension';
  const STATUS_RANK = {
    unknown: 0,
    'automation started': 1,
    queued: 2,
    submitted: 4,
    'payment required': 4,
    failed: 4
  };
  const TERMINAL_STATUSES = new Set(['submitted', 'payment required', 'failed']);
  let reloadScheduled = false;

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.songs ||= [];
      state.reviewers ||= [];
      state.submissions ||= [];
      return state;
    } catch {
      return { songs: [], reviewers: [], submissions: [] };
    }
  }

  function rank(status) {
    return STATUS_RANK[String(status || 'unknown').toLowerCase()] ?? 0;
  }

  function mergeRuns(runs) {
    const state = readState();
    let changed = false;

    for (const run of runs) {
      if (!run?.id || !run?.reviewerUrl) continue;
      const existing = state.submissions.find(item => item.id === run.id);
      const next = {
        id: String(run.id),
        reviewerUrl: String(run.reviewerUrl || ''),
        reviewer: String(run.reviewer || ''),
        songId: String(run.songId || ''),
        song: String(run.song || ''),
        status: String(run.status || 'automation started').toLowerCase(),
        queueAhead: Number.isFinite(run.queueAhead) ? Number(run.queueAhead) : null,
        streamUrl: String(run.streamUrl || ''),
        sessionId: String(run.sessionId || ''),
        paymentPolicy: run.paymentPolicy === 'show-paid' ? 'show-paid' : 'free-only',
        paymentReason: String(run.paymentReason || ''),
        paymentPrices: Array.isArray(run.paymentPrices) ? run.paymentPrices.map(String) : [],
        createdAt: new Date(Number(run.createdAtMs || Date.now())).toLocaleString(),
        createdAtMs: Number(run.createdAtMs || Date.now())
      };

      if (!existing) {
        state.submissions.unshift(next);
        changed = true;
        continue;
      }

      for (const key of ['reviewerUrl', 'reviewer', 'songId', 'song', 'streamUrl', 'sessionId', 'paymentReason']) {
        if (next[key] && existing[key] !== next[key]) {
          existing[key] = next[key];
          changed = true;
        }
      }
      if (next.paymentPolicy && existing.paymentPolicy !== next.paymentPolicy) {
        existing.paymentPolicy = next.paymentPolicy;
        changed = true;
      }
      if (next.paymentPrices.length && JSON.stringify(existing.paymentPrices || []) !== JSON.stringify(next.paymentPrices)) {
        existing.paymentPrices = next.paymentPrices;
        changed = true;
      }

      const existingStatus = String(existing.status || 'unknown').toLowerCase();
      if (rank(next.status) > rank(existingStatus) || (!TERMINAL_STATUSES.has(existingStatus) && TERMINAL_STATUSES.has(next.status))) {
        existing.status = next.status;
        changed = true;
      }
      if (Number.isFinite(next.queueAhead) && existing.queueAhead !== next.queueAhead) {
        existing.queueAhead = next.queueAhead;
        changed = true;
      }
    }

    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { changed, state };
  }

  function requestRuns() {
    window.postMessage({ source: WEB_SOURCE, type: 'REQUEST_DASHBOARD_RUNS' }, '*');
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== EXT_SOURCE) return;

    if (message.type === 'BRIDGE_READY') requestRuns();

    if (message.type === 'DASHBOARD_RUNS') {
      const runs = Array.isArray(message.response?.runs) ? message.response.runs : [];
      if (!runs.length) return;

      const { changed, state } = mergeRuns(runs);
      const terminalIds = runs
        .map(run => state.submissions.find(item => item.id === run?.id))
        .filter(item => TERMINAL_STATUSES.has(String(item?.status || '').toLowerCase()))
        .map(item => item.id);

      if (terminalIds.length) {
        window.postMessage({ source: WEB_SOURCE, type: 'ACK_DASHBOARD_RUNS', ids: terminalIds }, '*');
      }

      if (changed && !reloadScheduled) {
        reloadScheduled = true;
        setTimeout(() => location.reload(), 80);
      }
    }
  });

  requestRuns();
  setInterval(requestRuns, 2000);
})();
