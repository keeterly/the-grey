
/* assets/js/boot-debug.js — mobile mini 50% + visible toggle; version v2.3.9-acceptanceP1-safe-v15 */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v15'; })();

(function mobileController(){
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref'; // 'auto' | 'mini' | 'off'
  function getPref(){ try{ return localStorage.getItem(LS_KEY) || 'auto'; }catch(_){ return 'auto'; } }
  function setPref(v){ try{ localStorage.setItem(LS_KEY, v); }catch(_){} }

  // Rotate overlay
  let overlay = document.getElementById('tgRotateOverlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'tgRotateOverlay';
    overlay.className = 'tg-rotate-overlay';
    overlay.innerHTML = '<div class="tg-rotate-card"><div class="tg-rotate-title">Rotate for best view</div><div class="tg-rotate-sub">Landscape shows more of the board. Portrait uses a mini 50% layout.</div></div>';
    document.body.appendChild(overlay);
  }

  // Ensure toggle exists and is visible
  function ensureCompactToggle(){
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
    function cycle(){
      const p = getPref();
      const next = p==='auto' ? 'mini' : p==='mini' ? 'off' : 'auto';
      setPref(next);
      apply();
      btn.setAttribute('data-count', label(next));
    }
    btn.onclick = cycle;
    btn.setAttribute('data-count', label(getPref()));
  }

  function isSmall(){ return Math.min(window.innerWidth, window.innerHeight) <= 900; }
  function isPortrait(){ return window.matchMedia('(orientation: portrait)').matches; }

  function apply(){
    const pref = getPref();
    const small = isSmall();
    const portrait = isPortrait();

    // Determine "mini" mode
    const autoMini = small && portrait; // auto: mini in portrait small
    const mini = pref==='mini' ? true : pref==='off' ? false : autoMini;

    // Overlay only when portrait small
    overlay.classList.toggle('show', small && portrait);

    // Apply classes
    docEl.classList.toggle('mobile-mini', mini);
    docEl.classList.toggle('mobile-compact', false); // ensure old mode is off

    // Update button badge if present
    const btn = document.getElementById('tgCompactToggle');
    if (btn){
      const label = (pref==='mini'?'Mini':pref==='off'?'Off':'Auto');
      btn.setAttribute('data-count', label);
    }
  }

  ['resize','orientationchange'].forEach(evt => window.addEventListener(evt, apply, {passive:true}));
  document.addEventListener('DOMContentLoaded', ()=>{ ensureCompactToggle(); apply(); }, {once:true});
  apply();
})();

// --- Existing HUD counters + version badge ---
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

// --- Mechanics + HUD sync (unchanged) ---
(async function wireAcceptance(){
  try {
    const Engine = await import('./engine.acceptance.js');
    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const r = original(action);
          const t = (action && action.type) || '';
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
    const MAX=10000, START=Date.now();
    (function wait(){
      if (window.game && window.game.players && window.game.players.length) attach(window.game);
      else if (Date.now()-START < MAX) setTimeout(wait, 60);
      else console.warn('[safe acceptance] game not detected.');
    })();
    (function tick(){
      const g = window.game, i = g ? (g.active ?? g.activePlayer ?? 0) : 0;
      const p = g && g.players ? g.players[i] : null;
      const tempEl = document.querySelector('#tgTempPill .val');
      const chanEl = document.querySelector('#tgChanPill .val');
      if (p && tempEl && chanEl) {
        tempEl.textContent = String(p.aether ?? 0);
        chanEl.textContent = String((p.channeledAether ?? p.channeled) ?? 0);
      }
      requestAnimationFrame(tick);
    })();
  } catch (e) {
    console.error('acceptance import error', e);
  }
})();
