/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fit+anim2)
   - Centered, uniformly scaled 1280×720 canvas
   - Extra vertical spacing between rows
   - Deck button sits next to End Turn (right); Discard anchor on left
   - Hides lightning-bolt HUD
   - Aether HUD (blue=regular, red=temporary) auto-updating bottom-right
   - Draw animation (Deck → Hand), Discard animation (Hand → Discard)
   - Hide Aetherflow header
   - Press-and-hold preview (kept)
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
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-landscape-fit+anim2');
  });

  /* ---------------- HUD controls: deck button + groups -------------------- */
  const ensureHudControls = once(() => {
    const hudRight = document.querySelector('.hud-min .right') || (() => {
      const root = document.createElement('div'); root.className='hud-min'; document.body.appendChild(root);
      const left = document.createElement('div'); left.className='left';
      const right= document.createElement('div'); right.className='right';
      root.append(left,right);
      return right;
    })();

    // Hide any pre-existing “bolt/energy” visually in case it exists.
    qsa('.hud-min .bolt, .hud-min .energy, .hud-min [data-hud="energy"]').forEach(el => el.style.display='none');

    // Aether HUD (dots)
    let aetherHUD = qs('#tgAetherHUD');
    if(!aetherHUD){
      aetherHUD = document.createElement('div');
      aetherHUD.id = 'tgAetherHUD';
      aetherHUD.innerHTML = `<div class="dots dots-blue"></div><div class="dots dots-red"></div>`;
      hudRight.prepend(aetherHUD); // keep close to end turn & deck
    }

    // Deck button (sits next to End Turn)
    let deckBtn = qs('#tgDeckBtn');
    if(!deckBtn){
      deckBtn = document.createElement('button');
      deckBtn.id = 'tgDeckBtn';
      deckBtn.textContent = 'DECK';
      deckBtn.type = 'button';
      // purely visual for now; we keep pointer-events for future menus
      hudRight.appendChild(deckBtn);
    }
  });

  /* ---------------- Discard anchor (left), Deck anchor = deckBtn (right) -- */
  const ensureAnchors = once(() => {
    if(!qs('#tgDiscardAnchor')){ const a=document.createElement('div'); a.id='tgDiscardAnchor'; document.body.appendChild(a); }
  });

  /* ---------------- Aetherflow header remover ---------------------------- */
  function hideAetherflowHeader(){
    try{
      const af = qs('#app .aetherflow'); if(!af) return;
      af.querySelectorAll('.title,.name,.label,[data-label]').forEach(el => el.style.display='none');
      qsa('span,div', af).forEach(el => { const t=(el.textContent||'').trim().toLowerCase(); if(t==='aetherflow') el.style.display='none'; });
    }catch(_){}
  }

  /* ---------------- Press & Hold Preview (kept) -------------------------- */
  function installPressPreview(){
    let downX=0, downY=0, timer=null, active=null;
    const PRESS_MS=220, MOVE_CANCEL=8;
    const clear=()=>{ if(timer){clearTimeout(timer);timer=null;} if(active){active.classList.remove('magnify','magnify-hand'); active=null;} };
    on(document,'pointerdown',e=>{
      const card=e.target?.closest?.('.card'); if(!card || (e.button&&e.button!==0)) return;
      downX=e.clientX; downY=e.clientY;
      timer=setTimeout(()=>{ if(active) return; active=card; active.classList.add('magnify'); if(active.closest('.hand')) active.classList.add('magnify-hand'); },PRESS_MS);
    },{passive:true});
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
    const deckBtn = qs('#tgDeckBtn');
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes?.forEach(n=>{
          if(n.nodeType===1 && n.classList.contains('card')){
            setTimeout(()=> fly(deckBtn, n), 10); // from deck to card
          }
        });
      });
    });
    mo.observe(hand, {childList:true, subtree:false});
  }

  // Observe Discard pile count rises → fly last selected/played card to Discard
  function observeDiscards(){
    const discardA = qs('#tgDiscardAnchor');
    // Heuristic: whenever a .discard-pile or similar count bumps, animate from the last hand card
    // If the app exposes a discard node, hook it; otherwise fallback to listen to DOM changes globally
    const root = document.body;
    let lastHandCard = null;
    on(document, 'pointerdown', (e) => {
      const c = e.target?.closest?.('#app .hand .card'); if(c) lastHandCard = c;
    }, {passive:true});

    const mo = new MutationObserver(muts=>{
      // If anything labeled 'discard' changes, assume a discard happened.
      const changed = muts.some(m=>{
        const n = (m.target?.closest && m.target.closest('[data-pile="discard"], .discard, .discard-pile')) || null;
        return !!n;
      });
      if(changed){
        const src = lastHandCard || qs('#app .hand .card:last-child');
        fly(src, discardA);
      }
    });
    mo.observe(root, {subtree:true, childList:true, characterData:true});
  }

  /* ---------------- Aether HUD (blue=regular, red=temporary) -------------- */
  function getAether(){
    // Try multiple property names defensively
    const g = window.game || {};
    const you = g.you || {};
    const reg = you.aether ?? you.mana ?? you.energy ?? 0;      // regular aether
    const tmp = you.tempAether ?? you.tempMana ?? you.temp ?? 0; // temporary (this round)
    return {reg: Number(reg)||0, tmp: Number(tmp)||0};
  }
  function renderDots(container, count, cls){
    const dots = [];
    const n = Math.max(0, Math.min(20, count|0)); // clamp 0..20
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
    // light polling to reflect channel/spend without engine hooks
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
    ensureAnchors();
    installPressPreview();
    observeDraws();
    observeDiscards();
    startAetherTicker();
    applyAll();

    ['resize','orientationchange','visibilitychange'].forEach(evt =>
      on(window, evt, applyAll, {passive:true})
    );
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
