(() => {
  'use strict';
  const calendar = 'https://calendly.com/modernapexstrategies/30-minute-1x1';
  const origin = 'https://calendly.com';
  const open = document.getElementById('booking-open');
  const launch = document.getElementById('booking-launch');
  const wrap = document.getElementById('booking-frame-wrap');
  const status = document.getElementById('booking-status');
  const confirmed = document.getElementById('booking-confirmed');
  const direct = document.getElementById('booking-direct');
  if (!open || !wrap || !launch || !status || !confirmed || !direct) return;
  let frame, selected = false, timer;
  const seen = new Set();
  const rawSource = new URLSearchParams(location.search).get('source_page') || '';
  const sourcePage = /^\/(?:$|(?:learn|industries|ai-search|services|research)\/[a-z0-9/-]{0,180})$/.test(rawSource) ? rawSource : '';
  if (sourcePage) { const fallbackURL = new URL(direct.href); fallbackURL.searchParams.set('utm_content', 'from=' + sourcePage); direct.href = fallbackURL.href; }
  const track = action => { if (typeof window.ffTrack === 'function') window.ffTrack(action); };
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const eventPattern = new RegExp('^https://api\\.calendly\\.com/scheduled_events/(' + uuid + ')$');
  const inviteePattern = new RegExp('^https://api\\.calendly\\.com/scheduled_events/(' + uuid + ')/invitees/(' + uuid + ')$');
  open.addEventListener('click', () => {
    if (frame) return;
    const url = new URL(calendar);
    url.searchParams.set('embed_domain', location.hostname);
    url.searchParams.set('embed_type', 'Inline');
    url.searchParams.set('hide_gdpr_banner', '1');
    url.searchParams.set('primary_color', '000000');
    url.searchParams.set('utm_source', 'found_first');
    url.searchParams.set('utm_medium', 'website');
    url.searchParams.set('utm_campaign', 'consultation');
    if (sourcePage) url.searchParams.set('utm_content', 'from=' + sourcePage);
    frame = document.createElement('iframe');
    frame.title = 'Book a Found First call with Nick using his Modern Apex calendar';
    frame.referrerPolicy = 'origin';
    frame.src = url.href;
    wrap.hidden = false;
    wrap.appendChild(frame);
    launch.hidden = true;
    status.textContent = 'Loading available times. You can also open the calendar below.';
    timer = setTimeout(() => {
      status.textContent = 'If the calendar has not appeared, open it in a new tab below.';
    }, 12000);
    track('booking_calendar_open');
    frame.focus();
  });
  direct.addEventListener('click', () => track('booking_fallback_click'));
  window.addEventListener('message', event => {
    if (!event.isTrusted || event.origin !== origin || !frame || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.event === 'calendly.event_type_viewed') {
      clearTimeout(timer);
      status.textContent = 'Choose a day and time. Your booking is complete when Calendly confirms it.';
    }
    if (data.event === 'calendly.date_and_time_selected' && !selected) {
      selected = true;
      track('booking_time_selected');
    }
    if (data.event !== 'calendly.event_scheduled') return;
    const scheduledURI = data.payload?.event?.uri;
    const inviteeURI = data.payload?.invitee?.uri;
    if (typeof scheduledURI !== 'string' || typeof inviteeURI !== 'string') return;
    const scheduled = scheduledURI.match(eventPattern);
    const invitee = inviteeURI.match(inviteePattern);
    if (!scheduled || !invitee || scheduled[1] !== invitee[1]) return;
    clearTimeout(timer);
    confirmed.hidden = false;
    status.textContent = 'Your meeting is confirmed. The invitation contains your meeting details.';
    if (seen.has(inviteeURI)) return;
    seen.add(inviteeURI);
    const key = 'ff_booking_confirmed_' + invitee[2];
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (_) { /* The in-memory set still prevents duplicate events on this page. */ }
    track('booking_confirmed');
  });
})();
