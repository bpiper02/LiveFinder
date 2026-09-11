const DB_NAME = 'livefinder-extension';
const STORE_NAME = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function put(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB write failed')); };
  });
}

async function get(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    tx.oncomplete = () => db.close();
  });
}

async function remove(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB delete failed')); };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;

  (async () => {
    try {
      if (message.type === 'PING') {
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
        return;
      }
      if (message.type === 'STORE_NERO_SUBMISSION') {
        const payload = message.payload;
        if (!payload || payload.source !== 'livefinder' || payload.type !== 'PREPARE_NERO_SUBMISSION') throw new Error('Invalid LiveFinder submission payload');
        await put('pendingRun', { payload, storedAt: Date.now() });
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'GET_NERO_SUBMISSION') {
        sendResponse({ ok: true, record: (await get('pendingRun')) || null });
        return;
      }
      if (message.type === 'CLEAR_NERO_SUBMISSION') {
        await remove('pendingRun');
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'SAVE_NERO_QUEUE') {
        await put('lastQueue', message.value);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'SAVE_NERO_RESULT') {
        await put('lastResult', message.value);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'GET_NERO_STATUS') {
        const [queue, result] = await Promise.all([get('lastQueue'), get('lastResult')]);
        sendResponse({ ok: true, queue: queue || null, result: result || null });
        return;
      }
      sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
    } catch (err) {
      console.error('[LiveFinder background]', err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true;
});
