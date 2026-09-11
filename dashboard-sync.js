(() => {
  const STORAGE_KEY = 'nero-router-state-v1';
  const SOURCE = 'livefinder-web';
  let lastSignature = '';

  function readSongs() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Array.isArray(state.songs) ? state.songs : [];
    } catch {
      return [];
    }
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
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (message?.source === 'livefinder-extension' && message.type === 'BRIDGE_READY') sync(true);
  });
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) sync(true);
  });
  window.addEventListener('focus', () => sync(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync(true);
  });

  sync(true);
  setInterval(sync, 1500);
})();
