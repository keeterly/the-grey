/* The Grey — mobile bootstrap (v2.3.5-mobile-unified-fit+anim7)
   - Fit-to-viewport scale (always shows full 1280×720 board)
   - Extra row spacing + hide board chrome (keep slots)
   - Hand reserve prevents overlap with player row
   - Deck (right, next to End Turn) / Discard (left); visible Deck fallback
   - Hide bolt HUD; optional aether dots (blue regular, red temp placeholder)
   - Press & hold preview
   - Draw: Deck → Hand; Discard: Hand → Discard (robust observers)
*/

(() => {
  const on=(t,k,f,o)=>t&&t.addEventListener&&t.addEventListener(k,f,o||false);
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const once=(fn)=>{let d=false;return(...a)=>{if(d)return;d=true;try{fn(...a);}catch{}}};

  const BASE_W=1280, BASE_H=720;

  /* ---------------- Fit-to-viewport scaling ---------------- */
  function computeScale(){
    const vw=innerWidth, vh=innerHeight;
    const s=Math.min(vw/BASE_W, vh/BASE_H);
    return Math.max(0.1, Math.min(s*0.995, 2));
  }
  function applyScaleVars(){
    const s=computeScale(), st=document.documentElement.style;
    st.setProperty('--tg-scale', String(s));
    st.setProperty('--tg-scaled-w', (BASE_W*s)+'px');
    st.setProperty('--tg-scaled-h', (BASE_H*s)+'px');
  }
  function applyMobileFlag(){
    document.documentElement.classList.toggle('mobile-land', Math.min(innerWidth,innerHeight)<=900);
  }
  function applyLayout(){ applyMobileFlag(); applyScaleVars(); }

  /* ---------------- Version HUD ---------------- */
  const ensureHudRootAndVersion = once(()=>{
    let root=qs('#tgHudRoot'); if(!root){ root=document.createElement('div'); root.id='tgHudRoot'; document.body.appendChild(root); }
    let tag=qs('#tgVersionTag'); if(!tag){ tag=document.createElement('div'); tag.id='tgVersionTag'; root.appendChild(tag); }
    tag.textContent=(window.__THE_GREY_BUILD||'v2.3.5-mobile-unified-fit+anim7');
  });

  /* ---------------- Press & Hold preview ------------------- */
  function installPressPreview(){
    const DELAY=220, CANCEL=8;
    let t=null, a=null, x=0, y=0;

    on(document,'pointerdown',e=>{
      const card=e.target?.closest?.('#app .hand .card'); if(!card) return;
      x=e.clientX; y=e.clientY;
      t=setTimeout(()=>{ a=card; card.classList.add('magnify','magnify-hand'); }, DELAY);
    }, {passive:true});

    const clear=()=>{ if(t){clearTimeout(t);t=null} if(a){a.classList.remove('magnify','magnify-hand');a=null} };
    on(document,'pointermove',e=>{ if(!t&&!a) return; if(Math.hypot(e.clientX-x,e.clientY-y)>CANCEL) clear(); }, {passive:true});
    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(ev=>{
      on(document,ev,clear,{passive:true}); on(window,ev,clear,{passive:true});
    });
  }

  /* ---------------- HUD lanes / wiring --------------------- */
  function ensureHudLanes(){
    let hud=qs('.hud-min');
    if(!hud){
      hud=document.createElement('div');
      hud.className='hud-min';
      hud.innerHTML='<div class="left"></div><div class="right"></div>';
      document.body.appendChild(hud);
    }
    // hide any existing bolt/energy/toggles inside lanes
    qsa('#aetherWell,.bolt,[data-hud="energy"],.toggle,.switch', hud).forEach(el=>el.style.display='none');
    return {left:qs('.hud-min .left'), right:qs('.hud-min .right')};
  }
  function moveDeckRight(rightLane){
    // Prefer engine deck node so counts keep updating; else create a visible fallback
    let deck = qs('#deckIcon,[data-role="deck-btn"]');
    if(!deck){
      deck=document.createElement('button');
      deck.type='button';
      deck.textContent='DECK';
      deck.setAttribute('data-role','deck-btn');
      deck.style.cursor='pointer';
    }else{
      deck.setAttribute('data-role','deck-btn');
    }
    if(deck.parentElement!==rightLane) rightLane.appendChild(deck);
    return deck;
  }
  function ensureDiscardLeft(leftLane){
    let disc = qs('#discardIcon');
    if(!disc){
      disc=document.createElement('div');
      disc.id='tgDiscardAnchor';
      disc.style.cssText='position:fixed;bottom:calc(22px + env(safe-area-inset-bottom));left:calc(50% - var(--tg-scaled-w)/2 + 14px);width:28px;height:28px;opacity:0;pointer-events:none';
      document.body.appendChild(disc);
    }else if(leftLane && disc.parentElement!==leftLane){
      leftLane.appendChild(disc);
    }
    return disc;
  }

  /* ---------------- Aether dots (optional) ----------------- */
  function ensureAetherHUD(rightLane){
    let hud=qs('#tgAetherHUD');
    if(!hud){
      hud=document.createElement('div'); hud.id='tgAetherHUD';
      hud.innerHTML='<div class="dots dots-blue"></div><div class="dots dots-red"></div>';
      rightLane.appendChild(hud);
    }
    const blue=hud.querySelector('.dots-blue'), red=hud.querySelector('.dots-red');
    const renderDots=(el,n,cls)=>{ const c=Math.max(0,Math.min(20,n|0)); el.innerHTML=Array.from({length:c},()=>`<span class="aether-dot ${cls}"></span>`).join(''); };
    const getCounts=()=>({ regular:Number(qs('#aetherWell')?.getAttribute('data-count')||0), temp:0 });
    const tick=()=>{ const {regular,temp}=getCounts(); renderDots(blue,regular,'blue'); renderDots(red,temp,'red'); };
    tick(); setInterval(tick,300);
  }

  /* ---------------- Animations ------------------------------------------- */
  const rect=(el)=>el.getBoundingClientRect();
  function cloneAt(elOrRect){
    const r = elOrRect instanceof DOMRect ? elOrRect : rect(elOrRect);
    const wrap=document.createElement('div'); wrap.className='tg-fly';
    wrap.style.width=r.width+'px'; wrap.style.height=r.height+'px';
    wrap.style.transform=`translate(${r.left}px,${r.top}px)`;
    if(!(elOrRect instanceof DOMRect) && elOrRect.cloneNode){
      const ghost=elOrRect.cloneNode(true); ghost.style.transform='none'; ghost.style.pointerEvents='none'; wrap.appendChild(ghost);
    }
    document.body.appendChild(wrap);
    return wrap;
  }
  function fly(fromElOrRect,toEl){
    if(!fromElOrRect||!toEl) return;
    const c=cloneAt(fromElOrRect), tr=rect(toEl);
    requestAnimationFrame(()=>{ c.style.transform=`translate(${tr.left}px,${tr.top}px)`; c.style.opacity='1'; });
    const dur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-fly-ms'))||260;
    setTimeout(()=>c.remove(), dur+30);
  }

  function observeDraws(deckBtn){
    const hand=qs('#app [data-board="YOU"] .hand'); if(!hand) return;
    const mo=new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes?.forEach(n=>{
          if(n.nodeType===1 && n.classList.contains('card')){
            requestAnimationFrame(()=> fly(deckBtn, n));
          }
        });
      });
    });
    mo.observe(hand,{childList:true,subtree:false});
  }

  function observeDiscards(discardAnchor){
    const hand=qs('#app [data-board="YOU"] .hand'); if(!hand) return;
    let lastDownRect=null;
    on(document,'pointerdown',e=>{
      const c=e.target?.closest?.('#app .hand .card'); if(c) lastDownRect=rect(c);
    },{passive:true});
    const mo=new MutationObserver(muts=>{
      const removed=muts.flatMap(m=>Array.from(m.removedNodes||[])).filter(n=>n.nodeType===1 && n.classList.contains('card'));
      if(removed.length && lastDownRect){ fly(lastDownRect, discardAnchor); lastDownRect=null; }
    });
    mo.observe(hand,{childList:true,subtree:false});
  }

  /* ---------------- Boot -------------------------------------------------- */
  const boot=()=>{
    ensureHudRootAndVersion();
    installPressPreview();

    const {left,right}=ensureHudLanes();
    // Put DECK right beside End Turn; ensure it’s visible even if your icon isn’t present
    const deckBtn=moveDeckRight(right);
    const discardIcon=ensureDiscardLeft(left);
    ensureAetherHUD(right);

    observeDraws(deckBtn);
    observeDiscards(discardIcon);

    applyLayout();
    ['resize','orientationchange','visibilitychange'].forEach(ev=>on(window,ev,applyLayout,{passive:true}));

    // Light resync so counts/positions are fresh
    requestAnimationFrame(()=>{ try{ (window.tgSyncAll||window.syncAll||window.__syncAll||(()=>{}))(); }catch{} });
  };

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',boot,{once:true}); }
  else boot();
})();
