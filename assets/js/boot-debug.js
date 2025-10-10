/* boot-debug.js — v2.3.1-mobile-hud-hand+real-preview (MAIN) */
(function(){ window.__THE_GREY_BUILD='v2.3.1-mobile-hud-hand+real-preview (main)'; window.__BUILD_SOURCE='boot-debug.js'; })();

/* Keep legacy class for old selectors */
(function(){ const run=()=>document.getElementById('app')?.classList.add('tg-canvas'); 
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run(); })();

/* One-time layers */
(function(){
  function mk(id){ const d=document.createElement('div'); d.id=id; return d; }
  document.addEventListener('DOMContentLoaded', ()=>{
    if(!document.getElementById('tgHandLayer'))  document.body.appendChild(mk('tgHandLayer'));
    if(!document.getElementById('tgNoSelectOverlay')) document.body.appendChild(mk('tgNoSelectOverlay'));
    // Anchor proxy lives *inside* the canvas
    if(!document.getElementById('tgHandAnchor')){ const a=mk('tgHandAnchor'); document.getElementById('app')?.appendChild(a); }
  }, {once:true});
})();

/* Move the in-canvas hand into the fixed HUD layer */
(function(){
  function moveHand(){
    const hand=document.querySelector('#app .hand'); const dest=document.getElementById('tgHandLayer');
    if(hand && dest && !dest.contains(hand)) dest.appendChild(hand);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', moveHand, {once:true}); else moveHand();
})();

/* Fit 1280×720 canvas and set --tg-scaled-width; robust landscape check */
(function(){
  const DESIGN_W=1280, DESIGN_H=720, root=document.documentElement;
  const isLandscape=()=> window.matchMedia('(orientation: landscape)').matches || innerWidth >= innerHeight;
  function apply(){
    const el=document.getElementById('app'); if(!el) return;
    const vw=innerWidth, vh=innerHeight;
    if(!isLandscape()){
      document.getElementById('tgRotateOverlay')?.classList.add('show');
      el.style.width=DESIGN_W+'px'; el.style.height=DESIGN_H+'px';
      el.style.transform='translate(-50%, -50%) scale(0.9)';
      root.style.setProperty('--tg-scaled-width', Math.min(vw, DESIGN_W) + 'px');
    }else{
      document.getElementById('tgRotateOverlay')?.classList.remove('show');
      const scale=Math.min(vw/DESIGN_W, vh/DESIGN_H);
      el.style.width=DESIGN_W+'px'; el.style.height=DESIGN_H+'px';
      el.style.transform=`translate(-50%, -50%) scale(${scale})`;
      root.style.setProperty('--tg-scaled-width', Math.round(DESIGN_W*scale)+'px');
    }
    root.classList.add('mobile-land');
    updateHandAnchor(); // keep proxy in sync with current scale/layout
  }
  addEventListener('resize', apply, {passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', apply, {once:true}); else apply();
})();

/* Remove legacy toggles; force compact */
(function(){
  function run(){ ['tgAFZoom','tgCompactToggle'].forEach(id=>document.getElementById(id)?.remove());
    const r=document.documentElement; r.classList.remove('af-zoom'); r.classList.add('mobile-mini'); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* -------- REAL-CARD 2× PREVIEW + HAND SPREAD (no DOM clone) -------- */
(function(){
  const LONG_MS=260, MOVE_TOL=8;
  let timer=null, startX=0, startY=0, target=null, isHand=false;

  const overlay=()=>document.getElementById('tgNoSelectOverlay');
  const isCard=el=>el && (el.classList?.contains('card') || el.classList?.contains('af-card'));

  function spreadNeighbors(on){
    const hand=document.querySelector('#tgHandLayer .hand'); if(!hand || !target) return;
    hand.classList.toggle('spread', on);
    const cards=[...hand.querySelectorAll('.card')]; const idx=cards.indexOf(target);
    const baseOffset=16, baseZ=100;
    cards.forEach((c,i)=>{
      if(!on){
        if(c.dataset._spreadPrev){ c.style.transform=c.dataset._spreadPrev; delete c.dataset._spreadPrev; }
        c.style.zIndex='';
      }else{
        const prev=c.style.transform||''; c.dataset._spreadPrev=prev;
        if(i!==idx) c.style.transform=`${prev} translateX(${(i-idx)*baseOffset}px)`;
        c.style.zIndex = i===idx ? baseZ+50 : baseZ+(10-Math.abs(i-idx));
      }
    });
  }

  function show(){
    overlay()?.classList.add('show');
    if(isHand){
      target.classList.add('magnify-hand');
      spreadNeighbors(true);
    }else{
      target.classList.add('magnify');
    }
  }
  function hide(){
    clearTimeout(timer); timer=null;
    overlay()?.classList.remove('show');
    if(!target) return;
    target.classList.remove('magnify','magnify-hand');
    if(isHand) spreadNeighbors(false);
    target=null; isHand=false;
  }
  function begin(el, x, y){
    hide(); target=el; isHand=!!el.closest('#tgHandLayer'); startX=x; startY=y;
    timer=setTimeout(show, LONG_MS);
  }
  function moved(x, y){ if(!target) return;
    if(Math.abs(x-startX)>MOVE_TOL || Math.abs(y-startY)>MOVE_TOL) hide(); }

  addEventListener('touchstart', e=>{ const t=e.target.closest('.card, .af-card'); if(!isCard(t)) return;
    const p=e.changedTouches[0]; begin(t,p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchmove', e=>{ if(!target) return; const p=e.changedTouches[0]; moved(p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchend', hide, {passive:true});
  addEventListener('touchcancel', hide, {passive:true});

  addEventListener('mousedown', e=>{ const t=e.target.closest('.card, .af-card'); if(!isCard(t)) return;
    begin(t,e.clientX,e.clientY); });
  addEventListener('mousemove', e=>moved(e.clientX,e.clientY));
  addEventListener('mouseup', hide); addEventListener('mouseleave', hide);
  addEventListener('visibilitychange', ()=>{ if(document.hidden) hide(); });
  addEventListener('blur', hide);
})();

/* -------- Hand-origin proxy inside #app for draw/discard animations --------
   This keeps an invisible anchor (#tgHandAnchor) *inside the scaled canvas*
   aligned to the visual center of the HUD hand. If your animation code looks
   up a DOM rect for the hand, point it to #tgHandAnchor (or call
   window.getHandAnchorRect()) and you’ll get the correct on-screen origin.
---------------------------------------------------------------------------- */
function updateHandAnchor(){
  const anchor = document.getElementById('tgHandAnchor');
  const app    = document.getElementById('app');
  const hand   = document.querySelector('#tgHandLayer .hand');
  if(!anchor || !app || !hand) return;

  const appRect  = app.getBoundingClientRect();
  const handRect = hand.getBoundingClientRect();

  // Map screen point -> app-local coordinates (1280×720 space)
  const scale = appRect.width / 1280; // same scale used on #app
  const centerX_screen = handRect.left + handRect.width/2;
  const centerY_screen = handRect.top  + handRect.height*0.65; // a bit above bottom of fan

  const x_app = (centerX_screen - appRect.left) / scale;
  const y_app = (centerY_screen - appRect.top)  / scale;

  anchor.style.left = x_app + 'px';
  anchor.style.top  = y_app + 'px';
}

/* Export a helper for the animation system, if wanted */
window.getHandAnchorRect = () => document.getElementById('tgHandAnchor')?.getBoundingClientRect?.() || null;

/* Keep proxy in sync when layout changes */
addEventListener('resize', updateHandAnchor, {passive:true});
addEventListener('orientationchange', updateHandAnchor);
document.addEventListener('DOMContentLoaded', updateHandAnchor, {once:true});
