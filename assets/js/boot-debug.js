/* boot-debug.js — v2.3.4 proxy-HUD-hand robust sync (MAIN) */
(function(){ window.__THE_GREY_BUILD='v2.3.4-mobile-proxy-hand-robust (main)'; window.__BUILD_SOURCE='boot-debug.js'; })();

/* legacy class */
(function(){ const run=()=>document.getElementById('app')?.classList.add('tg-canvas'); 
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run(); })();

/* layers / wrappers / info blocks (minimal) */
(function(){
  function mk(id){ const d=document.createElement('div'); d.id=id; return d; }
  document.addEventListener('DOMContentLoaded', ()=>{
    if(!document.getElementById('tgHandLayer')){
      const layer=mk('tgHandLayer'); const inner=document.createElement('div'); inner.id='tgHandLayerInner'; layer.appendChild(inner); document.body.appendChild(layer);
    }
    if(!document.getElementById('tgNoSelectOverlay')) document.body.appendChild(mk('tgNoSelectOverlay'));
    if(!document.getElementById('tgHandAnchor')){ const a=mk('tgHandAnchor'); document.getElementById('app')?.appendChild(a); }
    // Info blocks created in prior version; keep if present.
    if(!document.getElementById('tgBoardInfoTop')){ const div=mk('tgBoardInfoTop'); div.className='tg-board-info'; div.innerHTML='<div class="line1"><span class="name"></span><span class="hearts"></span></div><div class="trance"></div>'; document.getElementById('app')?.appendChild(div); }
    if(!document.getElementById('tgBoardInfoBot')){ const div=mk('tgBoardInfoBot'); div.className='tg-board-info'; div.innerHTML='<div class="line1"><span class="name"></span><span class="hearts"></span></div><div class="trance"></div>'; document.getElementById('app')?.appendChild(div); }
  }, {once:true});
})();

