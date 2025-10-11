/* The Grey — mobile bootstrap (v2.3.5-mobile-unified-fit+anim6)
   - Dynamic scale that always fits 1280×720 to the viewport
   - Extra row spacing + hide board chrome; keep slots only
   - Hand space reserved (no overlap)
   - Deck (right, next to End Turn) / Discard (left)
   - Hide bolt HUD; add Aether dots (blue, red placeholder)
   - Draw: Deck → Hand, Discard: Hand → Discard (robust observers)
   - Press & hold card preview
*/

(() => {
  const on  = (t,k,fn,o)=> t&&t.addEventListener&&t.addEventListener(k,fn,o||false);
  const qs  = (s,r=document)=> r.querySelector(s);
  const qsa = (s,r=document)=> Array.from(r.querySelectorAll(s));
  const once= (fn)=>{ let ran=false; return (...a)=>{ if(ran) return; ran=true; try{fn(...a);}catch{} }; };

  const BASE_W = 1280, BASE_H = 720;

  /* ---------------- Fit-to-viewport scaling ---------------- */
  function computeScale(){
    // Use innerWidth/innerHeight so iOS address bar changes are reflected
    const vw = window.innerWidth, vh = window.innerHeight;
    const s  = Math.min(vw / BASE_W, vh / BASE_H);
    // nudge down a hair to avoid 1px overflow due to rounding
    return Math.max(0.1, Math.min(s * 0.995, 2));
  }
  function applyScaleVars(){
    const s = computeScale();
    const st = document.documentElement.style;
    st.setProperty('--tg-scale', s.toString());
    st.setProperty('--tg-scaled-w', (BASE_W * s) + 'px');
    st.setProperty('--tg-scaled-h', (BASE_H * s) + 'px');
  }
  function applyMobileFlag(){
    document.documentElement.classList.toggle(
      'mobile-land',
      Math.min(innerWidth, innerHeight) <= 900
    );
  }
  function applyLayout(){
    applyMobileFlag();
    applyScaleVars();
  }

  /* ---------------- Version HUD ---------------- */
  const ensureHudRootAndVersion = once(() => {
    let root = qs('#tgHudRoot'); if(!root){ root = document.createElement('div'); root.id='tgHudRoot'; document.body.appendChild(root); }
    let tag  = qs('#tgVersionTag'); if(!tag){ tag  = document.createElement('div'); tag.id='tgVersionTag'; root.appendChild(tag); }
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-unified-fit+anim6');
  });

  /* ---------------- HUD lanes / controls ------------------- */
  function ensureHudLanes(){
    let hud = qs('.hud-min');
    if(!hud){
      hud = document.createElement('div');
      hud.className = 'hud-min';
      hud.innerHTML = `<div class="left"></div><div class="right"></div>`;
      document.body.appendChild(hud);
    }
    // Hide any bolt/energy HUD that might be present
    ['#aetherWell','.bolt','[data-hud="energy"]','.toggle','.switch'].forEach(sel=>{
      qsa(sel, hud).forEach(el=> el.style.display='none');
    });
    return { left: qs('.hud-min .left'), right: qs('.hud-min .right') };
  }

  // Your engine already renders deck/discard/energy icons and updates counts in render()
  // We keep those DOM nodes so counts continue to work.  :contentReference[oaicite:0]{index=0}
  function moveDeckToRight(rightLane){
    let deck = qs('#deckIcon');
    if(!deck){
      // Fallback if icon not present: create a neutral button (still works for animations)
      deck = document.createElement('button');
      deck.type = 'button';
      deck.textContent = 'DECK';
      deck.setAttribute('data-role','deck-btn');
    }else{
      deck.setAttribute('data-role','deck-btn');
    }
    if(deck.parentElement !== rightLane) rightLane.appendChild(deck);
    return deck;
  }
  function ensureDiscardLeft(leftLane){
    let disc = qs('#discardIcon');
    if(!disc){
      // Invisible anchor if your branch doesn’t render a left icon
      disc = document.createElement('div');
      disc.id   = 'tgDiscardAnchor';
      disc.style.cssText = 'position:fixed;bottom:calc(22px + env(safe-area-inset-bottom));left:calc(50% - var(--tg-scaled-w)/2 + 14px);width:28px;height:28px;opacity:0;pointer-events:none';
      document.body.appendChild(disc);
    }else if(leftLane && disc.parentElement !== leftLane){
      leftLane.appendChild(disc);
    }
    return disc;
  }

  /* ---------------- Aether HUD (blue regular, red temporary) ------------- */
  function ensureAetherHUD(rightLane){
    // Old bolt/energy (#aetherWell) is hidden; we render dots that mirror the same count.
    let hud = qs('#tgAetherHUD');
    if(!hud){
      hud = document.createElement('div');
      hud.id = 'tgAetherHUD';
      hud.innerHTML = `<div class="dots dots-blue"></div><div class="dots dots-red"></div>`;
      rightLane.appendChild(hud);
    }
    const blue = hud.querySelector('.dots-blue');
    const red  = hud.querySelector('.dots-red');
    function getCounts(){
      const regular = Number(qs('#aetherWell')?.getAttribute('data-count') || 0); /* engine render updates this */ /* :contentReference[oaicite:1]{index=1} */
      const temp    = 0; // hook in temp aether later if you expose it
      return {regular, temp};
    }
    function renderDots(container, n, cls){
      const c = Math.max(0, Math.min(20, n|0));
      container.innerHTML = Array.from({length:c}, ()=>`<span class="aether-dot ${cls}"></span>`).join('');
    }
    function tick(){
      const {regular, temp} = getCounts();
      renderDots(blue, regular, 'blue');
      renderDots(red,  temp,    'red');
    }
    tick();
    setInterval(tick, 300);
  }

  /* ---------------- Press & Hold preview --------------------------------- */
  function installPressPreview(){
    const DELAY=220, CANCEL=8;
    let t=null, active=null, x=0, y=0;

    on(document, 'pointerdown', e=>{
      const card = e.target?.closest?.('#app .hand .card');
      if(!card) return;
      x=e.clientX; y=e.clientY;
      t=setTimeout(()=>{ active=card; card.classList.add('magnify','magnify-hand'); }, DELAY);
    }, {passive:true});

    function clear(){
      if(t){ clearTimeout(t); t=null; }
      if(active){ active.classList.remove('magnify','magnify-hand'); active=null; }
    }
    on(document,'pointermove', e=>{
      if(!t && !active) return;
      if(Math.hypot(e.clientX-x, e.clientY-y) > CANCEL) clear();
    }, {passive:true});
    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(evt=>{
      on(document,evt,clear,{passive:true}); on(window,evt,clear,{passive:true});
    });
  }

  /* ---------------- Animations (Deck→Hand / Hand→Discard) ---------------- */
  const rect = (el)=> el.getBoundingClientRect();
  function cloneAt(elOrRect){
    const r = elOrRect instanceof DOMRect ? elOrRect : rect(elOrRect);
    const wrap = document.createElement('div');
    wrap.className='tg-fly';
    wrap.style.width  = r.width  + 'px';
    wrap.style.height = r.height + 'px';
    wrap.style.transform = `translate(${r.left}px, ${r.top}px)`;
    if(!(elOrRect instanceof DOMRect) && elOrRect.cloneNode){
      const ghost = elOrRect.cloneNode(true);
      ghost.style.transform='none'; ghost.style.pointerEvents='none';
      wrap.appendChild(ghost);
    }
    document.body.appendChild(wrap);
    return wrap;
  }
  function fly(fromElOrRect, toEl){
    if(!fromElOrRect || !toEl) return;
    const c = cloneAt(fromElOrRect);
    const tr = rect(toEl);
    requestAnimationFrame(()=>{
      c.style.transform = `translate(${tr.left}px, ${tr.top}px)`;
      c.style.opacity   = '1';
    });
    const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-fly-ms')) || 260;
    setTimeout(()=> c.remove(), dur + 30);
  }

  function observeDraws(deckBtn){
    const hand = qs('#app [data-board="YOU"] .hand');
    if(!hand) return;
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes?.forEach(n=>{
          if(n.nodeType===1 && n.classList.contains('card')){
            // after layout fan transform is applied
            requestAnimationFrame(()=> fly(deckBtn, n));
          }
        });
      });
    });
    mo.observe(hand, {childList:true, subtree:false});
  }

  function observeDiscards(discardAnchor){
    const hand = qs('#app [data-board="YOU"] .hand');
    if(!hand) return;

    // Track the rect of last pressed hand card for a reliable source point
    let lastDownRect = null;
    on(document,'pointerdown',e=>{
      const c = e.target?.closest?.('#app .hand .card');
      if(c) lastDownRect = rect(c);
    }, {passive:true});

    const mo = new MutationObserver(muts=>{
      const removed = muts.flatMap(m=> Array.from(m.removedNodes||[]))
                          .filter(n=> n.nodeType===1 && n.classList.contains('card'));
      if(removed.length && lastDownRect){
        fly(lastDownRect, discardAnchor);
        lastDownRect = null;
      }
    });
    mo.observe(hand, {childList:true, subtree:false});
  }

  /* ---------------- Boot -------------------------------------------------- */
  const boot = () => {
    ensureHudRootAndVersion();
    installPressPreview();

    const {left, right} = ensureHudLanes();
    const deckBtn      = moveDeckToRight(right);                // keep engine node so counts update  :contentReference[oaicite:2]{index=2}
    const discardIcon  = ensureDiscardLeft(left);

    ensureAetherHUD(right);

    observeDraws(deckBtn);
    observeDiscards(discardIcon);

    const resizer = ()=> applyLayout();
    resizer();
    ['resize','orientationchange','visibilitychange'].forEach(ev=> on(window, ev, resizer, {passive:true}));

    // Nudge engine to refresh counts/positions safely
    requestAnimationFrame(()=>{ try{ (window.tgSyncAll||window.syncAll||window.__syncAll||(()=>{}))(); }catch{} });
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  }else{
    boot();
  }
})();
