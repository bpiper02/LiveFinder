(() => {
  const KEY = 'nero-router-state-v1';
  const EXT_SOURCE = 'livefinder-extension';
  let latestPool = [];
  let watchedQueues = 0;

  const $ = id => document.getElementById(id);
  const count = value => String(Math.max(0, Number(value) || 0)).padStart(3, '0');
  const readState = () => {
    try {
      const state = JSON.parse(localStorage.getItem(KEY) || '{}');
      state.songs ||= [];
      state.submissions ||= [];
      return state;
    } catch {
      return { songs: [], submissions: [] };
    }
  };

  function refreshStats() {
    const state = readState();
    const dashboard = globalThis.LiveFinderDashboard;
    const available = dashboard?.filterAvailablePool
      ? dashboard.filterAvailablePool(latestPool, state.submissions).length
      : latestPool.length;
    if ($('statSongs')) $('statSongs').textContent = count(state.songs.length);
    if ($('statAvailable')) $('statAvailable').textContent = count(available);
    if ($('statQueues')) $('statQueues').textContent = count(watchedQueues);
  }

  function setConnection(text, online = false) {
    const el = $('connectionState');
    if (!el) return;
    el.textContent = text;
    el.dataset.online = online ? '1' : '0';
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== EXT_SOURCE) return;

    if (message.type === 'BRIDGE_READY') {
      setConnection(`ONLINE${message.version ? ` v${message.version}` : ''}`, true);
    }
    if (message.type === 'EXTENSION_CONTEXT_STALE') {
      setConnection('STALE / REFRESH', false);
    }
    if (message.type === 'NERO_POOL') {
      latestPool = Array.isArray(message.pool?.items) ? message.pool.items : [];
      refreshStats();
    }
    if (message.type === 'QUEUE_WATCH_STATE') {
      const watches = Array.isArray(message.response?.watches) ? message.response.watches : [];
      watchedQueues = watches.filter(watch => watch.enabled !== false).length;
      refreshStats();
    }
  });

  const observer = new MutationObserver(refreshStats);
  for (const id of ['songs', 'submissionRows', 'poolLive', 'poolOpen', 'poolOther']) {
    const node = $(id);
    if (node) observer.observe(node, { childList: true, subtree: true });
  }

  refreshStats();
  setInterval(refreshStats, 2000);
})();
