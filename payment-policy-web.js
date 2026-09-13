(() => {
  const WEB_SOURCE = 'livefinder-web';
  const EXT_SOURCE = 'livefinder-extension';
  const CACHE_KEY = 'livefinder-payment-policy';
  const select = document.getElementById('paymentPolicy');
  if (!select) return;

  const normalize = value => value === 'show-paid' ? 'show-paid' : 'free-only';

  function apply(value) {
    const policy = normalize(value);
    select.value = policy;
    localStorage.setItem(CACHE_KEY, policy);
    return policy;
  }

  function request() {
    window.postMessage({ source: WEB_SOURCE, type: 'REQUEST_PAYMENT_POLICY' }, '*');
  }

  select.addEventListener('change', () => {
    const policy = apply(select.value);
    window.postMessage({ source: WEB_SOURCE, type: 'SET_PAYMENT_POLICY', policy }, '*');
  });

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (message?.source !== EXT_SOURCE) return;
    if (message.type === 'BRIDGE_READY') request();
    if (message.type === 'PAYMENT_POLICY_STATE' || message.type === 'PAYMENT_POLICY_UPDATED') {
      if (message.response?.ok) apply(message.response.policy);
    }
  });

  apply(localStorage.getItem(CACHE_KEY));
  request();
})();
