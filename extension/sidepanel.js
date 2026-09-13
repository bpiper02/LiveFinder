(() => {
  const $ = id => document.getElementById(id);
  const fields = ['artist', 'title', 'songUrl', 'email', 'phone', 'instagram', 'note'];
  const PHONE_KEY = 'livefinder-assist-phone';
  let library = [];
  let activeTab = null;
  let context = null;
  let selectedSongId = localStorage.getItem('livefinder-assist-song-id') || '';

  function setResult(title, detail, kind = '') {
    const box = $('result');
    box.className = `resultWindow${kind ? ` ${kind}` : ''}`;
    box.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail || '')}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'
    }[char]));
  }

  function rememberedPhone() {
    return localStorage.getItem(PHONE_KEY) || '';
  }

  function draftFromForm() {
    return Object.fromEntries(fields.map(key => [key, $(key).value.trim()]));
  }

  function applyDraft(song = {}) {
    for (const key of fields) {
      if (key === 'phone') {
        $(key).value = String(song?.phone || rememberedPhone());
        continue;
      }
      $(key).value = String(song?.[key] || '');
    }
  }

  function selectedSong() {
    return library.find(song => song.id === $('songSelect').value) || null;
  }

  function renderLibrary() {
    const select = $('songSelect');
    const current = selectedSongId;
    select.innerHTML = '<option value="">Manual draft</option>' + library.map(song =>
      `<option value="${escapeHtml(song.id)}">${escapeHtml(song.artist)} — ${escapeHtml(song.title)}</option>`
    ).join('');

    if (current && library.some(song => song.id === current)) select.value = current;
    else if (library[0]) select.value = library[0].id;
    else select.value = '';

    selectedSongId = select.value;
    if (selectedSongId) localStorage.setItem('livefinder-assist-song-id', selectedSongId);
    else localStorage.removeItem('livefinder-assist-song-id');

    const song = selectedSong();
    if (song) applyDraft(song);
    else applyDraft({});
    $('libraryHint').textContent = library.length
      ? `${library.length} saved song${library.length === 1 ? '' : 's'} synced. Edits are one-off; your phone is remembered in Assist.`
      : 'No synced songs yet. Enter a manual draft, or open the LiveFinder dashboard once to sync saved songs.';
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    return activeTab;
  }

  async function loadLibrary() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SONG_LIBRARY' });
      library = Array.isArray(response?.library?.songs) ? response.library.songs : [];
      renderLibrary();
    } catch (err) {
      library = [];
      renderLibrary();
      setResult('Could not load songs', String(err?.message || err), 'error');
    }
  }

  async function refreshContext() {
    const tab = await getActiveTab();
    context = null;

    if (!tab?.id || !/^https?:\/\/(?:www\.)?nero\.fan\//i.test(tab.url || '')) {
      $('siteBadge').textContent = 'UNSUPPORTED';
      $('contextTitle').textContent = 'Open a Nero reviewer page';
      $('contextDetail').textContent = 'Nero is the first supported adapter. Open a reviewer page to autofill or submit.';
      $('autofillCurrent').disabled = true;
      $('runFullAuto').disabled = true;
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'LIVEFINDER_ASSIST_STATUS' });
      context = response?.context || null;
      if (!response?.ok || !context?.supported) {
        $('siteBadge').textContent = 'NERO';
        $('contextTitle').textContent = 'Nero page detected';
        $('contextDetail').textContent = 'Open a specific reviewer page to use LiveFinder Assist.';
        $('autofillCurrent').disabled = true;
        $('runFullAuto').disabled = true;
        return;
      }

      $('siteBadge').textContent = 'NERO';
      $('contextTitle').textContent = context.handle ? `@${context.handle}` : 'Nero reviewer';
      $('contextDetail').textContent = context.formVisible
        ? `${context.fieldCount} visible form field${context.fieldCount === 1 ? '' : 's'} detected. Autofill can handle this step.`
        : 'Reviewer detected. Open the submission form, or run the full free submission.';
      $('autofillCurrent').disabled = !context.formVisible;
      $('runFullAuto').disabled = false;
    } catch (err) {
      $('siteBadge').textContent = 'RELOAD TAB';
      $('contextTitle').textContent = 'LiveFinder is not connected to this Nero tab';
      $('contextDetail').textContent = 'Refresh the Nero tab once after reloading or updating the extension.';
      $('autofillCurrent').disabled = true;
      $('runFullAuto').disabled = true;
    }
  }

  function validateDraft(draft) {
    const missing = [];
    if (!draft.artist) missing.push('artist');
    if (!draft.title) missing.push('song title');
    if (!draft.songUrl) missing.push('song link');
    if (!draft.email) missing.push('email');
    return missing;
  }

  async function autofillCurrent() {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    const draft = draftFromForm();
    setResult('Scanning visible form…', 'Only confident matches will be filled.');

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'LIVEFINDER_AUTOFILL_CURRENT', draft });
      if (!response?.ok) {
        setResult('Could not autofill this step', response?.error || 'No supported form detected.', 'warn');
        await refreshContext();
        return;
      }

      const report = response.report || { filled: [], missing: [], failed: [] };
      const filled = report.filled.map(item => item.label).join(', ');
      const missed = [...report.missing, ...report.failed].map(item => item.label).join(', ');

      if (report.filled.length) {
        setResult(
          `Filled ${report.filled.length} field${report.filled.length === 1 ? '' : 's'}`,
          `${filled || 'Matched fields filled.'}${missed ? ` Left untouched: ${missed}.` : ''} Review the page before continuing.`,
          missed ? 'warn' : 'success'
        );
      } else {
        setResult('Nothing filled', missed ? `No confident match for: ${missed}.` : 'No matching editable fields were visible.', 'warn');
      }
      await refreshContext();
    } catch (err) {
      setResult('Autofill failed', String(err?.message || err), 'error');
    }
  }

  async function runFullAuto() {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await refreshContext();
    if (!context?.supported) {
      setResult('Open a reviewer page first', 'Full auto needs a specific Nero reviewer page.', 'warn');
      return;
    }

    const draft = draftFromForm();
    const missing = validateDraft(draft);
    if (missing.length) {
      setResult('Missing required details', missing.join(', '), 'warn');
      return;
    }

    const saved = selectedSong();
    const song = {
      id: saved?.id || `assist-${Date.now()}`,
      artist: draft.artist,
      title: draft.title,
      songUrl: draft.songUrl,
      email: draft.email,
      phone: draft.phone,
      instagram: draft.instagram,
      note: draft.note
    };
    const reviewer = {
      neroUrl: context.reviewerUrl || tab.url,
      label: context.handle ? `@${context.handle}` : 'Nero reviewer'
    };
    const payload = {
      source: 'livefinder',
      origin: 'sidepanel',
      type: 'PREPARE_NERO_SUBMISSION',
      runId: crypto.randomUUID(),
      song,
      reviewer,
      createdAt: Date.now()
    };

    $('runFullAuto').disabled = true;
    setResult('Starting full free submission…', 'The Nero tab will refresh once, then LiveFinder will use the existing free-flow automation.');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'STORE_NERO_SUBMISSION', payload });
      if (!response?.ok) throw new Error(response?.error || 'Could not store submission run.');
      await chrome.tabs.reload(tab.id);
      setResult('Full auto started', 'Watch the Nero tab. LiveFinder will avoid paid skips and capture your queue position.', 'success');
    } catch (err) {
      $('runFullAuto').disabled = false;
      setResult('Could not start full auto', String(err?.message || err), 'error');
    }
  }

  $('songSelect').addEventListener('change', () => {
    selectedSongId = $('songSelect').value;
    if (selectedSongId) localStorage.setItem('livefinder-assist-song-id', selectedSongId);
    else localStorage.removeItem('livefinder-assist-song-id');
    applyDraft(selectedSong() || {});
  });

  $('phone').addEventListener('input', () => {
    const value = $('phone').value.trim();
    if (value) localStorage.setItem(PHONE_KEY, value);
    else localStorage.removeItem(PHONE_KEY);
  });

  $('resetDraft').addEventListener('click', () => {
    applyDraft(selectedSong() || {});
    setResult('Draft reset', selectedSong() ? 'Restored the selected saved song.' : 'Cleared the manual draft.');
  });
  $('autofillCurrent').addEventListener('click', autofillCurrent);
  $('runFullAuto').addEventListener('click', runFullAuto);

  chrome.tabs.onActivated.addListener(() => refreshContext());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTab?.id && (changeInfo.status === 'complete' || changeInfo.url)) refreshContext();
  });

  Promise.all([loadLibrary(), refreshContext()]).catch(err => {
    setResult('LiveFinder Assist error', String(err?.message || err), 'error');
  });
})();
