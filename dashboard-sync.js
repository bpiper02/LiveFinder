(() => {
  const STORAGE_KEY = 'nero-router-state-v1';
  const SOURCE = 'livefinder-web';
  const EXT_SOURCE = 'livefinder-extension';
  let lastSignature = '';
  let latestPool = [];
  let watchedQueues = 0;

  const $ = id => document.getElementById(id);
  const count = value => String(Math.max(0, Number(value) || 0)).padStart(3, '0');

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.songs ||= [];
      state.submissions ||= [];
      return state;
    } catch {
      return { songs: [], submissions: [] };
    }
  }

  function readSongs() {
    return readState().songs;
  }

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

  function setConnection(text) {
    const el = $('connectionState');
    if (el) el.textContent = text;
  }

  function sync(force = false) {
    const songs = readSongs().map(song => ({
      id: String(song?.id || ''),
      artist: String(song?.artist || ''),
      title: String(song?.title || ''),
      email: String(song?.email || ''),
      instagram: String(song?.instagram || ''),
      songUrl: String(song?.songUrl || ''),
      note: String(song?.note || '')
    })).filter(song => song.id && song.artist && song.title);

    const signature = JSON.stringify(songs);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    window.postMessage({ source: SOURCE, type: 'SYNC_SONG_LIBRARY', songs, syncedAt: Date.now() }, '*');
    refreshStats();
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (message?.source !== EXT_SOURCE) return;
    if (message.type === 'BRIDGE_CONNECTING') setConnection('WAKING EXTENSION...');
    if (message.type === 'BRIDGE_READY') {
      sync(true);
      setConnection(`ONLINE${message.version ? ` v${message.version}` : ''}`);
    }
    if (message.type === 'EXTENSION_CONTEXT_STALE') setConnection('STALE / REFRESH');
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
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) sync(true);
  });
  window.addEventListener('focus', () => sync(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync(true);
  });

  sync(true);
  refreshStats();
  setInterval(() => { sync(); refreshStats(); }, 1500);
})();
