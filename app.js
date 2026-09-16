const motion = matchMedia('(prefers-reduced-motion: reduce)');
const glyphs = '.:+*#@/01';
const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
const mix = (a, b, t) => a + (b - a) * t;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = t => 1 - Math.pow(1 - clamp(t), 4);
const $ = id => document.getElementById(id);
const start = performance.now();
const root = document.documentElement;
const skipIntro = !!(root && root.classList && root.classList.contains('no-intro'));
// Hero motion begins after the entrance, or almost immediately on a repeat view this session.
const heroDelay = skipIntro ? 150 : 1100;
if ($('year')) $('year').textContent = new Date().getFullYear();

// Brief entrance, never a loading gate. CSS clears it even if this script fails.
const intro = document.querySelector('.intro');
let introFrame = 0, introDone = false;
function finishIntro() {
  if (introDone) return;
  introDone = true;
  cancelAnimationFrame(introFrame);
  intro?.remove();
  try { sessionStorage.setItem('ff-intro', '1'); } catch (e) {}
}
function drawIntro(now) {
  const t = (now - start) / 1250;
  const word = 'FOUND FIRST';
  const wordEl = $('intro-word'), noiseEl = $('intro-noise'), countEl = $('intro-count');
  if (wordEl) wordEl.textContent = [...word].map((c, i) =>
    c === ' ' || i < t * 15 - 2 ? c : glyphs[Math.floor(hash(i + Math.floor(now / 65)) * glyphs.length)]).join('');
  const cols = Math.min(210, Math.ceil(innerWidth / 9));
  const rows = Math.min(85, Math.ceil(innerHeight / 16));
  if (Math.floor(now / 85) !== drawIntro.last && noiseEl) {
    drawIntro.last = Math.floor(now / 85);
    let noise = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) noise += hash(x + y * 71 + drawIntro.last) > .74 ? glyphs[Math.floor(hash(x * 9 + y + drawIntro.last) * glyphs.length)] : ' ';
      noise += '\n';
    }
    noiseEl.textContent = noise;
  }
  if (countEl) countEl.textContent = t < .8 ? '···' : '[ FF ]';
  if (t < 1) introFrame = requestAnimationFrame(drawIntro);
}
if (intro) {
  if (skipIntro || motion.matches) finishIntro();
  else {
    introFrame = requestAnimationFrame(drawIntro);
    setTimeout(finishIntro, 1900);
    setTimeout(finishIntro, 3000);
  }
}

const scenes = [];
const visible = new Set();
let animationFrame = 0;
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
  requestDraw();
}, {rootMargin: '70px'});

class Scene {
  constructor(id) {
    this.canvas = $(id);
    this.ctx = this.canvas.getContext('2d', {alpha: true});
    this.width = 1; this.height = 1;
    this.pointer = {x: .5, y: .5, active: false};
    this.canvas.addEventListener('pointermove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer = {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, active: e.pointerType !== 'touch'};
    }, {passive: true});
    this.canvas.addEventListener('pointerleave', () => { this.pointer.active = false; });
    this.resizeObserver = new ResizeObserver(() => { this.resize(); requestDraw(); });
    this.resizeObserver.observe(this.canvas);
    observer.observe(this.canvas);
    scenes.push(this);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width; this.height = rect.height;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.onResize?.();
  }
  clear() { this.ctx.clearRect(0, 0, this.width, this.height); }
}

