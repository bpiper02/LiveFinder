(() => {
  const pool = document.getElementById('pool');
  if (!pool || document.getElementById('providerLaunchpad')) return;

  const auxReviewers = [
    ['barcode_radio', 'https://auxchord.app/91'],
    ['8600records', 'https://auxchord.app/621'],
    ['soulreviews', 'https://auxchord.app/1606'],
    ['lllucyd', 'https://auxchord.app/1323'],
    ['trueplatform', 'https://auxchord.app/9175'],
    ['waves', 'https://auxchord.app/779'],
    ['famousdega', 'https://auxchord.app/1793'],
    ['yungceo', 'https://auxchord.app/1026'],
    ['lexlocs', 'https://auxchord.app/4939'],
    ['mannysmania', 'https://auxchord.app/4047']
  ];

  const details = document.createElement('details');
  details.id = 'providerLaunchpad';
  details.className = 'window panel providerLaunchpad';
  details.innerHTML = `
    <summary class="titleBar sectionBar">
      <strong>MORE REVIEW NETWORKS</strong>
      <span class="providerLaunchpadStatus">AUXCHORD + TUNE TAVERN</span>
    </summary>
    <div class="windowBody">
      <p class="providerLaunchpadIntro">Use the same saved song in LiveFinder Assist. These links are shortcuts to other review networks; only submit when a session is actually accepting tracks.</p>
      <div class="providerNetworkGrid">
        <section class="providerNetworkCard">
          <div class="providerNetworkHead"><div><strong>AUXCHORD</strong><small>Full free-path automation enabled</small></div><span class="providerCapability">FULL AUTO</span></div>
          <p>Open a creator, click <b>Submit for Live</b> if needed, then use LiveFinder Assist. Skips-only sessions are blocked automatically.</p>
          <div class="providerReviewerLinks">${auxReviewers.map(([name,url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">@${name}<small>Check session ↗</small></a>`).join('')}</div>
        </section>
        <section class="providerNetworkCard">
          <div class="providerNetworkHead"><div><strong>TUNE TAVERN</strong><small>Browse currently active review rooms</small></div><span class="providerCapability assistOnly">ASSIST</span></div>
          <p>Open Browse Live, choose a host who is actually streaming, then use <b>Autofill this step</b>. Full auto stays off until its logged-in flow is verified.</p>
          <a class="providerPrimaryLink" href="https://www.tunetavern.app/browse-live" target="_blank" rel="noopener noreferrer">Browse Tune Tavern live rooms ↗</a>
        </section>
      </div>
    </div>`;

  pool.insertAdjacentElement('afterend', details);
})();
