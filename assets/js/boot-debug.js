/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fit+anim3)
   - Centered 1280×720, spacing, hand in-flow
   - Deck (right, next to End Turn) / Discard (left)
   - Hide bolt; add Aether HUD (blue=regular, red=temporary)
   - Draw animation (Deck → Hand), Discard animation (Hand → Discard)
   - Hide AF header; press-and-hold preview
*/

(() => {
  const on   = (t,k,fn,o)=> t&&t.addEventListener&&t.addEventListener(k,fn,o||false);
  const qs   = (s,r=document)=> r.querySelector(s);
  const qsa  = (s,r=document)=> Array.from(r.querySelectorAll(s));
  const once = (fn)=>{ let y=false; return (...a)=>{ if(y) return; y=true; try{fn(...a);}catch(_){}}};
  const noop = ()=>{};

  const BASE_W = 1280, BASE_H = 720;

  /* ---------------- Scaling / centering ---------------------------------- */
  function computeScale(){
    const vw = innerWidth, vh = innerHeight;
    return Math.max(.1, Math.min( (Math.min(vw/BASE_W, vh/BASE_H))*0.995, 2 ));
  }
  function applyScaleVars(){
    const s = computeScale(), root = document.documentElement.style;
    root.setProperty('--tg-scale', s+'');
    root.setProperty('--tg-scaled-w', (BASE_W*s)+'px');
    root.setProperty('--tg-scaled-h', (BASE_H*s)+'px');
  }
  function applyMobileLand(){
    const el = document.documentElement;
    const isPhoneish = Math.min(innerWidth, innerHeight) <= 900;
    el.classList.toggle('mobile-land', isPhoneish);
  }
  function applyLayout(){ applyMobileLand(); applyScaleVars(); }

  /* ---------------- Sync trigger ----------------------------------------- */
  const callSync = () => {
    const f = (window.tgSyncAll||window.syncAll||window.TG_SYNC_ALL||window.__syncAll||noop);
    try{ f(); }catch(_){}
    try{ window.dispatchEvent(new CustomEvent('tg:resync',{bubbles:true})); }catch(_){}
    try{ document.dispatchEvent(new CustomEvent('tg:resync',{bubbles:true})); }catch(_){}
    hideAetherflowHeader();
    updateAetherHUD(); // refresh counts on sync
  };

  /* ---------------- Version HUD root ------------------------------------- */
  const ensureHudRootAndVersion = once(() => {
    let hud = qs('#tgHudRoot'); if(!hud){ hud = document.createElement('div'); hud.id='tgHudRoot'; document.body.appendChild(hud); }
    let tag = qs('#tgVersionTag'); if(!tag){ tag = document.createElement('div'); tag.id='tgVersionTag'; hud.appendChild(tag); }
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-landscape-fit+anim3');
  });

  /* ---------------- HUD controls / move deck right ------------------------ */
  const ensureHudControls = once(() => {
    const hud = qs('.hud-min'); if(!hud){
      const root = document.createElement('div'); root.className='hud-min';
      root.innerHTML = `<div class="left"></div><div class="right"></div>`;
      document.body.appendChild(root);
    }
    const left  = qs('.hud-min .left');
    const right = qs('.hud-min .right');

    // Move deck icon to the right (next to End Turn), keep discard on left.
    const deck    = qs('#deckIcon');
    const discard = qs('#discardIcon');
    const endBtn  = qs('#btnEnd');

    if(deck && right && deck.parentElement !== right){
      right.appendChild(deck);
    }
    if(endBtn && right && endBtn.nextSibling !== deck){
      right.insertBefore(deck, null); // after End Turn
    }
    if(discard && left && discard.parentElement !== left){
      left.appendChild(discard);
    }

    // Aether HUD (blue/red dots)
    let hudDots = qs('#tgAetherHUD');
    if(!hudDots){
      hudDots = document.createElement('div');
      hudDots.id = 'tgAetherHUD';
      hudDots.innerHTML = `
        <div class="dots dots-blue"></div>
        <div class="dots dots-red"></div>`;
      right?.appendChild(hudDots);
    }
  });

  /* ---------------- Hide AF header --------------------------------------- */
  function hideAetherflowHeader(){
    qsa('#app .aetherflow .af-title').forEach(el => el.style.display='none');
  }

  /* ---------------- Press & Hold Preview --------------------------------- */
  function installPressPreview(){
    const DELAY = 220; const MOVE_CANCEL = 8;
    let timer=null, active=null, downX=0, downY=0;

    on(document,'pointerdown',e=>{
      const card = e.target && e.target.closest && e.target.closest('#app .hand .card');
      if(!card) return;
      downX=e.clientX; downY=e.clientY;
      timer = setTimeout(()=>{
        active=card;
        card.classList.add('magnify','magnify-hand');
      }, DELAY);
    }, {passive:true});

    function clear(){
      if(timer){ clearTimeout(timer); timer=null; }
      if(active){ active.classList.remove('magnify','magnify-hand'); active=null; }
    }

    on(document,'pointermove',e=>{
      if(!timer && !active) return;
      if(Math.hypot(e.clientX-downX,e.clientY-downY)>MOVE_CANCEL) clear();
    },{passive:true});
    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(evt=>{
      on(document,evt,clear,{passive:true}); on(window,evt,clear,{passive:true});
    });
  }

  /* ---------------- Draw / Discard animations ---------------------------- */
  function rect(el){ return el.getBoundingClientRect(); }
  function makeClone(fromEl){
    const r = rect(fromEl);
    const clone = fromEl.cloneNode(true);
    clone.classList.add('tg-fly');
    clone.style.width = r.width+'px';
    clone.style.height= r.height+'px';
    clone.style.transform = `translate(${r.left}px, ${r.top}px)`;
    document.body.appendChild(clone);
    return clone;
  }
  function fly(fromEl, toEl){
    if(!fromEl || !toEl) return;
    const clone = makeClone(fromEl);
    const tr = rect(toEl);
    requestAnimationFrame(()=>{
      clone.style.transform = `translate(${tr.left}px, ${tr.top}px)`;
      clone.style.opacity = '1';
    });
    const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-fly-ms')) || 260;
    setTimeout(()=> clone.remove(), dur + 20);
  }

  // Observe YOUR hand for draws: animate Deck → new card
  function observeDraws(){
    const hand = qs('#app [data-board="YOU"] .hand'); if(!hand) return;
    const deckBtn = qs('#deckIcon'); // engine updates this count in render() :contentReference[oaicite:4]{index=4}
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes?.forEach(n=>{
          if(n.nodeType===1 && n.classList.contains('card')){
            // delay one frame so the card has its base transform set (layoutHand) :contentReference[oaicite:5]{index=5}
            requestAnimationFrame(()=> fly(deckBtn, n));
          }
        });
      });
    });
    mo.observe(hand, {childList:true, subtree:false});
  }

  // Observe Discard count changes → fly last hand card to Discard
  function observeDiscards(){
    const discardIcon = qs('#discardIcon');
    if(!discardIcon) return;

    const mo = new MutationObserver(muts=>{
      const attrChanged = muts.some(m => m.type==='attributes' && m.attributeName==='data-count');
      if(attrChanged){
        const src = qs('#app .hand .card:last-child');
        fly(src, discardIcon);
      }
    });
    mo.observe(discardIcon, {attributes:true, attributeFilter:['data-count']});
  }

  /* ---------------- Aether HUD (blue=regular, red=temporary) -------------- */
  function getAether(){
    // Prefer engine state if exposed later; otherwise read the HUD the engine already sets.
    // Engine sets #aetherWell data-count in render(...) :contentReference[oaicite:6]{index=6}
    const aetherFromHud = Number(qs('#aetherWell')?.getAttribute('data-count')||0);
    // If you later add temp aether to state (e.g., state.you.tempAether), this reader can be extended.
    return {reg:aetherFromHud, tmp:0};
  }
  function renderDots(container, count, cls){
    const dots = [];
    const n = Math.max(0, Math.min(20, count|0)); // clamp 0..20 so we don’t explode UI
    for(let i=0;i<n;i++) dots.push(`<span class="aether-dot ${cls}"></span>`);
    container.innerHTML = dots.join('');
  }
  function updateAetherHUD(){
    const hud = qs('#tgAetherHUD'); if(!hud) return;
    const blue = hud.querySelector('.dots-blue');
    const red  = hud.querySelector('.dots-red');
    const {reg, tmp} = getAether();
    renderDots(blue, reg, 'blue');
    renderDots(red,  tmp, 'red');
  }
  function startAetherTicker(){
    updateAetherHUD();
    // light polling to reflect channel/spend without direct engine hooks
    setInterval(updateAetherHUD, 300);
  }

  /* ---------------- Boot -------------------------------------------------- */
  const applyAll = ()=>{ applyLayout(); hideAetherflowHeader(); };

  const forceFirstSync = once(() => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { callSync(); }); });
    setTimeout(callSync, 450);
  });

  const boot = () => {
    ensureHudRootAndVersion();
    ensureHudControls();
    installPressPreview();
    observeDraws();
    observeDiscards();
    startAetherTicker();
    applyAll();

    ['resize','orientationchange','visibilitychange'].forEach(evt =>
      on(window, evt, applyAll, {passive:true})
    );

    // give the engine a nudge so counts/handlers are in place
    forceFirstSync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
