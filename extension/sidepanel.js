(() => {
  const $ = id => document.getElementById(id);
  const providers = globalThis.LiveFinderProviders;
  const fields = ['artist', 'title', 'songUrl', 'email', 'phone', 'instagram', 'note'];
  const PHONE_KEY = 'livefinder-assist-phone';
  const AUTHORSHIP_KEY = 'livefinder-assist-authorship';
  let library = [];
  let activeTab = null;
  let context = null;
  let selectedSongId = localStorage.getItem('livefinder-assist-song-id') || '';
  let paymentPolicy = 'free-only';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function setResult(title, detail, kind = '') {
    const box = $('result');
    box.className = `resultWindow${kind ? ` ${kind}` : ''}`;
    box.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail || '')}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[char]));
  }

  function rememberedPhone() {
    return localStorage.getItem(PHONE_KEY) || '';
  }

  function rememberedAuthorship() {
    return localStorage.getItem(AUTHORSHIP_KEY) || '';
  }

  function currentPaymentPolicy() {
    return paymentPolicy === 'show-paid' ? 'show-paid' : 'free-only';
  }

  async function loadPaymentPolicy() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PAYMENT_POLICY' });
      paymentPolicy = response?.policy === 'show-paid' ? 'show-paid' : 'free-only';
    } catch {
      paymentPolicy = 'free-only';
    }
    if ($('paymentPolicy')) $('paymentPolicy').value = paymentPolicy;
  }

  async function savePaymentPolicy(value) {
    const next = value === 'show-paid' ? 'show-paid' : 'free-only';
    paymentPolicy = next;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SET_PAYMENT_POLICY', policy: next });
      if (response?.ok) paymentPolicy = response.policy === 'show-paid' ? 'show-paid' : 'free-only';
    } catch {
      paymentPolicy = 'free-only';
    }
    if ($('paymentPolicy')) $('paymentPolicy').value = paymentPolicy;
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
    if ($('authorship')) $('authorship').value = String(song?.authorship || rememberedAuthorship());
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
      ? `${library.length} saved song${library.length === 1 ? '' : 's'} synced. Edits are one-off; phone and AuxChord authorship are remembered in Assist.`
      : 'No synced songs yet. Enter a manual draft, or open the LiveFinder dashboard once to sync saved songs.';
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    return activeTab;
  }

  function fallbackContextFromTab(tab) {
    const base = providers?.contextForUrl(tab?.url || '');
    if (!base) return null;
    return {
      ...base,
      formVisible: false,
      fieldCount: 0,
      assistReachable: false
    };
  }

  async function sendTabMessage(tabId, message, attempts = 3) {
    let lastError = null;
    const waits = [0, 160, 420];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (waits[attempt]) await sleep(waits[attempt]);
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('LiveFinder Assist could not reach this tab.');
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

  function contextTitleFor(ctx) {
    if (!ctx) return 'Unsupported page';
    if (ctx.handle) return ctx.handle.startsWith('@') ? ctx.handle : `@${ctx.handle}`;
    if (ctx.reviewerId) return `${ctx.providerLabel || 'Reviewer'} #${ctx.reviewerId}`;
    if (ctx.kind === 'discovery') return `${ctx.providerLabel || 'Provider'} discovery`;
    return ctx.providerLabel || 'Reviewer page';
  }

  function applyProviderUi(ctx) {
    const provider = ctx?.provider || 'unknown';
    const label = ctx?.providerLabel || providers?.providerLabel(provider) || 'Unsupported';
    $('siteBadge').textContent = provider === 'unknown' ? 'UNSUPPORTED' : label.toUpperCase();
    if ($('authorshipRow')) $('authorshipRow').hidden = provider !== 'auxchord';
    const supported = !!ctx?.supported;
    $('autofillCurrent').disabled = !supported;
    $('runFullAuto').disabled = !supported || !ctx?.supportsFullAuto;
    if (supported && !ctx?.supportsFullAuto) $('runFullAuto').title = `${label} full auto is not enabled yet. Use Autofill this step.`;
    else $('runFullAuto').title = '';
  }

  async function refreshContext() {
    const tab = await getActiveTab();
    context = null;
    const fallback = fallbackContextFromTab(tab);

    if (!tab?.id || !fallback) {
      $('siteBadge').textContent = 'UNSUPPORTED';
      $('contextTitle').textContent = 'Open a supported review page';
      $('contextDetail').textContent = 'LiveFinder currently supports Nero, AuxChord, and Tune Tavern review pages.';
      $('autofillCurrent').disabled = true;
      $('runFullAuto').disabled = true;
      if ($('authorshipRow')) $('authorshipRow').hidden = true;
      return;
    }

    context = fallback;
    applyProviderUi(context);

    try {
      const response = await sendTabMessage(tab.id, { type: 'LIVEFINDER_ASSIST_STATUS' });
      context = response?.context || fallback;
      applyProviderUi(context);
      $('contextTitle').textContent = contextTitleFor(context);
      if (!context?.supported) {
        $('contextDetail').textContent = context.kind === 'discovery'
          ? 'Choose a specific live reviewer/session first.'
          : 'Open a specific reviewer page to use LiveFinder Assist.';
        return;
      }
      context.assistReachable = true;
      $('contextDetail').textContent = context.formVisible
        ? `${context.fieldCount} visible form field${context.fieldCount === 1 ? '' : 's'} detected. Autofill can handle this step.`
        : context.supportsFullAuto
          ? 'Reviewer detected. Open a submission step and autofill it, or run the full free submission.'
          : 'Reviewer detected. Open the submission form, then use Autofill this step.';
    } catch (err) {
      context = fallback;
      applyProviderUi(context);
      $('contextTitle').textContent = contextTitleFor(context);
      $('contextDetail').textContent = 'Assist is waking on this tab. You can still press Autofill this step; LiveFinder will retry before asking you to refresh.';
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
    const fallback = fallbackContextFromTab(tab);
    if (!tab?.id || !fallback?.supported) {
      setResult('Open a supported reviewer first', 'Autofill this step works on Nero, AuxChord, and Tune Tavern reviewer submission pages.', 'warn');
      return;
    }
    const draft = draftFromForm();
    setResult('Scanning visible form…', 'Only confident matches will be filled.');

    try {
      const response = await sendTabMessage(tab.id, { type: 'LIVEFINDER_AUTOFILL_CURRENT', draft }, 3);
      if (!response?.ok) {
        setResult('Could not autofill this step', response?.error || 'Open the submission step first, then try again.', 'warn');
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
        setResult('Nothing filled', missed ? `No confident match for: ${missed}.` : 'No matching editable fields were visible. Open the next submission step and try again.', 'warn');
      }
      await refreshContext();
    } catch (err) {
      setResult('Refresh this review tab once', 'LiveFinder Assist could not reach the page after three tries. Refresh the tab, reopen the submission step, then try again.', 'warn');
      await refreshContext();
    }
  }

  async function runFullAuto() {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await refreshContext();
    if (!context?.supported) {
      setResult('Open a reviewer page first', 'Full auto needs a specific supported reviewer page.', 'warn');
      return;
    }
    if (!context.supportsFullAuto) {
      setResult('Use Autofill this step here', `${context.providerLabel || 'This provider'} is supported for Assist, but its full-auto controller is not enabled yet.`, 'warn');
      return;
    }

    const draft = draftFromForm();
    const missing = validateDraft(draft);
    if (missing.length) {
      setResult('Missing required details', missing.join(', '), 'warn');
      return;
    }
    if (context.provider === 'auxchord' && !$('authorship').value) {
      setResult('Choose AuxChord authorship', 'AuxChord requires an accurate authorship disclosure before submission. Select the correct option above.', 'warn');
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
    const provider = context.provider || 'nero';
    const reviewerUrl = context.reviewerUrl || tab.url;
    const reviewer = {
      reviewerUrl,
      neroUrl: reviewerUrl,
      label: context.handle ? `@${context.handle}` : context.providerLabel || 'Reviewer'
    };
    const payload = {
      source: 'livefinder',
      origin: provider === 'nero' ? 'sidepanel' : 'provider-sidepanel',
      provider,
      type: 'PREPARE_NERO_SUBMISSION',
      runId: crypto.randomUUID(),
      song,
      reviewer,
      authorship: context.provider === 'auxchord' ? $('authorship').value : '',
      paymentPolicy: currentPaymentPolicy(),
      createdAt: Date.now()
    };

    $('runFullAuto').disabled = true;
    setResult('Starting full free submission…', currentPaymentPolicy() === 'show-paid'
      ? 'LiveFinder will use verified free paths and pause if payment becomes required.'
      : 'LiveFinder will use verified free paths and stop if payment becomes required.');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'STORE_NERO_SUBMISSION', payload });
      if (!response?.ok) throw new Error(response?.error || 'Could not store submission run.');
      await chrome.tabs.reload(tab.id);
      const label = context.providerLabel || providers?.providerLabel(provider) || provider;
      setResult('Full auto started', `Watch the ${label} tab. LiveFinder never authorizes a charge and will use only a verified free path.`, 'success');
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

  $('authorship').addEventListener('change', () => {
    const value = $('authorship').value;
    if (value) localStorage.setItem(AUTHORSHIP_KEY, value);
    else localStorage.removeItem(AUTHORSHIP_KEY);
  });

  $('paymentPolicy').addEventListener('change', () => savePaymentPolicy($('paymentPolicy').value));

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

  Promise.all([loadLibrary(), loadPaymentPolicy(), refreshContext()]).catch(err => {
    setResult('LiveFinder Assist error', String(err?.message || err), 'error');
  });
})();
