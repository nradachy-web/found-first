// Older cached booking pages load this file and have no Google Calendar iframe.
(() => {
  const direct = document.getElementById('booking-direct');
  const open = document.getElementById('booking-open');
  if (!direct || !open) return;
  direct.href = 'https://calendar.app.google/7rwJFKEyR5bztjwy6';
  open.addEventListener('click', () => location.assign(direct.href));
})();
