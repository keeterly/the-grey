/* boot-debug.js — v2.2.8-mobile-2x-preview+even (MAIN)
   • 2× press-and-hold preview (board/AF + MTGA-style for hand)
   • Disable selection/callout while interacting
   • Boards: equal height (CSS vars handle sizes)
*/
(function () {
  window.__THE_GREY_BUILD = 'v2.2.8-mobile-2x-preview+even (main)';
  window.__BUILD_SOURCE = 'boot-debug.js';
})();

/* Ensure #app has the canvas class */
(function ensureCanvasClass(){
  function run(){ document.getElementById('app')?.classList.add('tg-canvas'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* Add a tiny transparent overlay to kill selection/callout while holding */
(function ensureNoSelectOverlay(){
  const el = document.createElement('div');
  el.id = 'tgNoSelectOverlay';
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(el), {once:true});
})();

/* Portrait overlay once */
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

/* Press-and-hold preview (2×). Hand cards lift upward MTGA-style. */
(function cardMagnify(){
  const LONG_MS = 260;          // press duration to trigger
  const MOVE_TOL = 8;           // px move cancels (treat as drag)
  let timer = null, startX=0, startY=0, target = null, magnified = null, isHand = false;

  const overlay = ()=> document.getElementById('tgNoSelectOverlay');

  const isCard = (el)=> el && (el.classList?.contains('card') || el.classList?.contains('af-card'));

  function showOverlay(on){
    const o = overlay(); if (!o) return;
    o.classList.toggle('show', !!on);
  }

  function beginPress(el, x, y){
    clearTimeout(timer);
    target = el; startX = x; startY = y;
    isHand = !!el.closest('.hand');
    timer = setTimeout(()=> {
      if (!target) return;
      magnified = target;
      // Remove any inline transform from fan tilt so text is straight while previewing
      magnified.dataset._prevTransform = magnified.style.transform || '';
      magnified.style.transform = '';  // let CSS class own the transform
      magnified.classList.add(isHand ? 'magnify-hand' : 'magnify');
      showOverlay(true);
    }, LONG_MS);
  }

  function move(x, y){
    if (!target) return;
    if (Math.abs(x - startX) > MOVE_TOL || Math.abs(y - startY) > MOVE_TOL){
      cancel(); // treat as drag
    }
  }

  function cancel(){
    clearTimeout(timer); timer = null;
    target = null;
    showOverlay(false);
    if (magnified){
      magnified.classList.remove('magnify', 'magnify-hand');
      // Restore any previous transform (e.g., hand fan rotation)
      if (magnified.dataset._prevTransform !== undefined){
        magnified.style.transform = magnified.dataset._prevTransform;
        delete magnified.dataset._prevTransform;
      }
      magnified = null;
    }
  }

  /* Touch (non-passive so we can prevent accidental selection if needed) */
  document.addEventListener('touchstart', (e)=>{
    const t = e.target.closest('.card, .af-card');
    if (!isCard(t)) return;
    const touch = e.changedTouches[0];
    beginPress(t, touch.clientX, touch.clientY);
  }, {passive:true});

  document.addEventListener('touchmove', (e)=>{
    if (!target) return;
    const touch = e.changedTouches[0];
    move(touch.clientX, touch.clientY);
  }, {passive:true});

  document.addEventListener('touchend', cancel, {passive:true});
  document.addEventListener('touchcancel', cancel, {passive:true});

  /* Mouse (desktop debugging) */
  document.addEventListener('mousedown', (e)=>{
    const t = e.target.closest('.card, .af-card');
    if (!isCard(t)) return;
    beginPress(t, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', (e)=> move(e.clientX, e.clientY));
  document.addEventListener('mouseup', cancel);
  document.addEventListener('mouseleave', cancel);
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
