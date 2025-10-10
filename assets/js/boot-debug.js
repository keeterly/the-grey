
/* assets/js/boot-debug.js — Board Proportions + AF River; version v2.3.9-acceptanceP1-safe-v17 */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v17'; })();

(function ensureRotateOverlay(){
  if (document.getElementById('tgRotateOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'tgRotateOverlay';
  overlay.className = 'tg-rotate-overlay';
  overlay.innerHTML = '<div class="tg-rotate-card"><div class="tg-rotate-title">Rotate for best view</div><div class="tg-rotate-sub">Portrait uses a mini layout. Landscape shows more of the board.</div></div>';
  document.body.appendChild(overlay);
})();

(function mobileMiniToggle(){
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref';
  function getPref(){ try{ return localStorage.getItem(LS_KEY) || 'auto'; }catch(_){ return 'auto'; }}
  function setPref(v){ try{ localStorage.setItem(LS_KEY, v); }catch(_){}};
  function isSmall(){ return Math.min(window.innerWidth, window.innerHeight) <= 900; }
  function isPortrait(){ return window.matchMedia('(orientation: portrait)').matches; }
  const overlay = document.getElementById('tgRotateOverlay');

  function ensureToggle(){
    const left = document.querySelector('.hud-min .left');
    if (!left) return;
    let btn = document.getElementById('tgCompactToggle');
    if (!btn){
      btn = document.createElement('div');
      btn.id = 'tgCompactToggle';
      btn.className = 'icon btn';
      btn.title = 'Layout: Auto / Mini / Off';
      btn.textContent = '⇆';
      left.prepend(btn);
    }
    function label(p){ return p==='mini' ? 'Mini' : p==='off' ? 'Off' : 'Auto'; }
    btn.onclick = function(){
      const p = getPref();
      const next = p==='auto' ? 'mini' : p==='mini' ? 'off' : 'auto';
      setPref(next); apply(); btn.setAttribute('data-count', label(next));
    };
    btn.setAttribute('data-count', label(getPref()));
  }

  function apply(){
    const pref = getPref();
    const small = isSmall();
    const portrait = isPortrait();
    const autoMini = small && portrait;
    const mini = pref==='mini' ? true : (pref==='off' ? false : autoMini);
    document.documentElement.classList.toggle('mobile-mini', mini);
    document.documentElement.classList.toggle('mobile-compact', false);
    if (overlay) overlay.classList.toggle('show', small && portrait);
    const btn = document.getElementById('tgCompactToggle');
    if (btn) btn.setAttribute('data-count', (pref==='mini'?'Mini':pref==='off'?'Off':'Auto'));
  }

  ['resize','orientationchange'].forEach(evt => window.addEventListener(evt, apply, {passive:true}));
  document.addEventListener('DOMContentLoaded', ()=>{ ensureToggle(); apply(); }, {once:true});
  apply();
})();

/* Aetherflow River: starts empty; each START_TURN reveals one; river shift behavior */
(function aetherflowRiver(){
  const q = (sel,root=document)=>root.querySelector(sel);
  const qa = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

  function setup(){
    const af = q('.aetherflow');
    const list = af ? q('.af-cards', af) : null;
    if (!af || !list) return;

    const cards = qa('.af-card', list);
    if (!cards.length) return;

    cards.forEach((c,i)=>{ c.dataset.afIdx = String(i); c.classList.add('af-hidden'); });

    window.__AFRiver = {
      nextIndex: 0,
      cards,
      revealOne(){
        const idx = this.nextIndex;
        if (idx < this.cards.length){
          const visible = this.cards.filter(c=>!c.classList.contains('af-hidden'));
          if (visible.length) visible[0].classList.add('af-hidden'); // shift
          const c = this.cards[idx];
          c.classList.remove('af-hidden');
          this.nextIndex = idx + 1;
        }
      },
      reset(){
        this.cards.forEach(c=>c.classList.add('af-hidden'));
        this.nextIndex = 0;
      }
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
    if (window.game) attach();
    else if (Date.now()-START<MAX) setTimeout(waitGame, 60);
  })();

  function attach(){
    try{
      const origDispatch = window.game && window.game.dispatch ? window.game.dispatch.bind(window.game) : null;
      if (!origDispatch) return;
      window.game.dispatch = (action)=>{
        const r = origDispatch(action);
        const t = action && action.type;
        if (t==='START'){
          window.__AFRiver && window.__AFRiver.reset && window.__AFRiver.reset();
        } else if (t==='START_TURN'){
          window.__AFRiver && window.__AFRiver.revealOne && window.__AFRiver.revealOne();
        }
        return r;
      };
    }catch(_){}
  }
})();

/* Drop snap nicety */
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

/* Bottom counters + version badge */
(function ensureBottomCounters(){
  const right = document.querySelector('.hud-min .right');
  if (!right) return;
  const endBtn = document.getElementById('btnEnd') || right.lastElementChild;
  function pill(id, sym){
    const el = document.createElement('span');
    el.id = id; el.className = 'hud-pill';
    el.innerHTML = `<span class="sym">${sym}</span><span class="val">0</span>`;
    return el;
  }
  if (!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill','🜂'), endBtn);
  if (!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill','◇'), endBtn);
  if (!document.getElementById('tgVersion')) { const v = document.createElement('div'); v.id='tgVersion'; v.className='tgVersion'; v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev'); document.body.appendChild(v); }
})();

/* Engine wire */
(async function wireAcceptance(){
  try {
    const Engine = await import('./engine.acceptance.js');
    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{ const r = original(action); const t=(action&&action.type)||'';
          if (t==='START_TURN' || t==='START_PHASE' || t==='START') { Engine.startPhase(game); if (typeof Engine.checkTrance === 'function') Engine.checkTrance(game, ()=>{}); }
          return r; };
      }
      Engine.startPhase(game);
      if (typeof Engine.checkTrance === 'function') Engine.checkTrance(game, ()=>{});
    }
    const MAX=10000, START=Date.now();
    (function wait(){ if(window.game && window.game.players && window.game.players.length) attach(window.game);
      else if(Date.now()-START < MAX) setTimeout(wait, 60);
      else console.warn('[acceptance] game not detected.'); })();
  } catch (e) { console.error('boot-debug import error', e); }
})();
