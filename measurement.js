/* Found First measurement. Only allowlisted interaction data leaves this page. */
(() => {
  'use strict';
  if (window.ffMeasurementInstalled) return;
  window.ffMeasurementInstalled = true;
  const assetBase = new URL('.', document.currentScript?.src || location.href);
  const CONTAINER = 'GTM-PRP2QTNS';
  const DESTINATION = 'G-9BH6L3SL4B';
  const CHOICE = 'ff_analytics_choice_v1';
  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.origin + location.pathname;
  const path = new URL(canonical).pathname;
  const legal = /^\/(privacy|sms-terms)\//.test(path);
  const state = path.match(/^\/ai-search\/(michigan|florida|texas)\//)?.[1] || 'none';
  const pageType = legal ? 'legal' : path.startsWith('/ai-search/') ? 'market' : path.startsWith('/learn/') ? 'guide' : path.startsWith('/research/') ? 'research' : 'home';
  const browserOptOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const storage = (store, key, value) => { try { if (value === undefined) return store.getItem(key); store.setItem(key, value); } catch (_) {} return null; };
  let allowed = !browserOptOut && storage(localStorage, CHOICE) === 'granted';
  let loaded = false, started = false, banner;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const gtag = window.gtag;
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  let referrer = '';
  try { const u = new URL(document.referrer); referrer = u.origin; } catch (_) {}
  gtag('set', { page_location: canonical, page_referrer: referrer, page_title: document.title, user_data: {}, allow_google_signals: false, allow_ad_personalization_signals: false });
  function load() {
    if (!allowed || loaded) return;
    loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    storage(sessionStorage, 'ff_entry_path', storage(sessionStorage, 'ff_entry_path') || path);
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true; script.id = 'ff-gtm'; script.src = 'https://www.googletagmanager.com/gtm.js?id=' + CONTAINER;
    document.head.appendChild(script);
  }
  function emit(name, extra = {}) {
    if (!allowed || browserOptOut) return;
    const entry = storage(sessionStorage, 'ff_entry_path');
    const safeEntry = /^\/(?:ai-search|learn|research)\/[a-z0-9/-]*$/.test(entry || '') || entry === '/' ? entry : path;
    gtag('event', name, { send_to: DESTINATION, page_location: canonical, page_path: path, page_type: pageType, market_state: state, entry_page: safeEntry, user_data: {}, ...extra });
  }
  function intent(method) {
    if (!allowed || legal) return;
    const previous = Number(storage(sessionStorage, 'ff_contact_intent_at') || 0);
    if (Date.now() - previous < 30 * 60 * 1000) return;
    storage(sessionStorage, 'ff_contact_intent_at', String(Date.now()));
    emit('contact_intent', { contact_method: method, lead_status: 'intent_only' });
  }
  window.ffTrack = (action) => {
    if (!allowed) return;
    if (action === 'email_prepared') { emit('contact_email_prepared'); intent('prepared_email'); }
    if (action === 'message_copied') { emit('contact_message_copied'); intent('copied_message'); }
    if (action === 'copy_failed') emit('contact_copy_failed');
  };
  function clearCookies() {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^(_ga|_gid|_gat|_gcl)/.test(name)) continue;
      for (const domain of ['', ';domain=' + location.hostname, ';domain=.' + location.hostname]) document.cookie = name + '=;Max-Age=0;path=/' + domain + ';SameSite=Lax';
    }
  }
  function choose(granted) {
    allowed = granted && !browserOptOut;
    storage(localStorage, CHOICE, allowed ? 'granted' : 'denied');
    banner.hidden = true;
    if (allowed) { window['ga-disable-' + DESTINATION] = false; load(); }
    else {
      window['ga-disable-' + DESTINATION] = true;
      gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      clearCookies();
      if (loaded) location.reload();
    }
  }
  function init() {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('measurement.css', assetBase).href; document.head.appendChild(link);
    banner = document.createElement('section'); banner.className = 'ff-analytics-banner'; banner.setAttribute('aria-label', 'Analytics choices');
    banner.innerHTML = '<p><strong>Help us understand what works.</strong></p><p>Allow Google Analytics to measure visits and contact actions? Your form answers are not included in our tracking events. Advertising data sharing stays off.</p><div><button type="button" data-choice="allow">Allow analytics</button><button type="button" data-choice="deny">No thanks</button></div><a href="' + new URL('privacy/', assetBase).href + '">Privacy Policy</a>';
    banner.hidden = browserOptOut || storage(localStorage, CHOICE) !== null;
    banner.querySelector('[data-choice="allow"]').addEventListener('click', () => choose(true));
    banner.querySelector('[data-choice="deny"]').addEventListener('click', () => choose(false));
    if (browserOptOut) { banner.querySelector('p:nth-child(2)').textContent = 'Analytics is off because your browser sends a privacy preference.'; banner.querySelector('[data-choice="allow"]').disabled = true; }
    document.body.appendChild(banner);
    const controls = document.createElement('button'); controls.type = 'button'; controls.className = 'ff-analytics-choices'; controls.textContent = 'Analytics choices'; controls.addEventListener('click', () => { banner.hidden = !banner.hidden; if (!banner.hidden) banner.querySelector('[data-choice="deny"]').focus(); }); document.body.appendChild(controls);
    const form = document.getElementById('brief-form');
    if (form) {
      form.action = new URL('/#contact', canonical).href;
      const start = () => { if (!started && allowed) { started = true; emit('contact_form_start'); } };
      form.addEventListener('input', start); form.addEventListener('change', start);
    }
    document.addEventListener('click', event => {
      const a = event.target.closest?.('a'); if (!a || !allowed) return;
      const target = a.getAttribute('href') || '';
      if (/^mailto:nick@befoundfirst\.ai(?:\?|$)/i.test(target)) { emit('contact_email_click'); intent('email_link'); return; }
      if (/^tel:/i.test(target)) { emit('contact_phone_click'); intent('phone_link'); return; }
      try { const u = new URL(a.href); if (u.origin === location.origin && u.hash === '#contact') emit('contact_cta_click', { cta_position: a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : 'body' }); } catch (_) {}
    });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
