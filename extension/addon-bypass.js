(() => {
  const { parseReviewerUrl } = globalThis.LiveFinderUrl || {};
  if (!parseReviewerUrl) return;

  const norm = value => String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  function runtimeSend(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(response);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function sameReviewer(targetUrl) {
    const current = parseReviewerUrl(location.href);
    const target = parseReviewerUrl(targetUrl);
    return !!current?.handle && !!target?.handle && current.handle.toLowerCase() === target.handle.toLowerCase();
  }

  function addOnRoot() {
    const candidates = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, section, div')]
      .filter(visible)
      .filter(el => {
        const text = norm(el.innerText || el.textContent || '');
        if (!text || text.length > 4500) return false;
        return text.includes('add-ons') && (text.includes('enhance your submission') || text.includes("i'm good") || text.includes('im good'));
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return candidates[0] || null;
  }

  function freeExitButton(root) {
    return [...root.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .find(el => {
        const text = norm(el.innerText || el.textContent || el.getAttribute?.('aria-label'));
        return text === "i'm good" || text === 'im good';
      }) || null;
  }

  let armed = false;
  let clicked = false;

  async function arm() {
    try {
      const response = await runtimeSend({ type: 'GET_NERO_SUBMISSION' });
      const payload = response?.record?.payload;
      armed = !!payload && payload.source === 'livefinder' && sameReviewer(payload?.reviewer?.neroUrl);
    } catch {
      armed = false;
    }
  }

  async function tick() {
    if (!armed || clicked) return;
    const root = addOnRoot();
    if (!root) return;
    const button = freeExitButton(root);
    if (!button) return;

    clicked = true;
    button.scrollIntoView?.({ block: 'center', inline: 'center' });
    button.click();
    console.log("[LiveFinder] add-ons: chose free 'I'm good' path");
    setTimeout(() => { clicked = false; }, 1800);
  }

  arm().then(() => {
    if (!armed) return;
    tick();
    const observer = new MutationObserver(tick);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(tick, 500);
  });
})();
