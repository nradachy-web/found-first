// Install the isolated Google-hosted picker after its live deployment is configured.
(() => {
  const frame = document.querySelector('iframe[data-app]');
  if (!frame) return;
  const url = new URL(frame.dataset.app);
  if (url.origin !== 'https://script.google.com') return;
  const bridge = crypto.randomUUID();
  url.searchParams.set('bridge', bridge);
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.type !== 'found-first-booking-size' || message.bridge !== bridge) return;
    if (!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)*script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(event.origin)) return;
    if (Number.isFinite(message.height)) frame.style.height = Math.max(240, Math.min(1100, Math.ceil(message.height))) + 'px';
  });
  frame.src = url.href;
  frame.hidden = false;
})();
