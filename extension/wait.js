(() => {
  const STORAGE_KEYS = ['pendingNeroSubmission', 'pendingNeroSubmissionStoredAt'];
  const MAX_AGE_MS = 10 * 60 * 1000;
  let clicked = false;

  const norm = value => String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  async function hasLiveFinderRun() {
    const result = await chrome.storage.local.get(STORAGE_KEYS);
    const payload = result.pendingNeroSubmission;
    const storedAt = result.pendingNeroSubmissionStoredAt || 0;
    return !!(
      payload &&
      payload.source === 'livefinder' &&
      payload.type === 'PREPARE_NERO_SUBMISSION' &&
      Date.now() - storedAt <= MAX_AGE_MS
    );
  }

  async function tryClickWait() {
    if (clicked) return;
    if (!(await hasLiveFinderRun())) return;

    const candidates = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter(el => visible(el) && !el.disabled)
      .filter(el => {
        const text = norm(el.innerText || el.textContent);
        return text === "i'll wait" || text.includes("i'll wait");
      });

    const button = candidates[0];
    if (!button) return;

    // Safety: only take the explicitly free wait path. Never click skip/priority/payment options.
    const text = norm(button.innerText || button.textContent);
    if (!text.includes("wait") || text.includes('skip') || text.includes('$')) return;

    clicked = true;
    button.scrollIntoView?.({ block: 'center', inline: 'center' });
    button.click();
    console.log("[LiveFinder] action: i'll-wait");

    const badge = document.getElementById('livefinder-badge');
    if (badge) badge.textContent = "LiveFinder: chose 'I'll wait' — finishing free submission…";
  }

  const observer = new MutationObserver(() => tryClickWait());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(tryClickWait, 500);
  tryClickWait();
})();
