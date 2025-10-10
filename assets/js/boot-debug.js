/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fit+anim5)
   - Centered scale; larger inter-row spacing
   - Header chrome removed (names/hearts/trances)
   - DECK sits to the right (next to End Turn); DISCARD anchors left
   - Bolt HUD hidden; optional aether dots (read live data-count)
   - Press & hold preview
   - Robust draw/discard animations
*/

(() => {
  const on=(t,k,f,o)=>t&&t.addEventListener&&t.addEventListener(k,f,o||false);
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const once=(fn)=>{let d=false;return(...a)=>{if(d)return;d=true;try{fn(...a);}catch{}}};

  const BASE_W=1280, BASE_H=720;

  /* ---------- scale/center ---------- */
  function scaleVal(){ const sx=innerWidth/BASE_W, sy=innerHeight/BASE_H; return Math.max(.1, Math.min(Math.min(sx,sy)*0.995, 2)); }
  function applyScale(){ const s=scaleVal(), st=document.documentElement.style; st.setProperty('--tg-scale', s+''); st.setProperty('--tg-scaled-w', (BASE_W*s)+'px'); st.setProperty('--tg-scaled-h', (BASE_H*s)+'px'); }
  function applyMode(){ document.documentElement.classList.toggle('mobile-land', Math.min(innerWidth,innerHeight)<=900); }

  /* ---------- version HUD ---------- */
  const ensureHud = once(()=>{
    let root=qs('#tgHudRoot'); if(!root){ root=document.createElement('div'); root.id='tgHudRoot'; document.body.appendChild(root); }
    let tag =qs('#tgVersionTag'); if(!tag){ tag=document.createElement('div'); tag.id='tgVersionTag'; root.appendChild(tag); }
    tag.textContent=(window.__THE_GREY_BUILD||'v2.3.5-mobile-landscape-fit+anim5');
  });

  /* ---------- preview (press & hold) ---------- */
  function installPreview(){
    let t=null,a=null,x=0,y=0; const DELAY=220, CANCEL=8;
    on(document,'pointerdown',e=>{ const card=e.target?.closest?.('#app .hand .card'); if(!card) return; x=e.clientX;y=e.clientY; t=setTimeout(()=>{ a=card; card.classList.add('magnify','magnify-hand'); },DELAY); },{passive:true});
    const clear=()=>{ if(t){clearTimeout(t);t=null} if(a){a.classList.remove('magnify','magnify-hand');a=null} };
    on(document,'pointermove',e=>{ if(!t&&!a) return; if(Math.hypot(e.clientX-x,e.clientY-y)>CANCEL) clear(); },{passive:true});
    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(ev=>{ on(document,ev,clear,{passive:true}); on(window,ev,clear,{passive:true}); });
  }

  /* ---------- HUD: move deck right, discard left; hide bolt ---------- */
  function ensureHudLanes(){
    let hud=qs('.hud-min'); if(!hud){ hud=document.createElement('div'); hud.className='hud-min'; hud.innerHTML='<div class="left"></div><div class="right"></div>'; document.body.appendChild(hud); }
    // Always hide bolt/aetherWell — we’ll render our own dots if desired
    const aw=qs('#aetherWell'); if(aw) aw.style.display='none';
    return {left:qs('.hud-min .left'), right:qs('.hud-min .right')};
  }
  function getEndTurn(){
    // Your markup includes #btnEnd in the right lane already. :contentReference[oaicite:3]{index=3}
    return qs('#btnEnd, .end-turn, button[aria-label="End Turn"]');
  }
  function adoptDeck(rightLane){
    // Reuse #deckIcon if present (engine sets data-count in render). :contentReference[oaicite:4]{index=4}
    let deck = qs('#deckIcon');
    if(!deck){
      deck=document.createElement('button'); deck.type='button'; deck.setAttribute('data-role','deck-btn'); deck.textContent='DECK';
    }else{
      deck.setAttribute('data-role','deck-btn');
    }
    if(deck.parentElement!==rightLane) rightLane.appendChild(deck);
    return deck;
  }
  function adoptDiscard(leftLane){
    let disc = qs('#discardIcon'); // engine updates this count too. :contentReference[oaicite:5]{index=5}
    if(!disc){
      disc=document.createElement('div'); disc.id='tgDiscardAnchor';
      disc.style.cssText='position:fixed;bottom:calc(22px + env(safe-area-inset-bottom));left:calc(50% - var(--tg-scaled-w)/2 + 14px);width:28px;height:28px;opacity:0;pointer-events:none';
      document.body.appendChild(disc);
    }else if(disc.parentElement!==leftLane){ leftLane.appendChild(disc); }
    return disc;
  }

  /* ---------- animations ---------- */
  const rect=el=>el.getBoundingClientRect();
  function cloneAt(elOrRect){
    const r = elOrRect instanceof DOMRect ? elOrRect : rect(elOrRect);
    const wrap=document.createElement('div'); wrap.className='tg-fly';
    wrap.style.width=r.width+'px'; wrap.style.height=r.height+'px';
    wrap.style.transform=`translate(${r.left}px,${r.top}px)`;
    if(!(elOrRect instanceof DOMRect) && elOrRect.cloneNode){ const ghost=elOrRect.cloneNode(true); ghost.style.transform='none'; ghost.style.pointerEvents='none'; wrap.appendChild(ghost); }
    document.body.appendChild(wrap); return wrap;
  }
  function fly(fromElOrRect,toEl){
    if(!fromElOrRect||!toEl) return;
    const c=cloneAt(fromElOrRect), tr=rect(toEl);
    requestAnimationFrame(()=>{ c.style.transform=`translate(${tr.left}px,${tr.top}px)`; c.style.opacity='1'; });
    const dur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-fly-ms'))||260;
    setTimeout(()=>c.remove(), dur+30);
  }

  function observeAnimations(deckBtn, discardAnchor){
    const hand=qs('#app [data-board="YOU"] .hand'); if(!hand) return;

    // Draws: new hand cards fly from deck button
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

    // Discards: removed cards fly to discard
    let lastDownRect=null;
    on(document,'pointerdown',e=>{
      const card=e.target?.closest?.('#app .hand .card');
      if(card) lastDownRect=rect(card);
    },{passive:true});
    const moRem=new MutationObserver(muts=>{
      const removed=[...muts].flatMap(m=>[...m.removedNodes||[]]).filter(n=>n.nodeType===1 && n.classList.contains('card'));
      if(removed.length && lastDownRect){ fly(lastDownRect, discardAnchor); lastDownRect=null; }
    });
    moRem.observe(hand,{childList:true,subtree:false});
  }

  /* ---------- optional aether dots (reads your live count) ---------- */
  function ensureAetherDots(rightLane){
    let hud = qs('#tgAetherHUD'); if(!hud){ hud=document.createElement('div'); hud.id='tgAetherHUD'; hud.innerHTML=`<div class="dots dots-blue"></div><div class="dots dots-red"></div>`; rightLane.appendChild(hud); }
    const blue=hud.querySelector('.dots-blue'), red=hud.querySelector('.dots-red');
    function getAether(){
      const v = Number(qs('#aetherWell')?.getAttribute('data-count')||0); /* your render() sets this */ /* :contentReference[oaicite:6]{index=6} */
      return {reg:v,tmp:0};
    }
    function renderDots(el,count,cls){ const n=Math.max(0,Math.min(20,count|0)); el.innerHTML=Array.from({length:n},()=>`<span class="aether-dot ${cls}"></span>`).join(''); }
    function tick(){ const {reg,tmp}=getAether(); renderDots(blue,reg,'blue'); renderDots(red,tmp,'red'); }
    tick(); setInterval(tick, 300);
  }

  /* ---------- apply & boot ---------- */
  function applyAll(){ applyMode(); applyScale(); }

  const boot=()=>{
    ensureHud();
    installPreview();

    const {left,right}=ensureHudLanes();
    const deckBtn=adoptDeck(right);
    adoptDiscard(left);
    ensureAetherDots(right);

    observeAnimations(deckBtn, qs('#discardIcon,#tgDiscardAnchor'));

    applyAll();
    ['resize','orientationchange','visibilitychange'].forEach(ev=>on(window,ev,applyAll,{passive:true}));

    // Kick a render so counts/handlers exist (safe if your app re-renders anyway)
    requestAnimationFrame(()=>{ try{ (window.tgSyncAll||window.syncAll||window.__syncAll||(()=>{}))(); }catch{} });
  };

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',boot,{once:true}); }
  else boot();
})();
