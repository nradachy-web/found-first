/* Found First homepage motion: header state, scroll reveals, the illustrated assistant and ASCII fields. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  doc.classList.add('lp-ready');

  /* Header gains a hairline once the page scrolls. */
  const header = document.querySelector('.ff-header');
  const onScroll = () => header && header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Reveal sections as they enter the viewport, staggering siblings. */
  const reveals = [...document.querySelectorAll('.lp-reveal')];
  for (const el of reveals) {
    const group = [...el.parentElement.children].filter((c) => c.classList.contains('lp-reveal'));
    const i = group.indexOf(el);
    if (i > 0) {
      el.style.transitionDelay = Math.min(i, 5) * 90 + 'ms';
      el.addEventListener('transitionend', () => { el.style.transitionDelay = ''; }, { once: true });
    }
  }
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  }

  /* Illustrated assistant: types a buyer question, streams an answer, then shows a labeled sponsored unit. */
  const chat = document.querySelector('[data-chat]');
  const source = document.getElementById('lp-scenarios');
  if (chat && source) {
    const scenarios = JSON.parse(source.textContent);
    const tabs = [...document.querySelectorAll('.lp-tab')];
    const composer = chat.querySelector('.lp-composer');
    const composerText = chat.querySelector('[data-composer]');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const markup = (s) => {
      const picks = s.picks.map(([name, desc], i) =>
        `<li class="${i === 0 ? 'is-you' : ''}"><span class="lp-pick-n">${i + 1}</span><span class="lp-pick-body"><strong>${esc(name)}</strong><span>${esc(desc)}</span></span>${i === 0 ? '<em>Best match</em>' : ''}</li>`).join('');
      const [an, ad, ac] = s.ad;
      return `<div class="lp-chat-body" data-chat-body><div class="lp-msg-user" data-part="user">${esc(s.q)}</div><div class="lp-msg-ai" data-part="ai"><span class="lp-ai-avatar"><i></i></span><div class="lp-ai-main"><p class="lp-ai-text" data-part="text">${esc(s.a)}</p><ol class="lp-picks" data-part="picks">${picks}</ol><div class="lp-ad" data-part="ad"><span class="lp-ad-label">Sponsored</span><div class="lp-ad-copy"><strong>${esc(an)}</strong><span>${esc(ad)}</span></div><span class="lp-ad-cta">${esc(ac)}</span></div></div></div></div>`;
    };
    const setTabs = (i) => tabs.forEach((t, n) => { t.classList.toggle('is-active', n === i); t.setAttribute('aria-pressed', n === i ? 'true' : 'false'); });

    let token = 0;
    let visible = false;
    let wake = null;
    const stage = chat.closest('.lp-stage');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && wake) { wake(); wake = null; } }, { threshold: 0.25 }).observe(stage);
    } else visible = true;
    const whenVisible = () => (visible && !document.hidden) ? Promise.resolve() : new Promise((r) => { wake = r; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && wake) { wake(); wake = null; } });

    const swap = (i) => {
      const old = chat.querySelector('[data-chat-body]');
      old.insertAdjacentHTML('afterend', markup(scenarios[i]));
      old.remove();
      return chat.querySelector('[data-chat-body]');
    };

    const play = async (i, first) => {
      const my = ++token;
      const alive = () => my === token;
      setTabs(i);
      const current = chat.querySelector('[data-chat-body]');
      if (!first) { current.classList.add('is-leaving'); await sleep(320); if (!alive()) return; }
      const body = swap(i);
      const user = body.querySelector('[data-part="user"]');
      const ai = body.querySelector('[data-part="ai"]');
      const text = body.querySelector('[data-part="text"]');
      const items = [...body.querySelectorAll('.lp-picks li')];
      const ad = body.querySelector('[data-part="ad"]');
      const full = text.textContent;
      [user, ai, ad, ...items].forEach((el) => el.classList.add('is-pending'));
      text.textContent = '';
      await whenVisible(); if (!alive()) return;
      await sleep(first ? 900 : 250); if (!alive()) return;

      const q = scenarios[i].q;
      composer.classList.add('is-typing');
      for (let k = 1; k <= q.length; k++) {
        composerText.textContent = q.slice(0, k);
        await sleep(22 + Math.random() * 34); if (!alive()) return;
      }
      await sleep(380); if (!alive()) return;
      composer.classList.remove('is-typing');
      composerText.textContent = 'Ask anything';
      user.classList.remove('is-pending');
      await sleep(420); if (!alive()) return;

      ai.classList.remove('is-pending');
      text.innerHTML = '<span class="lp-thinking"><i></i><i></i><i></i></span>';
      await sleep(900); if (!alive()) return;
      const words = full.split(' ');
      text.textContent = '';
      for (let w = 0; w < words.length; w++) {
        text.textContent = words.slice(0, w + 1).join(' ');
        await sleep(36 + Math.random() * 30); if (!alive()) return;
      }
      await sleep(220);
      for (const li of items) { if (!alive()) return; li.classList.remove('is-pending'); await sleep(170); }
      await sleep(420); if (!alive()) return;
      ad.classList.remove('is-pending');
      await sleep(6200); if (!alive()) return;
      await whenVisible(); if (!alive()) return;
      play((i + 1) % scenarios.length, false);
    };

    tabs.forEach((tab, i) => tab.addEventListener('click', () => {
      if (reduce) { token++; setTabs(i); swap(i); composerText.textContent = 'Ask anything'; composer.classList.remove('is-typing'); return; }
      composer.classList.remove('is-typing');
      composerText.textContent = 'Ask anything';
      play(i, false);
    }));
    if (!reduce) play(0, true);
  }

  /* ASCII fields drawn in IBM Plex Mono: a soft signal wave in the hero, the FF monogram at the close. */
  const FF = 'M140 0V1440H1020V1168H412V856H900V584H412V0Z';
  const fields = [...document.querySelectorAll('canvas[data-ascii]')];
  const start = (canvas) => {
    const mode = canvas.dataset.ascii;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ramp = mode === 'mark' ? ' .:-=+*%#@' : '  ..::-=+*';
    let W = 0, H = 0, cw = 0, ch = 0, cols = 0, rows = 0, mask = null, raf = 0, last = 0, onscreen = false, narrow = false;
    const layout = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      if (!W || !H) return false;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ch = mode === 'mark' ? (W < 640 ? 10 : 13) : (W < 640 ? 12 : 15);
      cw = ch * 0.6;
      cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
      ctx.font = `500 ${ch}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = 'top';
      mask = null;
      if (mode === 'mark') {
        const m = document.createElement('canvas');
        m.width = cols; m.height = rows;
        const mc = m.getContext('2d');
        const small = W < 640;
        narrow = !small && W < 1000;
        let sy = (rows * (small ? 0.2 : narrow ? 0.42 : 0.7)) / 1440;
        const ratio = ch / cw;
        const cap = (cols * (small ? 0.7 : narrow ? 0.8 : 0.4)) / (1940 * ratio);
        if (sy > cap) sy = cap;
        const sx = sy * ratio;
        const glyphW = 1940 * sx;
        const x0 = small ? cols * 0.07 : cols - glyphW - cols * 0.06;
        const y0 = small ? Math.max(2, (190 / ch - 1440 * sy) / 2) : narrow ? rows * 0.07 : (rows - 1440 * sy) / 2;
        const p = new Path2D(FF);
        mc.setTransform(sx, 0, 0, -sy, x0 - 140 * sx, y0 + 1440 * sy);
        mc.fill(p);
        mc.translate(1060, 0);
        mc.fill(p);
        const data = mc.getImageData(0, 0, cols, rows).data;
        mask = new Float32Array(cols * rows);
        for (let k = 0; k < cols * rows; k++) mask[k] = data[k * 4 + 3] / 255;
      }
      return true;
    };
    const draw = (t) => {
      ctx.clearRect(0, 0, W, H);
      const n = ramp.length - 1;
      if (mode === 'mark') {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const m = mask[y * cols + x];
            const wave = 0.5 + 0.5 * Math.sin(x * 0.21 + y * 0.13 - t * 0.0016) * Math.cos(y * 0.17 - t * 0.0009);
            let v, a;
            let c;
            if (m > 0.4) { v = 0.42 + 0.58 * wave; a = narrow ? 0.42 : 0.92; c = ramp[Math.min(n, Math.max(1, Math.round(v * n)))]; }
            else { v = wave * wave * wave; if (v < 0.42) continue; a = 0.13; c = v > 0.7 ? ':' : '.'; }
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillText(c, x * cw, y * ch);
          }
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.24)';
        for (let y = 0; y < rows; y++) {
          const yy = y / rows;
          for (let x = 0; x < cols; x++) {
            const xx = x / cols;
            const band = Math.sin(xx * 6.2 + t * 0.00045 + Math.sin(yy * 3.1 + t * 0.0003) * 1.6) * 0.5 + 0.5;
            const fade = Math.max(0, 1 - Math.abs(yy - 0.5 - Math.sin(xx * 3 + t * 0.0002) * 0.18) * 2.6);
            const v = band * fade;
            if (v < 0.3) continue;
            ctx.fillText(ramp[Math.min(n, Math.round(v * n))], x * cw, y * ch);
          }
        }
      }
    };
    const loop = (t) => {
      raf = 0;
      if (!onscreen || document.hidden) return;
      if (t - last > 33) { last = t; draw(t); }
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && onscreen && !document.hidden && !reduce) raf = requestAnimationFrame(loop); };
    const refresh = () => { if (layout()) { draw(reduce ? 0 : performance.now()); kick(); } };
    if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(canvas); else addEventListener('resize', refresh);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { onscreen = e.isIntersecting; kick(); }, { rootMargin: '100px' }).observe(canvas);
    } else onscreen = true;
    document.addEventListener('visibilitychange', kick);
    refresh();
  };
  const boot = () => fields.forEach(start);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('500 13px "IBM Plex Mono"').then(boot, boot);
  } else boot();
})();
