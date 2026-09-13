(() => {
  if (!/\/browse-live\/?$/i.test(location.pathname)) return;

  const STYLE_ID = 'livefinder-tunetavern-style';
  const STATUS_ID = 'livefinder-tunetavern-status';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${STATUS_ID}{position:fixed;right:14px;bottom:14px;z-index:2147483646;background:#c0c0c0;color:#000;border:2px solid;border-color:#fff #808080 #808080 #fff;box-shadow:inset -1px -1px #404040,inset 1px 1px #dfdfdf;padding:7px 9px;font:700 11px/1.3 "Courier New",monospace;max-width:310px}
      [data-livefinder-tunetavern-room="1"]{outline:2px dotted #000080!important;outline-offset:2px!important}
      .livefinder-tunetavern-badge{display:inline-block;margin-left:6px;padding:2px 4px;background:#000080;color:#fff;border:1px solid #fff;font:700 8px/1 "Courier New",monospace;vertical-align:middle}
    `;
    document.documentElement.appendChild(style);
  }

  let lastCount = -1;
  function scan() {
    const seen = new Set();
    const links = [...document.querySelectorAll('a[href]')].filter(anchor => {
      try {
        const url = new URL(anchor.href, location.href);
        return /(^|\.)tunetavern\.app$/i.test(url.hostname) && /^\/live\/[^/]+/i.test(url.pathname);
      } catch { return false; }
    }).filter(anchor => {
      const url = new URL(anchor.href, location.href);
      const key = `${url.origin}${url.pathname}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const anchor of links) {
      anchor.dataset.livefinderTunetavernRoom = '1';
      if (!anchor.querySelector('.livefinder-tunetavern-badge')) {
        const badge = document.createElement('span');
        badge.className = 'livefinder-tunetavern-badge';
        badge.textContent = 'LF READY';
        badge.title = 'Open this room, then use LiveFinder Assist to autofill the submission form.';
        anchor.appendChild(badge);
      }
    }

    let status = document.getElementById(STATUS_ID);
    if (!status) {
      status = document.createElement('div');
      status.id = STATUS_ID;
      status.setAttribute('role', 'status');
      document.documentElement.appendChild(status);
    }
    if (lastCount !== links.length) {
      lastCount = links.length;
      status.textContent = links.length
        ? `LIVEFINDER // ${links.length} review room${links.length === 1 ? '' : 's'} detected. Open one, then use Assist.`
        : 'LIVEFINDER // Waiting for active Tune Tavern rooms…';
    }
  }

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, 2500);
})();
