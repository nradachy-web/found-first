const $ = id => document.getElementById(id);
if ($('year')) $('year').textContent = new Date().getFullYear();

// Sculptural ASCII derived from the approved brand mark. This is artwork, not study data.
const canvas = $('answer-field');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const control = $('research-motion');
  const image = new Image();
  const glyphs = '.:+*#@';
  let points = [], width = 0, height = 0, frame = 0, visible = false, paused = false, elapsed = 0, last = 0;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const isStill = () => reduced.matches || paused;
  function paint(t) {
    ctx.clearRect(0,0,width,height);
    const scale = Math.min(width*.72/84,height*.74/94);
    const settle = isStill() ? 1 : Math.min(1,t/2800);
    const ease = 1-Math.pow(1-settle,4);
    const turn = isStill() ? 0 : Math.sin(t/7000)*.12;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    // Quiet depth grid around the central sculpture.
    ctx.font='9px "IBM Plex Mono", monospace';
    for(let y=65;y<height-60;y+=24) for(let x=24;x<width-20;x+=24) {
      const d=Math.hypot((x-width/2)/width,(y-height/2)/height);
      if(d>.3) { ctx.fillStyle='rgba(255,255,255,.11)'; ctx.fillText('+',x,y); }
    }
    ctx.font=`${Math.max(5,scale*1.13)}px "IBM Plex Mono", monospace`;
    for(const p of points) {
      const delay=Math.max(0,Math.min(1,(ease-p.seed*.16)/.84));
      const scatter=(1-delay);
      const drift=isStill()?0:Math.sin(t/1800+p.y*.09)*.75;
      const x=width/2+(p.x-42)*scale*Math.cos(turn)+(p.y-47)*scale*turn*.32+(p.seed-.5)*width*scatter*1.8;
      const y=height/2+(p.y-47)*scale+drift+(hash(p.i+12)-.5)*height*scatter;
      const scan=isStill()?0:Math.exp(-Math.pow((p.y-((t/95)%150-25))/8,2));
      ctx.fillStyle=`rgba(255,255,255,${Math.min(.98,.45+p.dark*.43+scan*.3)*(.3+.7*delay)})`;
      ctx.fillText(glyphs[Math.min(5,Math.floor(p.dark*4+p.seed*1.5))],x,y);
    }
  }
  function loop(now) {
    frame=0;
    if(!visible||document.hidden) {last=0;return;}
    if(!last)last=now;
    const dt=now-last;
    if(dt>=32||isStill()){if(!isStill())elapsed+=Math.min(dt,70);last=now;paint(elapsed);}
    if(!isStill())frame=requestAnimationFrame(loop);
  }
  function wake(){if(!frame&&visible&&!document.hidden){if(isStill())paint(elapsed);else frame=requestAnimationFrame(loop);}}
  function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint(elapsed);wake();}
  image.onload=()=>{const sample=document.createElement('canvas');sample.width=84;sample.height=94;const s=sample.getContext('2d',{willReadFrequently:true});s.drawImage(image,0,0,84,94);const data=s.getImageData(0,0,84,94).data;for(let y=0;y<94;y++)for(let x=0;x<84;x++){const i=(y*84+x)*4;const dark=1-(data[i]+data[i+1]+data[i+2])/765;if(data[i+3]>40&&dark>.1)points.push({x,y,dark,seed:hash(i),i});}canvas.parentElement.classList.add('ready');resize();};
  image.src='./assets/mark.svg';
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible&&frame){cancelAnimationFrame(frame);frame=0;last=0;}wake();},{threshold:.05}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;last=0;}wake();});
  reduced.addEventListener('change',()=>{if(frame)cancelAnimationFrame(frame);frame=0;last=0;control.hidden=reduced.matches;wake();});
  control.hidden=reduced.matches;
  control.addEventListener('click',()=>{paused=!paused;control.setAttribute('aria-pressed',String(paused));control.textContent=paused?'Resume animation':'Pause animation';if(frame)cancelAnimationFrame(frame);frame=0;last=0;wake();});
  document.fonts.ready.then(resize);
}
const filter=$('model-filter');
if(filter)filter.addEventListener('change',e=>{const mode=e.target.value;document.querySelectorAll('[data-method]').forEach(row=>{row.hidden=mode!=='all'&&row.dataset.method!==mode;});$('coverage-summary').textContent=mode==='native'?'12 planned routes / 10 completed':mode==='external'?'6 planned routes / 6 completed':'18 planned routes / 16 completed';});
const industry=$('industry-select');
if(industry)industry.addEventListener('change',()=>{const tree=industry.value==='tree';const panel=$('industry-example');panel.querySelector('h3').textContent=tree?'From a tree concern to a useful local presence.':'From a leak question to a useful local presence.';panel.querySelector('p').textContent=tree?'An approved tree-risk explanation can become a service-page improvement, seasonal social content and an email for property owners. Industry opportunities can include eligible arborist directories, municipal resources and local property-manager audiences.':'An approved leak-detection answer can become a service-page improvement, a short explanation, a Google Business update and a customer email. Relevant profile checks can include eligible manufacturer finders and local property-manager resources.';});
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
