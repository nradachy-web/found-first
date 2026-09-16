const motion = matchMedia('(prefers-reduced-motion: reduce)');
const glyphs = '.:+*#@/01';
const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
const mix = (a, b, t) => a + (b - a) * t;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = t => 1 - Math.pow(1 - clamp(t), 4);
const start = performance.now();
document.getElementById('year').textContent = new Date().getFullYear();

// Brief entrance, never a loading gate. CSS clears it even if this script fails.
const intro = document.querySelector('.intro');
let introFrame;
function drawIntro(now) {
  if (motion.matches) { intro.remove(); return; }
  const t = (now - start) / 1600;
  const word = 'FOUND FIRST';
  document.getElementById('intro-word').textContent = [...word].map((c, i) =>
    c === ' ' || i < t * 15 - 2 ? c : glyphs[Math.floor(hash(i + Math.floor(now / 65)) * glyphs.length)]).join('');
  const cols = Math.min(210, Math.ceil(innerWidth / 9));
  const rows = Math.min(85, Math.ceil(innerHeight / 16));
  if (Math.floor(now / 85) !== drawIntro.last) {
    drawIntro.last = Math.floor(now / 85);
    let noise = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) noise += hash(x + y * 71 + drawIntro.last) > .74 ? glyphs[Math.floor(hash(x * 9 + y + drawIntro.last) * glyphs.length)] : ' ';
      noise += '\n';
    }
    document.getElementById('intro-noise').textContent = noise;
  }
  document.getElementById('intro-count').textContent = t < .9 ? '···' : '[ FF ]';
  if (t < 1.6) introFrame = requestAnimationFrame(drawIntro);
  else intro.remove();
}
introFrame = requestAnimationFrame(drawIntro);
setTimeout(() => { cancelAnimationFrame(introFrame); intro?.remove(); }, 3000);

const scenes = [];
const visible = new Set();
let animationFrame = 0;
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
  requestDraw();
}, {rootMargin: '70px'});

class Scene {
  constructor(id) {
    this.canvas = document.getElementById(id);
    this.ctx = this.canvas.getContext('2d', {alpha: true});
    this.width = 1; this.height = 1;
    this.pointer = {x: .5, y: .5, active: false};
    this.lastTime = 0;
    this.canvas.addEventListener('pointermove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer = {x: (e.clientX-r.left)/r.width, y: (e.clientY-r.top)/r.height, active: e.pointerType !== 'touch'};
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
    this.canvas.width = Math.round(this.width*this.dpr);
    this.canvas.height = Math.round(this.height*this.dpr);
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.onResize?.();
  }
  clear() { this.ctx.clearRect(0, 0, this.width, this.height); }
}

class Monogram extends Scene {
  constructor(id = 'hero-canvas') {
    super(id);
    this.isIntro = id === 'intro-canvas';
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
    const sample = document.createElement('canvas'); sample.width=cols; sample.height=rows;
    const c = sample.getContext('2d', {willReadFrequently:true});
    c.drawImage(this.image,0,0,cols,rows);
    const pixels=c.getImageData(0,0,cols,rows).data;
    this.points=[];
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
      const i=(y*cols+x)*4;
      const darkness=(1-(pixels[i]+pixels[i+1]+pixels[i+2])/765)*(pixels[i+3]/255);
      if(darkness>.025) this.points.push({x:(x/cols-.5)*(.893),y:y/rows-.5,d:darkness,r:hash(i),ch:glyphs[Math.min(7,Math.floor(darkness*15))]});
    }
  }
  draw(now) {
    if(!this.points) return;
    const {ctx:c,width:w,height:h}=this;
    this.clear();
    const t=motion.matches ? 1 : ease((now-start-(this.isIntro?0:1400))/(this.isIntro?1250:1800));
    const fidelity=motion.matches?1:ease((now-start-(this.isIntro?700:2900))/700);
    const size=Math.min(w*1.06,h*.97);
    const rotate=motion.matches ? 0 : Math.sin(now/6500)*.075+(this.pointer.active?(this.pointer.x-.5)*.17:0);
    this.rotation=mix(this.rotation,rotate,.035);
    const lift=motion.matches ? 0 : Math.sin(now/3600)*4;
    c.font=`${Math.max(5.5,size/103)}px "IBM Plex Mono",monospace`;
    c.textAlign='center';c.textBaseline='middle';
    c.globalAlpha=1-fidelity;
    for(const p of this.points){
      const spread=1-t;
      let x=p.x*size*Math.cos(this.rotation)+Math.sin(this.rotation)*p.d*45;
      let y=p.y*size+lift;
      x+=Math.sin(p.r*70)*spread*w*.8;
      y+=Math.cos(p.r*31)*spread*h*.8;
      if(this.pointer.active&&!motion.matches){
        const dx=x+w/2-this.pointer.x*w,dy=y+h/2-this.pointer.y*h;
        const dist=Math.hypot(dx,dy);const force=Math.max(0,1-dist/85)*5;
        x+=dx/(dist||1)*force;y+=dy/(dist||1)*force;
      }
      const shimmer=motion.matches?0:Math.sin(now/1500+p.y*8)*.08;
      c.fillStyle=`rgba(0,0,0,${clamp(.35+p.d*2+shimmer)*(.25+.75*t)})`;
      const char=t<.95?glyphs[Math.floor(hash(p.r+Math.floor(now/90))*glyphs.length)]:p.ch;
      c.fillText(char,w/2+x,h/2+y);
    }
    c.globalAlpha=fidelity;
    c.save();c.translate(w/2,h/2+lift);
    c.transform(Math.cos(this.rotation),this.rotation*.07,this.rotation*.1,1,0,0);
    c.drawImage(this.image,-size*.893/2,-size/2,size*.893,size);
    c.restore();c.globalAlpha=1;
  }
}

