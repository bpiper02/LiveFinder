const DB_NAME = 'livefinder-extension';
const STORE_NAME = 'kv';
const ALERT_THRESHOLDS = [10, 5, 2, 1, 0];
const QUEUE_SCAN_ALARM = 'livefinder-queue-scan';
const RESERVED_NERO_ROUTES = new Set([
  'discover','learn','docs','home','login','signup','terms','privacy','support','pricing','about','create',
  'careers','career','jobs','games','game','partner-program','partners','partner','company','product','products',
  'features','feature','faq','contact','blog','press','legal','cookies','settings','account','profile','dashboard',
  'creators','artists','teams','business','enterprise','community','help','download','app','api','status'
]);
const ALLOWED_SESSION_SUFFIXES = new Set(['live','submit','submission','review']);

function validReviewerUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!/(^|\.)nero\.fan$/i.test(url.hostname)) return false;
    const parts = url.pathname.split('/').filter(Boolean).map(p => decodeURIComponent(p));
    if (!parts.length) return false;
    if (RESERVED_NERO_ROUTES.has(parts[0].toLowerCase())) return false;
    if (!/^[a-z0-9._-]{2,80}$/i.test(parts[0])) return false;
    if (parts.length > 2) return false;
    if (parts.length === 2 && !ALLOWED_SESSION_SUFFIXES.has(parts[1].toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}

function reviewerKeyFromUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!/(^|\.)nero\.fan$/i.test(url.hostname)) return '';
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  } catch {
    return '';
  }
}

function reviewerLabel(reviewer) {
  const saved = String(reviewer?.label || reviewer?.name || '').trim();
  if (saved && !['@live','live'].includes(saved.toLowerCase())) return saved;
  const key = reviewerKeyFromUrl(reviewer?.neroUrl);
  return key ? `@${key}` : 'Nero reviewer';
}

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

async function getAlertSettings() {
  const value = await get('queueAlertSettings');
  return { enabled: value?.enabled !== false };
}

async function getWatches() {
  const watches = await get('queueWatches');
  return Array.isArray(watches) ? watches : [];
}

async function saveWatches(watches) {
  await put('queueWatches', watches);
}

function watchIdFor(value) {
  const reviewerKey = reviewerKeyFromUrl(value?.reviewer?.neroUrl);
  const songKey = value?.song?.id || value?.song?.songUrl || value?.song?.title || 'song';
  return reviewerKey && songKey ? `${reviewerKey}::${songKey}` : '';
}

async function upsertWatchFromQueue(value) {
  const reviewerUrl = value?.reviewer?.neroUrl;
  const reviewerKey = reviewerKeyFromUrl(reviewerUrl);
  const id = watchIdFor(value);
  if (!reviewerKey || !id || !validReviewerUrl(reviewerUrl)) return null;

  const watches = await getWatches();
  const existing = watches.find(w => w.id === id);
  const ahead = Number.isFinite(value?.ahead) ? Number(value.ahead) : existing?.latestAhead ?? null;
  const notified = existing?.notified || [];

  if (!existing && Number.isFinite(ahead)) {
    for (const threshold of ALERT_THRESHOLDS) {
      if (ahead <= threshold && !notified.includes(threshold)) notified.push(threshold);
    }
  }

  const watch = {
    id,
    reviewerKey,
    reviewerUrl,
    reviewerLabel: reviewerLabel(value.reviewer),
    songId: value?.song?.id || '',
    songTitle: value?.song?.title || '',
    artist: value?.song?.artist || '',
    latestAhead: ahead,
    lastObservedAt: Number(value?.capturedAt || value?.completedAt || Date.now()),
    enabled: existing?.enabled !== false,
    notified,
    createdAt: existing?.createdAt || Date.now()
  };

  const next = watches.filter(w => w.id !== id);
  next.unshift(watch);
  await saveWatches(next);
  return watch;
}

async function setNotificationTarget(notificationId, url) {
  const targets = (await get('notificationTargets')) || {};
  targets[notificationId] = url;
  await put('notificationTargets', targets);
}

