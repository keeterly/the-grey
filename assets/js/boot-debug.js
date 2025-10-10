/* boot-debug.js — v2.3.2 hand-resize+dedup, board-info-outside (MAIN) */
(function(){ window.__THE_GREY_BUILD='v2.3.2-mobile-hand-resize+dedup (main)'; window.__BUILD_SOURCE='boot-debug.js'; })();

/* Keep legacy class for old selectors */
(function(){ const run=()=>document.getElementById('app')?.classList.add('tg-canvas'); 
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run(); })();

/* Layers & wrappers */
(function(){
  function mk(id){ const d=document.createElement('div'); d.id=id; return d; }
  document.addEventListener('DOMContentLoaded', ()=>{
    if(!document.getElementById('tgHandLayer')){
      const layer=mk('tgHandLayer'); const inner=document.createElement('div'); inner.id='tgHandLayerInner'; layer.appendChild(inner); document.body.appendChild(layer);
    }
    if(!document.getElementById('tgNoSelectOverlay')) document.body.appendChild(mk('tgNoSelectOverlay'));
    if(!document.getElementById('tgHandAnchor')){ const a=mk('tgHandAnchor'); document.getElementById('app')?.appendChild(a); }
    // Info blocks
    if(!document.getElementById('tgBoardInfoTop')){ const div=mk('tgBoardInfoTop'); div.className='tg-board-info'; document.getElementById('app')?.appendChild(div); }
    if(!document.getElementById('tgBoardInfoBot')){ const div=mk('tgBoardInfoBot'); div.className='tg-board-info'; document.getElementById('app')?.appendChild(div); }
  }, {once:true});
})();

/* Move any canvas hand into HUD layer (and keep it there) */
(function(){
  const destInner = ()=> document.getElementById('tgHandLayerInner');
  function moveHandsOnce(){
    const hands=[...document.querySelectorAll('#app .hand')];
    const dest=destInner(); if(!dest) return;
    hands.forEach(h=>{ if(!dest.contains(h)) dest.appendChild(h); });
  }
  // initial
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', moveHandsOnce, {once:true}); else moveHandsOnce();
  // Mutation watcher (engine may recreate the hand at end/begin turn)
  const obs=new MutationObserver(()=> moveHandsOnce());
  document.addEventListener('DOMContentLoaded', ()=>{ const app=document.getElementById('app'); if(app) obs.observe(app,{childList:true,subtree:true}); });
})();

/* Fit 1280×720 and set --tg-scaled-width, update anchors/infos */
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
    updateHandAnchor();    // keep the proxy aligned
    placeBoardInfos();     // position external info blocks
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

/* -------- REAL-CARD 2× PREVIEW + HAND SPREAD -------- */
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
    if(isHand){ target.classList.add('magnify-hand'); spreadNeighbors(true); }
    else      { target.classList.add('magnify'); }
  }
  function hide(){
    clearTimeout(timer); timer=null;
    overlay()?.classList.remove('show');
    if(!target) return;
    target.classList.remove('magnify','magnify-hand');
    if(isHand) spreadNeighbors(false);
    target=null; isHand=false;
  }
  function begin(el, x, y){ hide(); target=el; isHand=!!el.closest('#tgHandLayer'); startX=x; startY=y; timer=setTimeout(show, LONG_MS); }
  function moved(x, y){ if(!target) return; if(Math.abs(x-startX)>MOVE_TOL || Math.abs(y-startY)>MOVE_TOL) hide(); }

  addEventListener('touchstart', e=>{ const t=e.target.closest('.card, .af-card'); if(!isCard(t)) return; const p=e.changedTouches[0]; begin(t,p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchmove', e=>{ if(!target) return; const p=e.changedTouches[0]; moved(p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchend', hide, {passive:true});
  addEventListener('touchcancel', hide, {passive:true});
  addEventListener('mousedown', e=>{ const t=e.target.closest('.card, .af-card'); if(!isCard(t)) return; begin(t,e.clientX,e.clientY); });
  addEventListener('mousemove', e=>moved(e.clientX,e.clientY));
  addEventListener('mouseup', hide); addEventListener('mouseleave', hide);
  addEventListener('visibilitychange', ()=>{ if(document.hidden) hide(); });
  addEventListener('blur', hide);
})();

/* -------- Hand origin proxy inside #app for draw/discard animations -------- */
function updateHandAnchor(){
  const anchor = document.getElementById('tgHandAnchor');
  const app    = document.getElementById('app');
  const hand   = document.querySelector('#tgHandLayer .hand');
  if(!anchor || !app || !hand) return;

  const appRect  = app.getBoundingClientRect();
  const handRect = hand.getBoundingClientRect();
  const scale    = appRect.width / 1280;

  const cx = handRect.left + handRect.width/2;
  const cy = handRect.bottom - handRect.height*0.25; // slightly above bottom of fan

  const x_app = (cx - appRect.left) / scale;
  const y_app = (cy - appRect.top ) / scale;

  anchor.style.left = x_app + 'px';
  anchor.style.top  = y_app + 'px';
}
window.getHandAnchorRect = () => document.getElementById('tgHandAnchor')?.getBoundingClientRect?.() || null;
addEventListener('resize', updateHandAnchor, {passive:true});
addEventListener('orientationchange', updateHandAnchor);
document.addEventListener('DOMContentLoaded', updateHandAnchor, {once:true});

/* -------- External board info (name/hearts) placed adjacent to boards ------ */
function placeBoardInfos(){
  const app = document.getElementById('app'); if(!app) return;
  const boards = [...app.querySelectorAll('.board')];
  if(boards.length < 2) return;

  const top    = boards[0].getBoundingClientRect();
  const mid    = app.querySelector('.aetherflow')?.getBoundingClientRect?.();
  const bottom = boards[boards.length-1].getBoundingClientRect();

  const appRect = app.getBoundingClientRect();
  const scale   = appRect.width / 1280;

  function toApp(x,y){ return { x:(x-appRect.left)/scale, y:(y-appRect.top)/scale }; }

  // Grab bits from original DOM if present (fallback to defaults)
  const aiName  = (boards[0].querySelector('.name')?.textContent || 'Spellweaver (AI)').trim();
  const youName = (boards[boards.length-1].querySelector('.name')?.textContent || 'Spellweaver (You)').trim();
  const aiHearts  = (boards[0].querySelector('.hearts')?.textContent || '♥♥♥♥♥').trim();
  const youHearts = (boards[boards.length-1].querySelector('.hearts')?.textContent || '♥♥♥♥♥').trim();

  // Position: to the left of each board, vertically centered
  const topCenter = toApp(top.left, (top.top+top.bottom)/2);
  const botCenter = toApp(bottom.left, (bottom.top+bottom.bottom)/2);

  const topBox = document.getElementById('tgBoardInfoTop');
  const botBox = document.getElementById('tgBoardInfoBot');

  if(topBox){
    topBox.innerHTML = `<span class="name">${aiName}</span><span class="hearts">${aiHearts}</span>`;
    topBox.style.left = (topCenter.x - 110) + 'px';
    topBox.style.top  = (topCenter.y - 18) + 'px';
  }
  if(botBox){
    botBox.innerHTML = `<span class="name">${youName}</span><span class="hearts">${youHearts}</span>`;
    botBox.style.left = (botCenter.x - 110) + 'px';
    botBox.style.top  = (botCenter.y - 18) + 'px';
  }
}