// The approved sculptural FF, sampled into glyphs that gather from noise and settle into the vector mark.
class Monogram extends Scene {
  constructor(id = 'hero-canvas') {
    super(id);
    this.isIntro = id === 'intro-canvas';
    this.delay = this.isIntro ? 0 : heroDelay;
    this.image = new Image();
    this.image.onload = () => {
      this.buildPoints();
      this.canvas.parentElement.classList.add('is-ready');
      requestDraw();
    };
    this.image.src = './assets/mark.svg';
    this.rotation = 0;
  }
  buildPoints() {
    const cols = 83, rows = 93;
    const sample = document.createElement('canvas'); sample.width = cols; sample.height = rows;
    const c = sample.getContext('2d', {willReadFrequently: true});
    c.drawImage(this.image, 0, 0, cols, rows);
    const pixels = c.getImageData(0, 0, cols, rows).data;
    this.points = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const darkness = (1 - (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 765) * (pixels[i + 3] / 255);
      if (darkness > .025) this.points.push({x: (x / cols - .5) * .893, y: y / rows - .5, d: darkness, r: hash(i), ch: glyphs[Math.min(7, Math.floor(darkness * 15))]});
    }
  }
  draw(now) {
    if (!this.points) return;
    const {ctx: c, width: w, height: h} = this;
    this.clear();
    const t = motion.matches ? 1 : ease((now - start - this.delay) / (this.isIntro ? 1000 : 1500));
    const fidelity = motion.matches ? 1 : ease((now - start - this.delay - (this.isIntro ? 600 : 1300)) / 700);
    const size = Math.min(w * 1.06, h * .97);
    const rotate = motion.matches ? 0 : Math.sin(now / 6500) * .075 + (this.pointer.active ? (this.pointer.x - .5) * .17 : 0);
    this.rotation = mix(this.rotation, rotate, .035);
    const lift = motion.matches ? 0 : Math.sin(now / 3600) * 4;
    c.font = `${Math.max(5.5, size / 103)}px "IBM Plex Mono",monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.globalAlpha = 1 - fidelity;
    if (fidelity < 1) for (const p of this.points) {
      const spread = 1 - t;
      let x = p.x * size * Math.cos(this.rotation) + Math.sin(this.rotation) * p.d * 45;
      let y = p.y * size + lift;
      x += Math.sin(p.r * 70) * spread * w * .8;
      y += Math.cos(p.r * 31) * spread * h * .8;
      if (this.pointer.active && !motion.matches) {
        const dx = x + w / 2 - this.pointer.x * w, dy = y + h / 2 - this.pointer.y * h;
        const dist = Math.hypot(dx, dy); const force = Math.max(0, 1 - dist / 85) * 5;
        x += dx / (dist || 1) * force; y += dy / (dist || 1) * force;
      }
      const shimmer = motion.matches ? 0 : Math.sin(now / 1500 + p.y * 8) * .08;
      c.fillStyle = `rgba(0,0,0,${clamp(.35 + p.d * 2 + shimmer) * (.25 + .75 * t)})`;
      const char = t < .95 ? glyphs[Math.floor(hash(p.r + Math.floor(now / 90)) * glyphs.length)] : p.ch;
      c.fillText(char, w / 2 + x, h / 2 + y);
    }
    c.globalAlpha = fidelity;
    c.save(); c.translate(w / 2, h / 2 + lift);
    c.transform(Math.cos(this.rotation), this.rotation * .07, this.rotation * .1, 1, 0, 0);
    c.drawImage(this.image, -size * .893 / 2, -size / 2, size * .893, size);
    c.restore(); c.globalAlpha = 1;
  }
}

// A slowly turning glyph field behind the black section, masked so the message sits in clear space.
class Signal extends Scene {
  constructor() { super('signal-canvas'); this.pattern = null; }
  onResize() {
    const tile = document.createElement('canvas'); tile.width = 400; tile.height = 400;
    const c = tile.getContext('2d'); c.font = '10px "IBM Plex Mono",monospace';
    for (let y = 0; y < 400; y += 15) for (let x = 0; x < 400; x += 12) {
      c.fillStyle = `rgba(255,255,255,${.12 + hash(x + y) * .6})`;
      c.fillText(glyphs[Math.floor(hash(x + y * 11) * glyphs.length)], x, y);
    }
    this.pattern = tile;
  }
  draw(now) {
    if (!this.pattern) this.onResize();
    const {ctx: c, width: w, height: h} = this; this.clear();
    const x0 = w * .74, y0 = h * .5;
    c.save();
    c.translate(x0, y0); c.rotate(motion.matches ? -.23 : now / 180000 - .23);
    const reach = Math.max(w, h) * 1.4;
    c.fillStyle = c.createPattern(this.pattern, 'repeat');
    c.fillRect(-reach, -reach, reach * 2, reach * 2);
    c.restore();
    c.globalCompositeOperation = 'destination-in';
    const g = c.createRadialGradient(x0, y0, 20, x0, y0, w * .7);
    g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(.3, 'rgba(0,0,0,.75)');
    g.addColorStop(.6, 'rgba(0,0,0,.35)'); g.addColorStop(.85, 'rgba(0,0,0,.08)'); g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    const left = c.createLinearGradient(0, 0, w, 0); left.addColorStop(0, '#000'); left.addColorStop(.42, 'rgba(0,0,0,.95)'); left.addColorStop(.8, 'transparent');
    c.fillStyle = left; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
  }
}

// The wordmark cut out of a drifting glyph field: the name is the negative space.
class Negative extends Scene {
  onResize() {
    const tile = document.createElement('canvas'); tile.width = 360; tile.height = 360;
    const c = tile.getContext('2d'); c.font = '11px "IBM Plex Mono",monospace';
    for (let y = 0; y < 360; y += 12) for (let x = 0; x < 360; x += 8) {
      c.fillStyle = `rgba(0,0,0,${.3 + hash(x * 7 + y) * .65})`;
      c.fillText(glyphs[Math.floor(hash(x + y * 14) * glyphs.length)], x, y);
    }
    this.pattern = tile;
  }
  draw(now) {
    if (!this.pattern) this.onResize();
    const {ctx: c, width: w, height: h} = this; this.clear();
    c.fillStyle = c.createPattern(this.pattern, 'repeat');
    const drift = motion.matches ? 0 : (now / 160) % 360;
    c.save(); c.translate(-drift, 0); c.fillRect(0, 0, w + 360, h); c.restore();
    c.globalCompositeOperation = 'destination-out';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const size = Math.min(w * .128, 150);
    c.font = `800 ${size}px Manrope,Arial,sans-serif`;
    const rect = this.canvas.getBoundingClientRect();
    const progress = motion.matches ? 1 : clamp((innerHeight - rect.top) / (innerHeight * .65));
    c.globalAlpha = ease(progress);
    c.fillText('FOUND FIRST', w / 2, h * .52);
    c.globalAlpha = 1;
    const fade = c.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, '#000'); fade.addColorStop(.23, 'transparent'); fade.addColorStop(.73, 'transparent'); fade.addColorStop(1, '#000');
    c.fillStyle = fade; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    this.canvas.parentElement.classList.add('is-ready');
  }
}

if ($('intro-canvas') && !motion.matches && !skipIntro) new Monogram('intro-canvas');
if ($('hero-canvas')) new Monogram();
if ($('signal-canvas')) new Signal();
if ($('negative-canvas')) new Negative('negative-canvas');
function draw(now) {
  animationFrame = 0;
  if (document.hidden) return;
  for (const scene of scenes) if (visible.has(scene.canvas)) scene.draw(now);
  if (!motion.matches && visible.size) animationFrame = requestAnimationFrame(draw);
}
function requestDraw() { if (!animationFrame && !document.hidden) animationFrame = requestAnimationFrame(draw); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(animationFrame); animationFrame = 0; cancelAnimationFrame(demoFrame); demoFrame = 0; }
  else { requestDraw(); requestDemo(); }
});
motion.addEventListener('change', () => { requestDraw(); if (motion.matches) demoStatic(demoIndex); else requestDemo(); });
addEventListener('scroll', () => { if (motion.matches) requestDraw(); }, {passive: true});
document.fonts.ready.then(() => { scenes.forEach(s => s.resize()); requestDraw(); });

// Headline words resolve out of glyph noise once, when they come into view.
const scrambleObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting || motion.matches) return;
    const el = entry.target, text = el.dataset.scramble;
    if (!text) return;
    let began = performance.now();
    function tick(now) { const t = (now - began) / 850; el.textContent = [...text].map((c, i) => c === ' ' || i < t * text.length ? c : glyphs[Math.floor(hash(i + Math.floor(now / 55)) * glyphs.length)]).join(''); if (t < 1) requestAnimationFrame(tick); else el.textContent = text; }
    if (el.closest('.hero')) setTimeout(() => { began = performance.now(); requestAnimationFrame(tick); }, skipIntro ? 250 : 1300); else requestAnimationFrame(tick);
    scrambleObserver.unobserve(el);
  });
}, {threshold: .5});
document.querySelectorAll('[data-scramble]').forEach(el => { el.setAttribute('aria-label', el.dataset.scramble); scrambleObserver.observe(el); });

// The illustrated AI answer: a question is typed, the answer resolves, your business is found first, and a sponsored unit follows.
const scenarios = [
  {q: 'who does ceramic coating near Grand Rapids?', a: 'A few detail shops in Grand Rapids do ceramic coating. The one recommended most consistently:', why: 'clear service pages, consistent reviews', ad: '[ your business ]  Ceramic coating, booked this week'},
  {q: 'I need a plumber in Austin tonight. Who is open?', a: 'Several Austin plumbers list 24 hour service. The one cited most often for emergency calls:', why: 'hours and service area stated plainly', ad: '[ your business ]  24 hour service, call now'},
  {q: 'best window tint shop in Ann Arbor?', a: 'Based on reviews and detail pages, these shops come up for tint in Ann Arbor:', why: 'answer pages for the questions people ask', ad: '[ your business ]  Lifetime warranty tint, book online'}
];
const demo = $('demo');
const demoEl = {q: $('demo-q'), a: $('demo-a1'), you: $('demo-you'), why: $('demo-why'), ad: $('demo-ad-text'), step: $('demo-step')};
let demoIndex = 0, phaseIndex = 0, phaseStart = 0, demoVisible = false, demoFrame = 0;
const scrambleTo = (text, p, now) => [...text].map((c, i) => c === ' ' || i < p * text.length ? c : glyphs[Math.floor(hash(i * 3 + Math.floor(now / 55)) * glyphs.length)]).join('');
const stepLabel = i => `0${i + 1} / 0${scenarios.length}`;
function demoPhases(s) { return [['clear', 60], ['type', Math.max(900, s.q.length * 38)], ['think', 520], ['answer', 760], ['you', 620], ['why', 520], ['ad', 700], ['hold', 3400]]; }
function demoStatic(i) {
  if (!demo) return;
  const s = scenarios[i];
  demoEl.q.textContent = s.q; demoEl.a.textContent = s.a; demoEl.you.textContent = '[ your business ]'; demoEl.why.textContent = s.why; demoEl.ad.textContent = s.ad;
  demo.classList.remove('is-typing'); demo.classList.add('is-you-on'); demo.classList.add('is-ad-on');
  demoEl.step.textContent = stepLabel(i);
}
function demoTick(now) {
  demoFrame = 0;
  if (!demoVisible || document.hidden || motion.matches) return;
  const s = scenarios[demoIndex], phases = demoPhases(s), [name, dur] = phases[phaseIndex];
  if (!phaseStart) phaseStart = now;
  const p = clamp((now - phaseStart) / dur);
  switch (name) {
    case 'clear':
      demoEl.q.textContent = ''; demoEl.a.textContent = ''; demoEl.why.textContent = ''; demoEl.ad.textContent = ''; demoEl.you.textContent = '[ your business ]';
      demo.classList.remove('is-you-on'); demo.classList.remove('is-ad-on'); demo.classList.add('is-typing');
      demoEl.step.textContent = stepLabel(demoIndex);
      break;
    case 'type': demoEl.q.textContent = s.q.slice(0, Math.floor(p * s.q.length)); break;
    case 'think': demo.classList.remove('is-typing'); demoEl.a.textContent = [0, 1, 2].map(i => glyphs[Math.floor(hash(i + Math.floor(now / 90)) * glyphs.length)]).join(' '); break;
    case 'answer': demoEl.a.textContent = scrambleTo(s.a, p, now); break;
    case 'you': demo.classList.add('is-you-on'); demoEl.you.textContent = scrambleTo('[ your business ]', p, now); break;
    case 'why': demoEl.why.textContent = s.why.slice(0, Math.floor(p * s.why.length)); break;
    case 'ad': demo.classList.add('is-ad-on'); demoEl.ad.textContent = scrambleTo(s.ad, p, now); break;
    default: break;
  }
  if (p >= 1) {
    phaseIndex++; phaseStart = now;
    if (phaseIndex >= phases.length) { phaseIndex = 0; demoIndex = (demoIndex + 1) % scenarios.length; }
  }
  demoFrame = requestAnimationFrame(demoTick);
}
function requestDemo() { if (demo && demoVisible && !demoFrame && !document.hidden && !motion.matches) { phaseStart = 0; demoFrame = requestAnimationFrame(demoTick); } }
if (demo) {
  if (motion.matches) demoStatic(0);
  new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.target === demo) demoVisible = entry.isIntersecting; });
    if (demoVisible) requestDemo(); else { cancelAnimationFrame(demoFrame); demoFrame = 0; }
  }, {threshold: .2}).observe(demo);
}

// Mobile: a single call to action rides along once the hero has scrolled away, and steps aside at the form.
const sticky = $('sticky-cta'), hero = $('home'), contact = $('contact');
if (sticky && hero && contact) {
  let heroIn = true, contactIn = false;
  const link = sticky.querySelector ? sticky.querySelector('a') : null;
  const stickyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target === hero) heroIn = entry.isIntersecting;
      if (entry.target === contact) contactIn = entry.isIntersecting;
    });
    const show = !heroIn && !contactIn;
    sticky.classList.toggle('is-visible', show);
    sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (link) link.setAttribute('tabindex', show ? '0' : '-1');
  }, {threshold: .05});
  stickyObserver.observe(hero);
  stickyObserver.observe(contact);
}

// The brief builder writes the email for the visitor. Nothing is stored; the visitor's own mail app sends it.
const EMAIL = 'nick@modernapexstrategies.com';
const form = $('brief-form'), status = $('brief-status'), copyButton = $('copy-brief');
function briefData() {
  const f = form.elements || {};
  const get = name => ((f[name] && f[name].value) || '').trim();
  const checked = form.querySelector ? form.querySelector('input[name="Interested in"]:checked') : null;
  return {site: get('Website'), sell: get('What we sell'), interest: checked ? checked.value : 'Both', notes: get('Notes')};
}
function briefSubject(d) { return `Found First | AI visibility check | ${d.site || 'my business'}`; }
function briefBody(d) {
  return `Hi Nick,\n\nI'd like a free AI visibility check.\n\nWebsite: ${d.site}\nWhat we sell, and where: ${d.sell}\nInterested in: ${d.interest}\n${d.notes ? `Notes: ${d.notes}\n` : ''}\nThanks`;
}
function setStatus(text) { if (status) { status.textContent = text; status.classList.add('is-ok'); } }
if (form) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (form.reportValidity && !form.reportValidity()) return;
    const d = briefData();
    location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(briefSubject(d))}&body=${encodeURIComponent(briefBody(d))}`;
    setStatus(`Your email app should open with the message ready. If it did not, use "Copy the message instead" and send it to ${EMAIL}.`);
  });
}
if (copyButton) {
  copyButton.addEventListener('click', async () => {
    const d = briefData();
    const text = `To: ${EMAIL}\nSubject: ${briefSubject(d)}\n\n${briefBody(d)}`;
    try { await navigator.clipboard.writeText(text); setStatus(`Copied. Paste it into any email to ${EMAIL}.`); }
    catch (e) { setStatus(`Copy is not available here. Email ${EMAIL} with your website and what you sell.`); }
  });
}
