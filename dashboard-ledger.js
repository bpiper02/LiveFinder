(() => {
  const STORAGE_KEY = 'nero-router-state-v1';
  const WEB_SOURCE = 'livefinder-web';
  const EXT_SOURCE = 'livefinder-extension';
  let handled = false;

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

  function mergeRuns(runs) {
    const state = readState();
    let changed = false;

    for (const run of runs) {
      if (!run?.id || !run?.reviewerUrl) continue;
      const existing = state.submissions.find(item => item.id === run.id);
      const next = {
        id: run.id,
        reviewerUrl: String(run.reviewerUrl || ''),
        reviewer: String(run.reviewer || ''),
        songId: String(run.songId || ''),
        song: String(run.song || ''),
        status: String(run.status || 'automation started'),
        queueAhead: Number.isFinite(run.queueAhead) ? run.queueAhead : null,
        createdAt: new Date(Number(run.createdAtMs || Date.now())).toLocaleString(),
        createdAtMs: Number(run.createdAtMs || Date.now())
      };

      if (!existing) {
        state.submissions.unshift(next);
        changed = true;
        continue;
      }

      for (const key of ['reviewerUrl','reviewer','songId','song','status','queueAhead']) {
        if (existing[key] !== next[key]) {
          existing[key] = next[key];
          changed = true;
        }
      }
    }

    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return changed;
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

      const changed = mergeRuns(runs);
      const importedIds = runs.map(run => run?.id).filter(Boolean);
      if (importedIds.length) {
        window.postMessage({ source: WEB_SOURCE, type: 'ACK_DASHBOARD_RUNS', ids: importedIds }, '*');
      }

      if (changed && !handled) {
        handled = true;
        setTimeout(() => location.reload(), 80);
      }
    }
  });

  requestRuns();
  const timer = setInterval(requestRuns, 2000);
  setTimeout(() => clearInterval(timer), 12000);
})();
