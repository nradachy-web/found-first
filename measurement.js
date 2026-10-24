// Browser-only OpenAI measurement. A receipt is evidence of a saved lead, not attribution.
export const SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && /^[\x21-\x7e]+$/.test(value) ? value : null;

export function createMeasurement({config, win, doc, notify = () => {}}) {
  const allowed = config?.enabled === true && typeof config.pixel_id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(config.pixel_id)
    && config.allowed_origin === win.location.origin && win.location.protocol === 'https:'
    && !/^\/(?:admin|portal|auth|login|client-login)(?:\/|$)/.test(win.location.pathname);
  let consent = false, initialized = false, authorized = false, epoch = 0;
  const sent = new Set(), pending = new Map(), cancellations = new Map();
  const state = () => ({available: allowed, consent, initialized, cancellation: [...cancellations.values()].includes('unconfirmed') ? 'unconfirmed' : [...cancellations.values()].includes('pending') ? 'pending' : cancellations.size ? 'recorded' : 'not_requested'});
  const update = () => { notify(state()); return state(); };
  async function allow() {
    if (!allowed || consent) return update();
    consent = true; authorized = false; epoch++;
    const ticket = epoch;
    try {
      const target = new URL(config.configuration_url);
      if (target.protocol !== 'https:' || target.pathname !== '/public/v1/measurement/config' || target.search || target.hash || target.username || target.password) throw Error('configuration_unavailable');
      const response = await win.fetch(target.href, {credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(6000)});
      if (response.status !== 200) throw Error('configuration_unavailable');
      const text = await response.text();
      if (text.length > 1024) throw Error('configuration_unavailable');
      const remote = JSON.parse(text);
      if (remote.enabled !== true || remote.pixel_id !== config.pixel_id || remote.allowed_origin !== config.allowed_origin) throw Error('configuration_unavailable');
    } catch {
      if (ticket === epoch) consent = false;
      return update();
    }
    if (!consent || ticket !== epoch) return update();
    authorized = true;
    if (!initialized) {
      const bootstrap = !win.oaiq;
      if (bootstrap) { const q = (...args) => q.q.push(args); q.q = []; win.oaiq = q; }
      win.oaiq('consent', false);
      win.oaiq('init', {pixelId: config.pixel_id});
      win.oaiq('consent', true);
      // No SDK fetch occurs until this explicit action. No contact fields are read here.
      if (bootstrap) {
        const script = doc.createElement('script'); script.async = true; script.src = SDK_URL;
        script.referrerPolicy = 'no-referrer';
        doc.head.appendChild(script);
      }
      initialized = true;
    } else { win.oaiq('consent', true); }
    return update();
  }
  async function cancel(key, endpoint) {
    if (!UUID.test(key) || !endpoint) return;
    cancellations.set(key, 'pending');
    try {
      const target = new URL(endpoint);
      if (target.protocol !== 'https:' || target.search || target.hash || !target.pathname.endsWith('/public/v1/inquiries')) return;
      target.pathname += '/measurement-withdrawal';
      const response = await win.fetch(target.href, {method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', keepalive: true,
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({idempotency_key: key})});
      const text = await response.text();
      if (response.status !== 200 || text.length > 1024 || JSON.parse(text).status !== 'withdrawal_recorded') throw Error('withdrawal_unconfirmed');
      cancellations.set(key, 'recorded');
    } catch { cancellations.set(key, 'unconfirmed'); }
    update();
  }
  function deny() {
    consent = false; authorized = false; epoch++;
    if (initialized) win.oaiq('consent', false);
    for (const [key, value] of pending) { if (value.granted) void cancel(key, value.endpoint); }
    return update();
  }
  function dispose() {
    consent = false; authorized = false; epoch++;
    if (initialized) win.oaiq('consent', false);
    // Navigation ends this in-memory choice. It does not withdraw a prior
    // consented, committed business event from the server's delivery queue.
    return update();
  }
  function requestContext(key, endpoint, eligible = true) {
    if (pending.has(key)) {
      const value = pending.get(key);
      return {...value, headers: consent && value.epoch === epoch ? value.headers : {}};
    }
    const context = {granted: consent && authorized && allowed && eligible, epoch, endpoint, headers: {}};
    if (context.granted) {
      context.headers['X-Measurement-Consent'] = 'granted';
      // Read only the documented attribution fields, after consent. No full URL is sent.
      const click = opaque(new URL(win.location.href).searchParams.get('oppref'));
      let cookies = {};
      try { cookies = Object.fromEntries(doc.cookie.split(';').map(v => v.trim().split(/=(.*)/s).slice(0, 2))); }
      catch { /* Cookie restrictions do not prevent a consented event without identifiers. */ }
      const browser = opaque(cookies.__obref), storedClick = opaque(cookies.__oppref);
      if (click || storedClick) context.headers['X-Measurement-Oppref'] = click || storedClick;
      if (browser) context.headers['X-Measurement-Obref'] = browser;
    }
    pending.set(key, context);
    return context;
  }
  function confirmedReceipt(receipt, key, context) {
    if (!context?.granted || !UUID.test(receipt?.receipt_id || '') || receipt.status !== 'received' || receipt.notification_status === 'simulated') return false;
    if (!consent || !authorized || context.epoch !== epoch) { void cancel(key, context.endpoint); return false; }
    if (sent.has(receipt.receipt_id)) return false;
    win.oaiq('measureSingle', config.pixel_id, 'lead_created', {type: 'customer_action'}, {event_id: receipt.receipt_id, opt_out: true});
    sent.add(receipt.receipt_id);
    return true;
  }
  return {allow, deny, dispose, requestContext, confirmedReceipt, getState: state};
}

export function mountMeasurement(config, doc = document, win = window) {
  const panel = doc.getElementById('measurement-consent');
  const controller = createMeasurement({config, win, doc, notify: state => {
    if (!panel) return;
    panel.hidden = !state.available;
    panel.querySelector('[data-measurement-status]').textContent = state.consent ? 'Measurement allowed for this page visit. You can withdraw at any time.' : state.cancellation === 'unconfirmed' ? 'Measurement is off. Pending server cancellation was not confirmed; try Withdraw again. Already sent events cannot be recalled.' : state.cancellation === 'pending' ? 'Measurement is off. Requesting cancellation of pending server events.' : 'Optional measurement is off. Your inquiry works without it.';
    panel.querySelector('[data-measurement-allow]').disabled = state.consent;
  }});
  if (panel) {
    panel.hidden = !controller.getState().available;
    panel.querySelector('[data-measurement-allow]').addEventListener('click', () => controller.allow());
    panel.querySelector('[data-measurement-deny]').addEventListener('click', () => controller.deny());
  }
  // Consent is deliberately in memory only; returning to a page requires a fresh choice.
  win.addEventListener('pagehide', () => controller.dispose());
  return controller;
}
