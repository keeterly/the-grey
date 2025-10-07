
export function initHandDnD(opts = {}){
  const hand = opts.hand || findHand();
  if(!hand){ console.warn('[tg] hand not found'); return; }
  const cardSel = opts.cardSelector || '[data-card]';
  const slotSel = opts.slotSelector || '.slot,[data-slot]';
  ensurePreviewLayer();
  if(cardSel === '[data-card]') autoTagCards(hand);
  bindAll(hand.querySelectorAll(cardSel));
  const mo = new MutationObserver(()=>{
    if(cardSel === '[data-card]') autoTagCards(hand);
    bindAll(hand.querySelectorAll(cardSel));
  });
  mo.observe(hand,{childList:true,subtree:true});

  function bindAll(nodes){ nodes.forEach(c=>{ if(c.__tgBound) return; c.__tgBound=true; c.classList.add('tg-card','tg-card-fan'); c.addEventListener('pointerdown',e=>onDown(e,c)); }); }
  function onDown(e,card){
    if(e.button && e.button!==0) return;
    const start={x:e.clientX,y:e.clientY}; let hold=null, preview=false, drag=false, ghost=null, ox=0, oy=0;
    const cancel=()=>{ if(hold){clearTimeout(hold);hold=null;} };
    const open=()=>{ if(drag||preview) return; preview=true; const layer=document.getElementById('tgPreviewLayer'); const clone=card.cloneNode(true); clone.classList.add('tg-preview-card'); layer.innerHTML=''; layer.appendChild(clone); layer.classList.add('active'); card.classList.add('tg-held'); if(isInstant(card)) card.classList.add('tg-instant','tg-held'); };
    const close=()=>{ if(!preview) return; preview=false; const layer=document.getElementById('tgPreviewLayer'); layer.classList.remove('active'); layer.innerHTML=''; card.classList.remove('tg-held','tg-instant'); };
    const startDrag=()=>{ if(drag) return; drag=true; cancel(); close(); const r=card.getBoundingClientRect(); ox=start.x-r.left; oy=start.y-r.top; ghost=card.cloneNode(true); ghost.classList.add('tg-ghost'); if(isInstant(card)) ghost.classList.add('tg-instant','tg-held'); document.body.appendChild(ghost); moveGhost(start.x,start.y); };
    const moveGhost=(x,y)=>{ if(!ghost) return; ghost.style.transform=`translate3d(${(x-ox)}px, ${(y-oy)}px, 0)`; };
    const onMove=ev=>{ const dx=ev.clientX-start.x, dy=ev.clientY-start.y; if(!drag && Math.hypot(dx,dy)>8) startDrag(); if(drag){ moveGhost(ev.clientX,ev.clientY); highlight(ev.clientX,ev.clientY); } };
    const onUp=ev=>{ cancel(); if(drag){ drop(ev.clientX,ev.clientY,card); } else if(preview){ close(); } cleanup(); };
    const cleanup=()=>{ window.removeEventListener('pointermove',onMove,true); window.removeEventListener('pointerup',onUp,true); clearHL(); if(ghost&&ghost.parentNode) ghost.parentNode.removeChild(ghost); ghost=null; card.classList.remove('tg-held','tg-instant'); };
    hold=setTimeout(open,450); window.addEventListener('pointermove',onMove,true); window.addEventListener('pointerup',onUp,true);
  }
  function isInstant(card){ if(card.matches('.instant,[data-type="Instant"],[data-instant="true"]')) return true; const t=(card.getAttribute('data-type')||card.textContent||'').toLowerCase(); return t.includes('instant'); }
  function highlight(x,y){ clearHL(); const el=document.elementFromPoint(x,y); const slot=el&&el.closest? el.closest('[data-slot],.slot'):null; if(slot) slot.classList.add('tg-slot-hover'); }
  function clearHL(){ document.querySelectorAll('.tg-slot-hover').forEach(el=>el.classList.remove('tg-slot-hover')); }
  function drop(x,y,card){ const els=document.elementsFromPoint(x,y); const slot=els.map(el=>el.closest?el.closest('[data-slot],.slot'):null).find(Boolean); if(!slot) return false; slot.classList.remove('tg-slot-hover'); return true; }
  function ensurePreviewLayer(){ if(!document.getElementById('tgPreviewLayer')){ const d=document.createElement('div'); d.id='tgPreviewLayer'; document.body.appendChild(d);} }
  function findHand(){
    const q = "[data-hand],[data-zone='hand'],[data-zone*='hand' i],.hand,#hand,.hand-zone,.handcards,.cards-hand,[data-region='hand'],[data-row='hand'],[data-area='hand']";
    const basic=document.querySelector(q); if(basic){ basic.dataset.hand=basic.dataset.hand||"true"; return basic; }
    const vh=window.innerHeight||800; const all=Array.from(document.querySelectorAll('body *'));
    const scrollers=all.filter(el=>{ const cs=getComputedStyle(el); if(!/(auto|scroll)/.test(cs.overflowX)) return False; if(el.scrollWidth<=el.clientWidth) return false; const r=el.getBoundingClientRect(); return (vh-r.bottom)<vh*0.35 && el.children.length>=3; });
    const portraitScore=el=>Array.from(el.children).reduce((s,c)=>{ const r=c.getBoundingClientRect(); return s + (r.width>40 && r.height>60 && r.height>r.width*1.2 ? 1:0); },0);
    scrollers.sort((a,b)=>portraitScore(b)-portraitScore(a)); const pick=scrollers[0]||null; if(pick) pick.dataset.hand=pick.dataset.hand||"true"; return pick;
  }
  function autoTagCards(hand){ if(!hand) return; Array.from(hand.querySelectorAll('*')).forEach(el=>{ const r=el.getBoundingClientRect(); if(r.width>40 && r.height>60 && r.height>r.width*1.2){ el.dataset.card=el.dataset.card||"true"; }}); }
}

// autorun
if(typeof window!=='undefined'){ const boot=()=>{ try{ initHandDnD({}); }catch(e){ console.warn('[tg] init error',e);} }; if(document.readyState==='complete'||document.readyState==='interactive'){ setTimeout(boot,0);} else { window.addEventListener('DOMContentLoaded',boot);} setTimeout(()=>{ try{ initHandDnD({}); }catch(e){} },1000); }
