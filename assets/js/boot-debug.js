/* boot-debug.js — v2.2.6-mobile-centered (MAIN)
   • Enforce mobile compact layout (no toggle)
   • Remove +AF control and Compact/Mini button if present
   • Center scale as before; expose scaled width for HUD
*/
(function () {
  window.__THE_GREY_BUILD = 'v2.2.6-mobile-centered (main)';
  window.__BUILD_SOURCE = 'boot-debug.js';
})();

/* Ensure #app has the canvas class for any legacy rules */
(function ensureCanvasClass(){
  function run(){ document.getElementById('app')?.classList.add('tg-canvas'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
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

/* Scale 1280×720 to fit; expose scaled width for HUD */
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

/* Remove +AF and Compact/Mini; enforce compact */
(function enforceMobilePolicy(){
  function nuke(id){ const el = document.getElementById(id); if (el) el.remove(); }
  function run(){
    // Remove UI controls if they exist
    nuke('tgAFZoom');       // +AF
    nuke('tgCompactToggle');// Compact/Mini

    // Enforce compact layout classes and clear any zoom flags
    const root = document.documentElement;
    root.classList.remove('af-zoom');
    root.classList.add('mobile-mini'); // force compact visuals if any styles key off it
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* Keep snap + badge helpers as-is */
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
