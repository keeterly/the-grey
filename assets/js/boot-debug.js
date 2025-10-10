
/* assets/js/boot-debug.js — v2.2 Mobile Unified; version v2.2.0-mobile-unified */
(function(){ window.__THE_GREY_BUILD = 'v2.2.0-mobile-unified'; })();

// --- Setup scaling canvas and rotate overlay ---
(function setupCanvas(){
  const app = document.getElementById('app');
  if (app) app.classList.add('tg-canvas');

  let overlay = document.getElementById('tgRotateOverlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'tgRotateOverlay';
    overlay.className = 'tg-rotate-overlay';
    overlay.innerHTML = '<div class="tg-rotate-card"><div class="tg-rotate-title">Rotate your device</div><div class="tg-rotate-sub">Mobile is optimized for landscape. Rotate to fit everything on one screen.</div></div>';
    document.body.appendChild(overlay);
  }
})();

// --- Fit to one screen in landscape (design 1280x720) ---
(function fitToScreen(){
  const DESIGN_W = 1280, DESIGN_H = 720;
  const root = document.documentElement;
  function isPortrait(){ return window.innerHeight > window.innerWidth; }
  function apply(){
    const el = document.getElementById('app');
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (isPortrait()){
      root.classList.add('mobile-land');
      document.getElementById('tgRotateOverlay')?.classList.add('show');
      el.style.transform = 'translate(-50%, -50%) scale(0.9)';
      return;
    }
    document.getElementById('tgRotateOverlay')?.classList.remove('show');
    root.classList.add('mobile-land');
    const scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    el.style.width = DESIGN_W + 'px';
    el.style.height = DESIGN_H + 'px';
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  window.addEventListener('resize', apply, {passive:true});
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  apply();
})();

// --- HUD buttons (⇆ layout + +AF zoom) ---
(function ensureHudButtons(){
  const left = document.querySelector('.hud-min .left');
  const right = document.querySelector('.hud-min .right');
  if (left){
    let btn = document.getElementById('tgCompactToggle');
    if (!btn){
      btn = document.createElement('div');
      btn.id = 'tgCompactToggle';
      btn.className = 'icon btn';
      btn.title = 'Layout: Auto / Mini / Off';
      btn.textContent = '⇆';
      left.prepend(btn);
    }
  }
  if (right){
    let af = document.getElementById('tgAFZoom');
    if (!af){
      af = document.createElement('div');
      af.id = 'tgAFZoom';
      af.className = 'icon btn';
      af.title = 'Zoom Aetherflow';
      af.textContent = '+AF';
      right.appendChild(af);
    }
  }
})();

// --- Compact/Mini behavior retained (off by default in landscape) ---
(function mobileModes(){
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref'; // 'auto' | 'mini' | 'off'
  function getPref(){ try{ return localStorage.getItem(LS_KEY) || 'off'; }catch(_){ return 'off'; }}
  function setPref(v){ try{ localStorage.setItem(LS_KEY, v); }catch(_){} }

  const compactBtn = document.getElementById('tgCompactToggle');
  const afBtn = document.getElementById('tgAFZoom');

  function labelFromPref(p){ return p==='mini' ? 'Mini' : p==='off' ? 'Off' : 'Auto'; }

  function apply(){
    const pref = getPref();
    const mini = (pref==='mini');
    docEl.classList.toggle('mobile-mini', mini);     // noop with scaled canvas but kept for future
    docEl.classList.toggle('af-zoom', false);        // reset AF zoom by default
    if (compactBtn) compactBtn.setAttribute('data-count', labelFromPref(pref));
  }

  function cycle(){
    const p = getPref();
    const next = p==='off' ? 'mini' : p==='mini' ? 'auto' : 'off';
    setPref(next); apply();
  }

  if (compactBtn) compactBtn.onclick = cycle;
  if (afBtn) afBtn.onclick = function(){
    const on = !document.documentElement.classList.contains('af-zoom');
    document.documentElement.classList.toggle('af-zoom', on);
    const af = document.querySelector('.aetherflow');
    if (on && af) af.scrollIntoView({behavior:'smooth', block:'center'});
  };

  document.addEventListener('DOMContentLoaded', apply, {once:true});
  apply();
})();

// --- Correct Hand Fan (bottom-center pivot; ~25° total spread) ---
(function handFan(){
  function layout(){
    const hand = document.querySelector('.hand');
    if (!hand) return;
    const cards = Array.from(hand.querySelectorAll('.card'));
    const n = cards.length;
    if (!n) return;
    const total = 25; // degrees total fan (Option A)
    const half = total/2;
    const spacing = 26; // px between anchor points
    for (let i=0;i<n;i++){
      const t = (i-(n-1)/2);
      const ang = (n>1? (t/((n-1)/2))*half : 0);
      const offset = t * spacing;
      const el = cards[i];
      el.style.transform = `translate(calc(-50% + ${offset}px), 0) rotate(${ang}deg)`;
    }
  }
  const obs = new MutationObserver(layout);
  obs.observe(document.body, {childList:true, subtree:true});
  window.addEventListener('resize', layout, {passive:true});
  document.addEventListener('DOMContentLoaded', layout, {once:true});
  setTimeout(layout, 120);
})();

// --- Aetherflow River: start empty; reveal 1 per turn; shift ---
(function aetherflowRiver(){
  const q = (s,r=document)=>r.querySelector(s);
  const qa = (s,r=document)=>Array.from(r.querySelectorAll(s));

  function setup(){
    const af = q('.aetherflow'); const list = af ? q('.af-cards', af) : null;
    if (!af || !list) return;
    const cards = qa('.af-card', list);
    if (!cards.length) return;
    cards.forEach((c,i)=>{ c.dataset.afIdx = String(i); c.classList.add('af-hidden'); });
    window.__AFRiver = {
      nextIndex: 0, cards,
      revealOne(){
        const idx = this.nextIndex;
        if (idx < this.cards.length){
          const visible = this.cards.filter(c=>!c.classList.contains('af-hidden'));
          if (visible.length) visible[0].classList.add('af-hidden'); // shift river
          const c = this.cards[idx];
          c.classList.remove('af-hidden');
          this.nextIndex = idx + 1;
        }
      },
      reset(){ this.cards.forEach(c=>c.classList.add('af-hidden')); this.nextIndex = 0; }
    };
    if (!document.getElementById('tgAfHiddenStyle')){
      const st = document.createElement('style'); st.id='tgAfHiddenStyle';
      st.textContent = '.af-card.af-hidden{ visibility:hidden; pointer-events:none; }';
      document.head.appendChild(st);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true});
  else setup();

  const MAX=10000, START=Date.now();
  (function waitGame(){
    if (window.game && window.game.dispatch) attach();
    else if (Date.now()-START<MAX) setTimeout(waitGame, 60);
  })();

  function attach(){
    try{
      const origDispatch = window.game.dispatch.bind(window.game);
      window.game.dispatch = (action)=>{
        const r = origDispatch(action);
        const t = action && action.type;
        if (t==='START'){ window.__AFRiver?.reset?.(); }
        else if (t==='START_TURN'){ window.__AFRiver?.revealOne?.(); }
        return r;
      };
    }catch(_){}
  }
})();

// --- Mutation-based "drop snap" ---
(function dropSnap(){
  const slots = document.querySelectorAll('[data-board] .slots');
  const obs = new MutationObserver((mutations)=>{
    for (const m of mutations) {
      if (m.type==='childList' && m.addedNodes.length) {
        m.addedNodes.forEach(node=>{
          if (node && node.classList && node.classList.contains('card')) {
            node.classList.add('drop-zoom');
            setTimeout(()=> node.classList.remove('drop-zoom'), 200);
          }
        });
      }
    }
  });
  slots.forEach(s => obs.observe(s, {childList:true}));
})();

// --- HUD counters + version badge ---
(function ensureBottomCounters(){
  const right = document.querySelector('.hud-min .right');
  if (!right) return;
  const endBtn = document.getElementById('btnEnd') || right.lastElementChild;
  function makePill(id, sym){
    const el = document.createElement('span');
    el.id = id; el.className = 'hud-pill';
    el.innerHTML = `<span class="sym">${sym}</span><span class="val">0</span>`;
    return el;
  }
  if (!document.getElementById('tgTempPill')) right.insertBefore(makePill('tgTempPill','🜂'), endBtn);
  if (!document.getElementById('tgChanPill')) right.insertBefore(makePill('tgChanPill','◇'), endBtn);
  if (!document.getElementById('tgVersion')) { const v = document.createElement('div'); v.id='tgVersion'; v.className='tgVersion'; v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev'); document.body.appendChild(v); }
})();

// --- Engine wire ---
(async function wireAcceptance(){
  try {
    const Engine = await import('./engine.acceptance.js');
    const MAX=10000, START=Date.now();
    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const r = original(action);
          const t=(action&&action.type)||'';
          if (t==='START_TURN' || t==='START_PHASE' || t==='START') {
            Engine.startPhase(game);
            if (typeof Engine.checkTrance === 'function') Engine.checkTrance(game, ()=>{});
          }
          return r;
        };
      }
      Engine.startPhase(game);
      if (typeof Engine.checkTrance === 'function') Engine.checkTrance(game, ()=>{});
    }
    (function wait(){
      if (window.game && window.game.players && window.game.players.length) attach(window.game);
      else if (Date.now()-START < MAX) setTimeout(wait, 60);
    })();
  } catch(e) { console.error('import error', e); }
})();
