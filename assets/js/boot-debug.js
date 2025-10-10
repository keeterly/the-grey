/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fit+anim4)
   Robust + self-healing:
   - scales/centers canvas
   - hides board chrome (keeps slots) + row spacing
   - press-and-hold preview
   - places DECK next to End Turn (right); creates its own node if needed
   - Discard anchor on left
   - hides bolt HUD
   - animates Deck→Hand on card added; animates Hand→Discard on removal (uses last rect)
*/

(() => {
  const on=(t,k,f,o)=>t&&t.addEventListener&&t.addEventListener(k,f,o||false);
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const once=(fn)=>{let d=false;return(...a)=>{if(d)return;d=true;try{fn(...a);}catch{}}};
  const BASE_W=1280, BASE_H=720;

  /* ---------- scale / center ---------- */
  function scaleVal(){
    const sx=innerWidth/BASE_W, sy=innerHeight/BASE_H;
    return Math.max(.1, Math.min(Math.min(sx,sy)*0.995, 2));
  }
  function applyScale(){
    const s=scaleVal(), st=document.documentElement.style;
    st.setProperty('--tg-scale', s+'');
    st.setProperty('--tg-scaled-w', (BASE_W*s)+'px');
    st.setProperty('--tg-scaled-h', (BASE_H*s)+'px');
  }
  function applyMode(){ document.documentElement.classList.toggle('mobile-land', Math.min(innerWidth,innerHeight)<=900); }

  /* ---------- version HUD ---------- */
  const ensureHud = once(()=>{
    let root=qs('#tgHudRoot'); if(!root){ root=document.createElement('div'); root.id='tgHudRoot'; document.body.appendChild(root); }
    let tag=qs('#tgVersionTag'); if(!tag){ tag=document.createElement('div'); tag.id='tgVersionTag'; root.appendChild(tag); }
    tag.textContent=(window.__THE_GREY_BUILD||'v2.3.5-mobile-landscape-fit+anim4');
  });

  /* ---------- press & hold preview ---------- */
  function installPreview(){
    let t=null, a=null, x=0,y=0; const D=220, C=8;
    on(document,'pointerdown',e=>{
      const card=e.target?.closest?.('#app .hand .card'); if(!card) return;
      x=e.clientX; y=e.clientY; t=setTimeout(()=>{a=card; card.classList.add('magnify','magnify-hand');}, D);
    },{passive:true});
    function clear(){ if(t){clearTimeout(t);t=null} if(a){a.classList.remove('magnify','magnify-hand');a=null} }
    on(document,'pointermove',e=>{ if(!t&&!a) return; if(Math.hypot(e.clientX-x,e.clientY-y)>C) clear(); },{passive:true});
    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(ev=>{ on(document,ev,clear,{passive:true}); on(window,ev,clear,{passive:true}); });
  }

  /* ---------- HUD wiring (deck right, discard left) ---------- */
  function ensureHudLanes(){
    let hud=qs('.hud-min'); if(!hud){ hud=document.createElement('div'); hud.className='hud-min'; hud.innerHTML='<div class="left"></div><div class="right"></div>'; document.body.appendChild(hud); }
    return {left:qs('.hud-min .left'), right:qs('.hud-min .right')};
  }
  function getEndTurn(){
    return qs('#btnEnd, .end-turn, button[aria-label="End Turn"], button:has(svg[data-icon="play"])') || qs('.hud-min .right button');
  }
  function adoptDeck(rightLane){
    // Try to reuse existing deck icon if present, else create one
    let deck = qs('#deckIcon,[data-role="deck-btn"], .deck, button:has(span:contains("DECK"))');
    if(!deck){
      deck=document.createElement('button');
      deck.setAttribute('data-role','deck-btn');
      deck.type='button'; deck.textContent='DECK';
    }else{
      deck.setAttribute('data-role','deck-btn');
    }
    if(deck.parentElement!==rightLane) rightLane.appendChild(deck);
    return deck;
  }
  function adoptDiscard(leftLane){
    // Use existing discard icon if present; otherwise invisible anchor
    let disc = qs('#discardIcon,[data-pile="discard"],.discard');
    if(!disc){
      disc=document.createElement('div'); disc.id='tgDiscardAnchor';
      disc.style.cssText='position:fixed;bottom:calc(22px + env(safe-area-inset-bottom));left:calc(50% - var(--tg-scaled-w)/2 + 14px);width:28px;height:28px;opacity:0;pointer-events:none';
      document.body.appendChild(disc);
    }
    if(disc.parentElement===document.body) {/* already positioned */} else if(leftLane && disc.parentElement!==leftLane) { leftLane.appendChild(disc); }
    return disc;
  }

  /* ---------- animations ---------- */
  const rect=el=>el.getBoundingClientRect();
  function cloneAt(elOrRect){
    const r = elOrRect instanceof DOMRect ? elOrRect : rect(elOrRect);
    const clone=document.createElement('div');
    clone.className='tg-fly';
    clone.style.width=r.width+'px'; clone.style.height=r.height+'px';
    clone.style.transform=`translate(${r.left}px,${r.top}px)`;
    // snapshot look
    if(!(elOrRect instanceof DOMRect) && elOrRect.cloneNode){
      const ghost=elOrRect.cloneNode(true); ghost.style.transform='none'; ghost.style.pointerEvents='none';
      clone.appendChild(ghost);
    }
    document.body.appendChild(clone);
    return clone;
  }
  function fly(fromElOrRect,toEl){
    if(!fromElOrRect||!toEl) return;
    const c=cloneAt(fromElOrRect);
    const tr=rect(toEl);
    requestAnimationFrame(()=>{ c.style.transform=`translate(${tr.left}px,${tr.top}px)`; c.style.opacity='1'; });
    const dur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-fly-ms'))||260;
    setTimeout(()=>c.remove(), dur+30);
  }

  /* Robust observers:
     - Draw: any new .hand .card → fly from deck button
     - Discard: track last pointerdown card rect; if that card is removed from hand within 400ms, fly that rect → discard */
  function observeAnimations(deckBtn, discardAnchor){
    const hand=qs('#app [data-board="YOU"] .hand'); if(!hand) return;

    // Draws
    const moAdd=new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes?.forEach(n=>{
          if(n.nodeType===1 && n.classList.contains('card')){
            requestAnimationFrame(()=> fly(deckBtn, n));
          }
        });
      });
    });
    moAdd.observe(hand,{childList:true,subtree:false});

    // Discards (removed from hand)
    let lastDownRect=null;
    on(document,'pointerdown',e=>{
      const card=e.target?.closest?.('#app .hand .card');
      if(card) lastDownRect=rect(card);
    },{passive:true});

    const moRem=new MutationObserver(muts=>{
      const nowRemoved=[...muts].flatMap(m=>[...m.removedNodes||[]])
        .filter(n=>n.nodeType===1 && n.classList.contains('card'));
      if(nowRemoved.length && lastDownRect){
        fly(lastDownRect, discardAnchor);
        lastDownRect=null;
      }
    });
    moRem.observe(hand,{childList:true,subtree:false});
  }

  /* ---------- bolt hide, aether dots (optional) ---------- */
  function hideBolt(){ qsa('.hud-min .bolt,[data-hud="energy"],.energy').forEach(el=>el.style.display='none'); }

  /* ---------- apply layout & boot ---------- */
  function applyAll(){ applyMode(); applyScale(); hideBolt(); }

  const boot=()=>{
    ensureHud();
    installPreview();

    const {left,right}=ensureHudLanes();
    const end=getEndTurn(); if(end && end.parentElement===right){} // fine
    const deckBtn=adoptDeck(right);
    const discardAnchor=adoptDiscard(left);

    observeAnimations(deckBtn, discardAnchor);

    applyAll();
    ['resize','orientationchange','visibilitychange'].forEach(ev=>on(window,ev,applyAll,{passive:true}));
    // initial resync poke
    requestAnimationFrame(()=>{ try{ (window.tgSyncAll||window.syncAll||window.__syncAll||(()=>{}))(); }catch{} });
  };

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',boot,{once:true}); }
  else boot();
})();
