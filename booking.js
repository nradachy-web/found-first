// Older cached booking pages load this file and have no Google Calendar iframe.
(() => {
  const direct = document.getElementById('booking-direct');
  const open = document.getElementById('booking-open');
  if (!direct || !open) return;
  direct.href = 'https://calendar.app.google/7rwJFKEyR5bztjwy6';
  open.addEventListener('click', () => location.assign(direct.href));
})();

(() => {
  const screen = document.querySelector('.booking-screen');
  const stage = document.querySelector('.book-stage');
  if (!screen || !stage || !window.ResizeObserver) return;

  // Google switches to a tall, stacked month and time list below 600 CSS pixels.
  // Give the calendar room for both columns, then fit that canvas to the page.
  const minWidth = 612;
  const calendarHeight = 932;
  screen.classList.add('is-fitted');

  function fit() {
    const { width, height } = stage.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(1, width / minWidth, height / calendarHeight);
    stage.style.setProperty('--frame-scale', scale);
    stage.style.setProperty('--frame-width', (width / scale) + 'px');
    stage.style.setProperty('--frame-height', (height / scale) + 'px');
  }

  fit();
  new ResizeObserver(fit).observe(stage);
})();
