/* Found First measurement. Only allowlisted interaction data leaves this page. */
(() => {
  'use strict';
  if (window.ffMeasurementInstalled) return;
  window.ffMeasurementInstalled = true;
  const CONTAINER = 'GTM-PRP2QTNS';
  const DESTINATION = 'G-9BH6L3SL4B';
  const PRIOR_CHOICE = 'ff_analytics_choice_v1';
  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.origin + location.pathname;
  const path = new URL(canonical).pathname;
  const legal = /^\/(privacy|sms-terms)\//.test(path);
  const state = path.match(/^\/ai-search\/(michigan|florida|texas)\//)?.[1] || 'none';
  const pageType = legal ? 'legal' : path.startsWith('/book/') ? 'booking' : path.startsWith('/industries/') ? 'industry' : path.startsWith('/services/') ? 'service' : path.startsWith('/ai-search/') ? 'market' : path.startsWith('/learn/') ? 'guide' : path.startsWith('/research/') ? 'research' : 'home';
  const browserOptOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const storage = (store, key, value) => { try { if (value === undefined) return store.getItem(key); store.setItem(key, value); } catch (_) {} return null; };
  const allowed = !browserOptOut && storage(localStorage, PRIOR_CHOICE) !== 'denied';
  let loaded = false, started = false;
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
    const safeEntry = /^\/(?:ai-search|learn|research|industries|services|book)\/[a-z0-9/-]*$/.test(entry || '') || entry === '/' ? entry : path;
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
  function init() {
    const form = document.getElementById('brief-form');
    if (form) {
      form.action = new URL('/#contact', canonical).href;
      const start = () => { if (!started && allowed) { started = true; emit('contact_form_start'); } };
      form.addEventListener('input', start); form.addEventListener('change', start);
    }
    document.addEventListener('click', event => {
      const a = event.target.closest?.('a'); if (!a || !allowed) return;
      const target = a.getAttribute('href') || '';
      if (path === '/book/' && a.id === 'booking-direct') {
        emit('booking_fallback_click', { booking_provider: 'google_calendar', lead_status: 'intent_only' });
        return;
      }
      if (/^mailto:nick@befoundfirst\.ai(?:\?|$)/i.test(target)) { emit('contact_email_click'); intent('email_link'); return; }
      if (/^tel:/i.test(target)) { emit('contact_phone_click'); intent('phone_link'); return; }
      try { const u = new URL(a.href); if (u.origin === location.origin && (u.hash === '#contact' || u.pathname === '/book/')) emit(u.pathname === '/book/' ? 'booking_cta_click' : 'contact_cta_click', { cta_position: a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : 'body' }); } catch (_) {}
    });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
