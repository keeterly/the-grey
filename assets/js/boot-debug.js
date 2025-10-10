/* boot-debug.js — v2.3.0-mobile-hud-hand+clean-preview (MAIN) */
(function(){ window.__THE_GREY_BUILD='v2.3.0-mobile-hud-hand+clean-preview (main)'; window.__BUILD_SOURCE='boot-debug.js'; })();

/* Ensure #app has the legacy class for any old selectors */
(function(){ const r=()=>document.getElementById('app')?.classList.add('tg-canvas'); 
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', r, {once:true}); else r(); })();

/* One-time infrastructure layers */
(function(){
  function mk(id){ const d=document.createElement('div'); d.id=id; return d; }
  document.addEventListener('DOMContentLoaded', ()=>{
    if(!document.getElementById('tgNoSelectOverlay')) document.body.appendChild(mk('tgNoSelectOverlay'));
    if(!document.getElementById('tgPreviewLayer'))   document.body.appendChild(mk('tgPreviewLayer'));
    if(!document.getElementById('tgHandLayer'))      document.body.appendChild(mk('tgHandLayer'));
  }, {once:true});
})();

/* Move the in-game .hand into the fixed HUD-like layer so it doesn't scale */
(function(){
  function moveHand(){
    const hand = document.querySelector('#app .hand');
    const dest = document.getElementById('tgHandLayer');
    if(hand && dest && !dest.contains(hand)){ dest.appendChild(hand); }
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', moveHand, {once:true});
  } else moveHand();
})();

/* Fit 1280×720 canvas to viewport; expose scaled width for HUD/Hand layers */
(function(){
  const DESIGN_W=1280, DESIGN_H=720, root=document.documentElement;
  const round2=n=>Math.round(n*100)/100, isPort=()=>innerHeight>innerWidth;
  function apply(){
    const el=document.getElementById('app'); if(!el) return;
    const vw=innerWidth, vh=innerHeight;
    if(isPort()){
      root.classList.add('mobile-land');
      el.style.width=DESIGN_W+'px'; el.style.height=DESIGN_H+'px';
      el.style.transform='translate(-50%,-50%) scale(0.9)';
      root.style.setProperty('--tg-scaled-width', Math.min(vw, DESIGN_W) + 'px');
      return;
    }
    root.classList.add('mobile-land');
    const scale=round2(Math.min(vw/DESIGN_W, vh/DESIGN_H));
    el.style.width=DESIGN_W+'px'; el.style.height=DESIGN_H+'px';
    el.style.transform=`translate(-50%,-50%) scale(${scale})`;
    root.style.setProperty('--tg-scaled-width', Math.round(DESIGN_W*scale)+'px');
  }
  addEventListener('resize', apply, {passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', apply, {once:true}); else apply();
})();

/* Remove legacy toggles and force compact visuals */
(function(){
  function run(){
    for(const id of ['tgAFZoom','tgCompactToggle']) document.getElementById(id)?.remove();
    const r=document.documentElement; r.classList.remove('af-zoom'); r.classList.add('mobile-mini');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* ---------- Press-and-hold 2× preview, with HUD-hand spread ---------- */
(function(){
  const LONG_MS=260, MOVE_TOL=8;
  let timer=null, startX=0, startY=0, src=null, isHand=false, preview=null;

  const prevLayer = ()=>document.getElementById('tgPreviewLayer');
  const overlay   = ()=>document.getElementById('tgNoSelectOverlay');
  const isCard    = el => el && (el.classList?.contains('card') || el.classList?.contains('af-card'));

  function makeClone(card){
    const rect=card.getBoundingClientRect();
    const wrap=document.createElement('div');
    wrap.className='preview-card' + (isHand?' is-hand':'');
    // Place wrapper at the card's center; scale handled in CSS (pure transform)
    wrap.style.left = (rect.left + rect.width/2) + 'px';
    wrap.style.top  = (rect.top  + rect.height/2) + 'px';

    // Actual DOM content: clone without ids to avoid collisions
    const inner = card.cloneNode(true);
    inner.removeAttribute('id');
    inner.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    // Ensure inner card renders exactly the same — no extra sizing
    inner.style.width = rect.width + 'px';
    inner.style.height= rect.height + 'px';
    inner.style.transform = ''; // neutralize any fan tilt from inline transforms
    wrap.appendChild(inner);
    return wrap;
  }

  function spreadNeighbors(on){
    const hand = document.querySelector('#tgHandLayer .hand'); if(!hand || !src) return;
    hand.classList.toggle('spread', on);
    const cards=[...hand.querySelectorAll('.card')];
    const idx=cards.indexOf(src), baseOffset=16, baseZ=100;
    cards.forEach((c,i)=>{
      if(!on){
        if(c.dataset._spreadPrev){ c.style.transform=c.dataset._spreadPrev; delete c.dataset._spreadPrev; }
        c.style.zIndex='';
      }else{
        const prev=c.style.transform||''; c.dataset._spreadPrev=prev;
        if(i!==idx){ c.style.transform=`${prev} translateX(${(i-idx)*baseOffset}px)`; }
        c.style.zIndex = i===idx ? baseZ+50 : baseZ+(10-Math.abs(i-idx));
      }
    });
  }

  function show(card){
    const layer=prevLayer(); if(!layer) return;
    preview=makeClone(card);
    layer.appendChild(preview); layer.classList.add('show');
    overlay()?.classList.add('show');
    if(isHand) spreadNeighbors(true);
  }

  function hide(){
    clearTimeout(timer); timer=null;
    overlay()?.classList.remove('show');
    const layer=prevLayer(); if(layer && preview) layer.removeChild(preview);
    if(isHand) spreadNeighbors(false);
    preview=null; src=null; isHand=false;
  }

  function begin(card, x, y){
    hide(); src=card; isHand=!!card.closest('#tgHandLayer');
    startX=x; startY=y;
    timer=setTimeout(()=>show(card), LONG_MS);
  }
  const moved=(x,y)=>{ if(!src) return; if(Math.abs(x-startX)>MOVE_TOL || Math.abs(y-startY)>MOVE_TOL) hide(); };

  /* Touch */
  addEventListener('touchstart', e=>{ const t=e.target.closest('.card, .af-card'); if(!isCard(t)) return;
    const p=e.changedTouches[0]; begin(t,p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchmove',  e=>{ if(!src) return; const p=e.changedTouches[0]; moved(p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchend', hide, {passive:true});
  addEventListener('touchcancel', hide, {passive:true});

  /* Mouse (debugging) */
  addEventListener('mousedown', e=>{ const t=e.target.closest('.card, .af-card'); if(!isCard(t)) return;
    begin(t,e.clientX,e.clientY); });
  addEventListener('mousemove', e=>moved(e.clientX,e.clientY));
  addEventListener('mouseup', hide); addEventListener('mouseleave', hide);

  /* Extra safety against “ghosts” */
  addEventListener('visibilitychange', ()=>{ if(document.hidden) hide(); });
  addEventListener('blur', hide);
})();

/* Snap effect + version badge (unchanged) */
(function(){
  function attach(el){ const obs=new MutationObserver(()=>{ el.querySelectorAll('.card').forEach(c=>{ c.classList.remove('drop-zoom'); void c.offsetWidth; c.classList.add('drop-zoom'); }); }); obs.observe(el,{childList:true,subtree:true}); }
  document.addEventListener('DOMContentLoaded', ()=>{ document.querySelectorAll('[data-board] .slots').forEach(attach); }, {once:true});
})();
(function(){
  document.addEventListener('DOMContentLoaded', ()=>{
    const right=document.querySelector('.hud-min .right'); if(!right) return;
    const pill=(id,s)=>{ const el=document.createElement('span'); el.id=id; el.className='hud-pill'; el.innerHTML=`<span class="sym">${s}</span><span class="val">0</span>`; return el; };
    const endBtn=document.getElementById('btnEnd')||right.lastElementChild;
    if(!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill','🜂'), endBtn);
    if(!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill','◇'), endBtn);
    if(!document.getElementById('tgVersion')){
      const v=document.createElement('div'); v.id='tgVersion'; v.className='tgVersion';
      v.textContent='The Grey — '+(window.__THE_GREY_BUILD||'dev')+' ['+(window.__BUILD_SOURCE||'?')+']';
      v.style.position='fixed'; v.style.left='8px'; v.style.bottom='8px'; v.style.opacity='0.6'; v.style.fontSize='12px';
      document.body.appendChild(v);
    }
  }, {once:true});
})();