async function showQueueNotification(watch, ahead) {
  const settings = await getAlertSettings();
  if (!settings.enabled || watch?.enabled === false) return;

  const title = ahead <= 0 ? 'Your Nero review is up' : `You’re ${ahead} away on ${watch.reviewerLabel}`;
  const message = ahead <= 0
    ? `${watch.artist ? `${watch.artist} — ` : ''}${watch.songTitle || 'Your song'} should be up now. Tap to open Nero.`
    : `${watch.artist ? `${watch.artist} — ` : ''}${watch.songTitle || 'Your song'} is getting close. Tap to open the queue.`;
  const id = `livefinder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.svg'),
    title,
    message,
    priority: 2,
    requireInteraction: ahead <= 2
  });
  await setNotificationTarget(id, watch.reviewerUrl);
}

async function applyQueueObservation(observation) {
  const reviewerKey = String(observation?.reviewerKey || reviewerKeyFromUrl(observation?.url)).toLowerCase();
  const ahead = Number(observation?.ahead);
  if (!reviewerKey || !Number.isFinite(ahead) || ahead < 0) return { updated: 0 };

  const watches = await getWatches();
  let updated = 0;

  for (const watch of watches) {
    if (watch.reviewerKey !== reviewerKey || watch.enabled === false) continue;

    const previous = Number.isFinite(watch.latestAhead) ? watch.latestAhead : null;
    const crossed = ALERT_THRESHOLDS.filter(threshold =>
      !watch.notified.includes(threshold) &&
      ahead <= threshold &&
      (previous == null || previous > threshold)
    );

    watch.latestAhead = ahead;
    watch.lastObservedAt = Number(observation.capturedAt || Date.now());
    updated += 1;

    if (crossed.length) {
      watch.notified.push(...crossed);
      await showQueueNotification(watch, ahead);
    }
  }

  if (updated) await saveWatches(watches);
  return { updated };
}

async function scanOpenNeroTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['https://www.nero.fan/*', 'https://nero.fan/*'] });
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_QUEUE_POSITION' });
      if (response?.observation) await applyQueueObservation(response.observation);
    } catch {
      // Tabs without an injected content script or pages mid-navigation are safe to ignore.
    }
  }
}

function ensureQueueAlarm() {
  chrome.alarms.create(QUEUE_SCAN_ALARM, { periodInMinutes: 2 });
}

chrome.runtime.onInstalled.addListener(ensureQueueAlarm);
chrome.runtime.onStartup.addListener(ensureQueueAlarm);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === QUEUE_SCAN_ALARM) scanOpenNeroTabs();
});
chrome.notifications.onClicked.addListener(async notificationId => {
  const targets = (await get('notificationTargets')) || {};
  const url = targets[notificationId];
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});
ensureQueueAlarm();

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
        await upsertWatchFromQueue(message.value);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'SAVE_NERO_RESULT') {
        await put('lastResult', message.value);
        await upsertWatchFromQueue(message.value);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'GET_NERO_STATUS') {
        const [queue, result] = await Promise.all([get('lastQueue'), get('lastResult')]);
        sendResponse({ ok: true, queue: queue || null, result: result || null });
        return;
      }
      if (message.type === 'SAVE_NERO_POOL') {
        const rawItems = Array.isArray(message.items) ? message.items : [];
        const items = rawItems.filter(item => validReviewerUrl(item?.neroUrl));
        await put('neroPool', { items, scrapedAt: Number(message.scrapedAt || Date.now()) });
        sendResponse({ ok: true, count: items.length, rejected: rawItems.length - items.length });
        return;
      }
      if (message.type === 'GET_NERO_POOL') {
        const pool = await get('neroPool');
        const items = Array.isArray(pool?.items) ? pool.items.filter(item => validReviewerUrl(item?.neroUrl)) : [];
        sendResponse({ ok: true, pool: { items, scrapedAt: Number(pool?.scrapedAt || 0) } });
        return;
      }
      if (message.type === 'QUEUE_OBSERVATION') {
        const result = await applyQueueObservation(message.observation);
        sendResponse({ ok: true, ...result });
        return;
      }
      if (message.type === 'GET_QUEUE_WATCH_STATE') {
        const [settings, watches] = await Promise.all([getAlertSettings(), getWatches()]);
        sendResponse({ ok: true, alertsEnabled: settings.enabled, watches });
        return;
      }
      if (message.type === 'SET_QUEUE_ALERTS') {
        const enabled = !!message.enabled;
        await put('queueAlertSettings', { enabled });
        sendResponse({ ok: true, alertsEnabled: enabled });
        return;
      }
      if (message.type === 'TEST_QUEUE_NOTIFICATION') {
        const id = `livefinder-test-${Date.now()}`;
        await chrome.notifications.create(id, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon.svg'),
          title: 'LiveFinder queue alerts are working',
          message: 'You’ll get an alert here when a watched Nero queue crosses a threshold.',
          priority: 1
        });
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'SCAN_OPEN_NERO_TABS') {
        await scanOpenNeroTabs();
        sendResponse({ ok: true });
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
