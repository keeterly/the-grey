/* boot-debug.js — v2.2.9-mobile-2x-preview+spread (MAIN)
   • Detached 2× preview clone => smooth, no ghost, no layout shifts
   • Hand neighbors spread while previewing
   • Equal board heights driven by CSS
   • Long-press still ~260ms; cancels on small drag
*/
(function () {
  window.__THE_GREY_BUILD = 'v2.2.9-mobile-2x-preview+spread (main)';
  window.__BUILD_SOURCE = 'boot-debug.js';
})();

/* Ensure #app has the canvas class */
(function ensureCanvasClass(){
  function run(){ document.getElementById('app')?.classList.add('tg-canvas'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* Build preview/no-select layers once */
(function ensureLayers(){
  function mk(id){ const d=document.createElement('div'); d.id=id; return d; }
  document.addEventListener('DOMContentLoaded', ()=>{
    if (!document.getElementById('tgNoSelectOverlay')) document.body.appendChild(mk('tgNoSelectOverlay'));
    if (!document.getElementById('tgPreviewLayer')) document.body.appendChild(mk('tgPreviewLayer'));
  }, {once:true});
})();

/* Portrait overlay (unchanged) */
(function ensureRotateOverlay(){
  if (document.getElementById('tgRotateOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'tgRotateOverlay';
  ov.className = 'tg-rotate-overlay';
  ov.innerHTML = `
    <div class="tg-rotate-card">
      <div class="tg-rotate-title">Rotate your device</div>
      <div class="tg-rotate-sub">Play in landscape for the best experience.</div>
    </div>`;
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(ov), {once:true});
})();

/* Fit 1280×720 and expose scaled width for HUD */
(function fitToScreen(){
  const DESIGN_W = 1280, DESIGN_H = 720;
  const root = document.documentElement;
  const round2 = (n)=> Math.round(n*100)/100;
  const isPortrait = ()=> window.innerHeight > window.innerWidth;

  function apply(){
    const el = document.getElementById('app'); if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;

    if (isPortrait()){
      root.classList.add('mobile-land');
      document.getElementById('tgRotateOverlay')?.classList.add('show');
      el.style.width = DESIGN_W + 'px';
      el.style.height = DESIGN_H + 'px';
      el.style.transform = 'translate(-50%, -50%) scale(0.9)';
      root.style.setProperty('--tg-scaled-width', Math.min(vw, DESIGN_W) + 'px');
      return;
    }

    document.getElementById('tgRotateOverlay')?.classList.remove('show');
    root.classList.add('mobile-land');

    const scale = round2(Math.min(vw / DESIGN_W, vh / DESIGN_H)); // exact fit, ≤1
    el.style.width = DESIGN_W + 'px';
    el.style.height = DESIGN_H + 'px';
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    root.style.setProperty('--tg-scaled-width', Math.round(DESIGN_W * scale) + 'px');
  }

  window.addEventListener('resize', apply, {passive:true});
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  apply();
})();

/* Enforce compact; remove legacy controls */
(function enforceMobilePolicy(){
  function nuke(id){ const el = document.getElementById(id); if (el) el.remove(); }
  function run(){
    nuke('tgAFZoom'); nuke('tgCompactToggle');
    const root = document.documentElement;
    root.classList.remove('af-zoom');
    root.classList.add('mobile-mini');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* ------------ 2× LONG-PRESS PREVIEW WITH HAND SPREAD ------------ */
(function cardPreview(){
  const LONG_MS = 260;      // hold to preview
  const MOVE_TOL = 8;       // treat as drag if moved more than this
  let timer=null, startX=0, startY=0, src=null, isHand=false, preview=null;

  const prevLayer = ()=> document.getElementById('tgPreviewLayer');
  const overlay   = ()=> document.getElementById('tgNoSelectOverlay');

  const isCard = el => el && (el.classList?.contains('card') || el.classList?.contains('af-card'));

  /* Build a visual clone without side-effects */
  function makeClone(card){
    const rect = card.getBoundingClientRect();
    const clone = card.cloneNode(true);
    clone.classList.add('preview-card');
    if (isHand) clone.classList.add('is-hand');

    // Reset any transforms (fan tilt) and position the clone at the same screen point
    clone.style.width  = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.left   = rect.left + rect.width/2 + 'px';
    clone.style.top    = rect.top  + rect.height/2 + 'px';

    // Strip attributes that might trigger game logic
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));

    return clone;
  }

  /* Hand neighbor spread: push siblings away a bit */
  function spreadNeighbors(card, on){
    const hand = card.closest('.hand');
    if (!hand) return;
    hand.classList.toggle('spread', on);

    if (!on){
      // restore original transforms if we touched them
      hand.querySelectorAll('.card').forEach(c=>{
        if (c.dataset._spreadPrev){
          c.style.transform = c.dataset._spreadPrev;
          delete c.dataset._spreadPrev;
        }
        c.style.zIndex = '';
      });
      return;
    }

    const cards = Array.from(hand.querySelectorAll('.card'));
    const idx = cards.indexOf(card);
    const baseOffset = 16;   // px
    const baseZ = 100;       // bring previewed card up
    cards.forEach((c,i)=>{
      c.style.zIndex = i === idx ? baseZ+50 : baseZ + (10 - Math.abs(i-idx));
      const prev = c.style.transform || '';
      c.dataset._spreadPrev = prev;
      if (i === idx) return; // leave center alone (preview clone handles visual)
      const delta = (i-idx) * baseOffset;
      c.style.transform = `${prev} translateX(${delta}px)`;
    });
  }

  function show(card, x, y){
    const layer = prevLayer(); if (!layer) return;
    preview = makeClone(card);
    layer.appendChild(preview);
    layer.classList.add('show');
    overlay()?.classList.add('show');
    if (isHand) spreadNeighbors(card, true);
  }

  function hide(){
    clearTimeout(timer); timer=null;
    overlay()?.classList.remove('show');
    const layer = prevLayer();
    if (layer && preview){ layer.removeChild(preview); }
    if (src && isHand) spreadNeighbors(src, false);
    preview = null; src = null; isHand = false;
  }

  function begin(card, x, y){
    hide(); // safety
    src = card; isHand = !!card.closest('.hand');
    startX = x; startY = y;
    timer = setTimeout(()=> show(card, x, y), LONG_MS);
  }

  function moved(x, y){
    if (!src) return;
    if (Math.abs(x-startX) > MOVE_TOL || Math.abs(y-startY) > MOVE_TOL) hide();
  }

  // Touch
  document.addEventListener('touchstart', (e)=>{
    const t = e.target.closest('.card, .af-card'); if (!isCard(t)) return;
    const p = e.changedTouches[0]; begin(t, p.clientX, p.clientY);
  }, {passive:true});
  document.addEventListener('touchmove', (e)=>{
    if (!src) return; const p = e.changedTouches[0]; moved(p.clientX, p.clientY);
  }, {passive:true});
  document.addEventListener('touchend', hide, {passive:true});
  document.addEventListener('touchcancel', hide, {passive:true});

  // Mouse (debugging)
  document.addEventListener('mousedown', (e)=>{
    const t = e.target.closest('.card, .af-card'); if (!isCard(t)) return;
    begin(t, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', (e)=> moved(e.clientX, e.clientY));
  document.addEventListener('mouseup', hide);
  document.addEventListener('mouseleave', hide);

  // Safety: close preview on visibility/page change to avoid “ghosts”
  document.addEventListener('visibilitychange', ()=> { if (document.hidden) hide(); });
  window.addEventListener('blur', hide);
})();

/* Snap + badge (unchanged) */
(function dropSnap(){
  function attach(el){
    const obs = new MutationObserver(()=>{ el.querySelectorAll('.card').forEach(c=>{ c.classList.remove('drop-zoom'); void c.offsetWidth; c.classList.add('drop-zoom'); }); });
    obs.observe(el, {childList:true, subtree:true});
  }
  document.addEventListener('DOMContentLoaded', ()=>{ document.querySelectorAll('[data-board] .slots').forEach(attach); }, {once:true});
})();
(function ensureBottomCounters(){
  document.addEventListener('DOMContentLoaded', ()=>{
    const right=document.querySelector('.hud-min .right'); if (!right) return;
    const pill=(id,sym)=>{ const el=document.createElement('span'); el.id=id; el.className='hud-pill'; el.innerHTML=`<span class="sym">${sym}</span><span class="val">0</span>`; return el; };
    const endBtn=document.getElementById('btnEnd')||right.lastElementChild;
    if (!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill','🜂'), endBtn);
    if (!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill','◇'), endBtn);

    if (!document.getElementById('tgVersion')){
      const v=document.createElement('div'); v.id='tgVersion'; v.className='tgVersion';
      v.textContent='The Grey — '+(window.__THE_GREY_BUILD||'dev')+' ['+(window.__BUILD_SOURCE||'?')+']';
      v.style.position='fixed'; v.style.left='8px'; v.style.bottom='8px'; v.style.opacity='0.6'; v.style.fontSize='12px';
      document.body.appendChild(v);
    }
  }, {once:true});
})();