class Signal extends Scene {
  constructor() {super('signal-canvas');this.pattern=null;}
  onResize() {
    const tile=document.createElement('canvas');tile.width=400;tile.height=400;
    const c=tile.getContext('2d');c.font='10px "IBM Plex Mono",monospace';
    for(let y=0;y<400;y+=15) for(let x=0;x<400;x+=12){
      c.fillStyle=`rgba(255,255,255,${.12+hash(x+y)*.6})`;
      c.fillText(glyphs[Math.floor(hash(x+y*11)*glyphs.length)],x,y);
    }
    this.pattern=tile;
  }
  draw(now) {
    if(!this.pattern)this.onResize();
    const {ctx:c,width:w,height:h}=this;this.clear();
    const x0=w*.8,y0=h*.49;
    c.save();
    c.translate(x0,y0);c.rotate(motion.matches?-.23:now/180000-.23);
    const reach=Math.max(w,h)*1.4;
    c.fillStyle=c.createPattern(this.pattern,'repeat');
    c.fillRect(-reach,-reach,reach*2,reach*2);
    c.restore();
    // Negative space leaves room for the message, while a broad field moves behind it.
    c.globalCompositeOperation='destination-in';
    const g=c.createRadialGradient(x0,y0,20,x0,y0,w*.65);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.22,'rgba(0,0,0,.8)');
    g.addColorStop(.45,'rgba(0,0,0,.55)');g.addColorStop(.77,'rgba(0,0,0,.1)');g.addColorStop(1,'transparent');
    c.fillStyle=g;c.fillRect(0,0,w,h);
    c.globalCompositeOperation='destination-out';
    const left=c.createLinearGradient(0,0,w,0);left.addColorStop(0,'black');left.addColorStop(.47,'rgba(0,0,0,.95)');left.addColorStop(.85,'transparent');
    c.fillStyle=left;c.fillRect(0,0,w,h);c.globalCompositeOperation='source-over';
  }
}

class Negative extends Scene {
  onResize(){
    const tile=document.createElement('canvas');tile.width=360;tile.height=360;
    const c=tile.getContext('2d');c.font='11px "IBM Plex Mono",monospace';
    for(let y=0;y<360;y+=12) for(let x=0;x<360;x+=8){
      c.fillStyle=`rgba(0,0,0,${.3+hash(x*7+y)*.65})`;
      c.fillText(glyphs[Math.floor(hash(x+y*14)*glyphs.length)],x,y);
    }
    this.pattern=tile;
  }
  draw(now){
    if(!this.pattern)this.onResize();
    const {ctx:c,width:w,height:h}=this;this.clear();
    c.fillStyle=c.createPattern(this.pattern,'repeat');
    const drift=motion.matches?0:(now/160)%360;
    c.save();c.translate(-drift,0);c.fillRect(0,0,w+360,h);c.restore();
    c.globalCompositeOperation='destination-out';
    c.textAlign='center';c.textBaseline='middle';
    const size=Math.min(w*.128,150);
    c.font=`800 ${size}px Manrope,Arial,sans-serif`;
    const rect=this.canvas.getBoundingClientRect();
    const progress=motion.matches?1:clamp((innerHeight-rect.top)/(innerHeight*.65));
    c.globalAlpha=ease(progress);
    c.fillText('FOUND FIRST',w/2,h*.52);
    c.globalAlpha=1;
    const fade=c.createLinearGradient(0,0,0,h);
    fade.addColorStop(0,'black');fade.addColorStop(.23,'transparent');fade.addColorStop(.73,'transparent');fade.addColorStop(1,'black');
    c.fillStyle=fade;c.fillRect(0,0,w,h);
    c.globalCompositeOperation='source-over';
    this.canvas.parentElement.classList.add('is-ready');
  }
}

if(document.getElementById('intro-canvas')&&!motion.matches)new Monogram('intro-canvas');
new Monogram();new Signal();new Negative('negative-canvas');
function draw(now){
  animationFrame=0;
  if(document.hidden)return;
  for(const scene of scenes) if(visible.has(scene.canvas))scene.draw(now);
  if(!motion.matches&&visible.size)animationFrame=requestAnimationFrame(draw);
}
function requestDraw(){if(!animationFrame&&!document.hidden)animationFrame=requestAnimationFrame(draw);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animationFrame);animationFrame=0;}else requestDraw();});
motion.addEventListener('change',requestDraw);
addEventListener('scroll',()=>{if(motion.matches)requestDraw();},{passive:true});
document.fonts.ready.then(()=>{scenes.forEach(s=>s.resize());requestDraw();});

const scrambleObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting||motion.matches)return;
    const el=entry.target,text=el.dataset.scramble;
    let began=performance.now();
    function tick(now){const t=(now-began)/850;el.textContent=[...text].map((c,i)=>c===' '||i<t*text.length?c:glyphs[Math.floor(hash(i+Math.floor(now/55))*glyphs.length)]).join('');if(t<1)requestAnimationFrame(tick);else el.textContent=text;}
    if(el.closest('.hero'))setTimeout(()=>{began=performance.now();requestAnimationFrame(tick);},1900);else requestAnimationFrame(tick);
    scrambleObserver.unobserve(el);
  });
},{threshold:.5});
document.querySelectorAll('[data-scramble]').forEach(el=>{el.setAttribute('aria-label',el.dataset.scramble);scrambleObserver.observe(el);});