/* ---------- Canvas fit & scaled width ---------- */
(function(){
  const DESIGN_W=1280, DESIGN_H=720, root=document.documentElement;
  const isLandscape=()=> window.matchMedia('(orientation: landscape)').matches || innerWidth >= innerHeight;
  function apply(){
    const el=document.getElementById('app'); if(!el) return;
    const vw=innerWidth, vh=innerHeight;
    if(!isLandscape()){
      el.style.width=DESIGN_W+'px'; el.style.height=DESIGN_H+'px';
      el.style.transform='translate(-50%, -50%) scale(0.9)';
      root.style.setProperty('--tg-scaled-width', Math.min(vw, DESIGN_W) + 'px');
    }else{
      const scale=Math.min(vw/DESIGN_W, vh/DESIGN_H);
      el.style.width=DESIGN_W+'px'; el.style.height=DESIGN_H+'px';
      el.style.transform=`translate(-50%, -50%) scale(${scale})`;
      root.style.setProperty('--tg-scaled-width', Math.round(DESIGN_W*scale)+'px');
    }
    root.classList.add('mobile-land');
    updateHandAnchor();
    placeBoardInfos?.();
  }
  addEventListener('resize', apply, {passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', apply, {once:true}); else apply();
})();

/* kill legacy toggles; force compact */
(function(){
  function run(){ ['tgAFZoom','tgCompactToggle'].forEach(id=>document.getElementById(id)?.remove());
    const r=document.documentElement; r.classList.remove('af-zoom'); r.classList.add('mobile-mini'); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();

/* ---------- PROXY HAND (robust) ----------------------------------------- */
(function(){
  const PROXY_ATTR='data-proxy-key';
  let uid=1, rafHandle=0, pollHandle=0;

  const hudHand   = ()=> document.querySelector('#tgHandLayerInner .hand') || createHudHand();
  const canvasHand= ()=> document.querySelector('#app .hand');

  function createHudHand(){
    const h=document.createElement('div'); h.className='hand';
    document.getElementById('tgHandLayerInner')?.appendChild(h);
    return h;
  }
  function keyFor(el){
    // Prefer a stable id from game if present
    const stable = el.getAttribute('data-card-id') || el.getAttribute('data-id') || el.id;
    if(stable){ el.setAttribute(PROXY_ATTR, stable); return stable; }
    if(el.getAttribute(PROXY_ATTR)) return el.getAttribute(PROXY_ATTR);
    const k=String(uid++); el.setAttribute(PROXY_ATTR, k); return k;
  }
  function cloneCard(src){
    const k=keyFor(src);
    const clone=src.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute(PROXY_ATTR, k);
    return clone;
  }
  function syncAll(){
    const ch=canvasHand(); const hh=hudHand(); if(!ch || !hh) return;
    const seen=new Set();

    // Source set: all .card under canvas hand (deep)
    ch.querySelectorAll('.card').forEach(src=>{
      const k=keyFor(src); seen.add(k);
      let dst = hh.querySelector(`.card[${PROXY_ATTR}="${k}"]`);
      if(!dst){
        dst = cloneCard(src);
        hh.appendChild(dst);
      }else{
        // keep simple: mirror text content (labels/costs) and classes
        dst.className = src.className;
        dst.innerHTML = src.innerHTML;
      }
      // Copy inline transform so the fan/tilt looks same
      dst.style.transform = src.style.transform || '';
    });

    // Remove HUD cards that the engine removed
    hh.querySelectorAll(`.card[${PROXY_ATTR}]`).forEach(n=>{
      if(!seen.has(n.getAttribute(PROXY_ATTR))) n.remove();
    });
  }
  function scheduleSync(){ cancelAnimationFrame(rafHandle); rafHandle=requestAnimationFrame(syncAll); }

  function startObservers(){
    const app=document.getElementById('app'); if(!app) return;
    // Observe the entire app tree; engine often rebuilds branches
    const obs=new MutationObserver(scheduleSync);
    obs.observe(app, {childList:true, subtree:true});
    scheduleSync();

    // Safety poll for late async loads (stops after first non-empty sync)
    let tries=0;
    function poll(){
      tries++;
      scheduleSync();
      const hh=document.querySelector('#tgHandLayerInner .hand');
      if(hh && hh.querySelector('.card')) { clearInterval(pollHandle); return; }
      if(tries>40) { clearInterval(pollHandle); } // ~4s max
    }
    pollHandle=setInterval(poll, 100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', startObservers, {once:true}); else startObservers();
})();

/* ---------- Long-press 2× preview (HUD cards) + neighbor spread ---------- */
(function(){
  const LONG_MS=260, MOVE_TOL=8;
  let timer=null, startX=0, startY=0, target=null;

  const overlay=()=>document.getElementById('tgNoSelectOverlay');

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

  function show(){ overlay()?.classList.add('show'); target.classList.add('magnify-hand'); spreadNeighbors(true); }
  function hide(){
    clearTimeout(timer); timer=null; overlay()?.classList.remove('show');
    if(!target) return; target.classList.remove('magnify-hand'); spreadNeighbors(false); target=null;
  }
  function begin(el, x, y){ hide(); target=el; startX=x; startY=y; timer=setTimeout(show, LONG_MS); }
  function moved(x,y){ if(!target) return; if(Math.abs(x-startX)>MOVE_TOL || Math.abs(y-startY)>MOVE_TOL) hide(); }

  addEventListener('touchstart', e=>{ const t=e.target.closest('#tgHandLayer .card'); if(!t) return; const p=e.changedTouches[0]; begin(t,p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchmove',  e=>{ if(!target) return; const p=e.changedTouches[0]; moved(p.clientX,p.clientY); }, {passive:true});
  addEventListener('touchend', hide, {passive:true});
  addEventListener('touchcancel', hide, {passive:true});
  addEventListener('mousedown', e=>{ const t=e.target.closest('#tgHandLayer .card'); if(!t) return; begin(t,e.clientX,e.clientY); });
  addEventListener('mousemove', e=>moved(e.clientX,e.clientY));
  addEventListener('mouseup', hide); addEventListener('mouseleave', hide);
  addEventListener('visibilitychange', ()=>{ if(document.hidden) hide(); });
  addEventListener('blur', hide);
})();

/* ---------- Hand-origin proxy for animations ---------- */
function updateHandAnchor(){
  const anchor = document.getElementById('tgHandAnchor');
  const app    = document.getElementById('app');
  const hand   = document.querySelector('#tgHandLayer .hand');
  if(!anchor || !app || !hand) return;

  const appRect  = app.getBoundingClientRect();
  const handRect = hand.getBoundingClientRect();
  const scale    = appRect.width / 1280;

  const cx = handRect.left + handRect.width/2;
  const cy = handRect.bottom - handRect.height*0.25;

  const x_app = (cx - appRect.left) / scale;
  const y_app = (cy - appRect.top ) / scale;

  anchor.style.left = x_app + 'px';
  anchor.style.top  = y_app + 'px';
}
window.getHandAnchorRect = () => document.getElementById('tgHandAnchor')?.getBoundingClientRect?.() || null;
addEventListener('resize', updateHandAnchor, {passive:true});
addEventListener('orientationchange', updateHandAnchor);
document.addEventListener('DOMContentLoaded', updateHandAnchor, {once:true});

/* ---------- External board info (unchanged from 2.3.3) ---------- */
function placeBoardInfos(){
  const app = document.getElementById('app'); if(!app) return;
  const boards = [...app.querySelectorAll('.board')];
  if(boards.length < 2) return;

  const top    = boards[0].getBoundingClientRect();
  const bottom = boards[boards.length-1].getBoundingClientRect();
  const appRect= app.getBoundingClientRect(); const scale= appRect.width / 1280;
  const toApp  = (x,y)=> ({x:(x-appRect.left)/scale, y:(y-appRect.top)/scale});

  const getTrance = (board)=> {
    const tags = [...board.querySelectorAll('.traits .tag, .trances .tag')].map(n=>n.textContent.trim());
    if(tags.length) return tags.join(' • ');
    const chips = [...board.querySelectorAll('.chips .chip')].map(n=>n.textContent.trim());
    return chips.join(' • ');
  };

  const aiName  = (boards[0].querySelector('.name')?.textContent || 'Spellweaver (AI)').trim();
  const youName = (boards[boards.length-1].querySelector('.name')?.textContent || 'Spellweaver (You)').trim();
  const aiHearts  = (boards[0].querySelector('.hearts')?.textContent || '♥♥♥♥♥').trim();
  const youHearts = (boards[boards.length-1].querySelector('.hearts')?.textContent || '♥♥♥♥♥').trim();
  const aiTrance  = getTrance(boards[0]) || '';
  const youTrance = getTrance(boards[boards.length-1]) || '';

  const topCenter = toApp(top.left, (top.top+top.bottom)/2);
  const botCenter = toApp(bottom.left, (bottom.top+bottom.bottom)/2);

  const topBox = document.getElementById('tgBoardInfoTop');
  const botBox = document.getElementById('tgBoardInfoBot');

  if(topBox){
    topBox.querySelector('.name').textContent   = aiName;
    topBox.querySelector('.hearts').textContent = aiHearts;
    topBox.querySelector('.trance').textContent = aiTrance;
    topBox.style.left = (topCenter.x - 120) + 'px';
    topBox.style.top  = (topCenter.y - 26) + 'px';
  }
  if(botBox){
    botBox.querySelector('.name').textContent   = youName;
    botBox.querySelector('.hearts').textContent = youHearts;
    botBox.querySelector('.trance').textContent = youTrance;
    botBox.style.left = (botCenter.x - 120) + 'px';
    botBox.style.top  = (botCenter.y - 26) + 'px';
  }
}
