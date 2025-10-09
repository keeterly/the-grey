
/* assets/js/boot-debug.js — micro: drop snap + AF zoom; version v2.3.9-acceptanceP1-safe-v16 */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v16'; })();

// --- Ensure rotate overlay exists (no-op if already present) ---
(function ensureRotateOverlay(){
  if (document.getElementById('tgRotateOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'tgRotateOverlay';
  overlay.className = 'tg-rotate-overlay';
  overlay.innerHTML = '<div class="tg-rotate-card"><div class="tg-rotate-title">Rotate for best view</div><div class="tg-rotate-sub">Landscape shows more of the board. Portrait uses a compact/mini layout.</div></div>';
  document.body.appendChild(overlay);
})();

// --- HUD buttons (⇆ compact & +AF zoom) ---
(function ensureHudButtons(){
  const left = document.querySelector('.hud-min .left');
  const right = document.querySelector('.hud-min .right');
  if (left) {
    let btn = document.getElementById('tgCompactToggle');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'tgCompactToggle';
      btn.className = 'icon btn';
      btn.textContent = '⇆'; btn.title = 'Layout: Auto / Mini / Off';
      left.prepend(btn);
    }
  }
  if (right) {
    let af = document.getElementById('tgAFZoom');
    if (!af) {
      af = document.createElement('div');
      af.id = 'tgAFZoom';
      af.className = 'icon btn';
      af.title = 'Zoom Aetherflow';
      af.textContent = '+AF';
      right.appendChild(af);
    }
  }
})();

// --- Mobile mode / toggle behavior ---
(function mobileModes(){
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref'; // 'auto' | 'mini' | 'off'
  function getPref(){ try{ return localStorage.getItem(LS_KEY) || 'auto'; }catch(_){ return 'auto'; }}
  function setPref(v){ try{ localStorage.setItem(LS_KEY, v); }catch(_){}};

  const overlay = document.getElementById('tgRotateOverlay');
  const compactBtn = document.getElementById('tgCompactToggle');
  const afBtn = document.getElementById('tgAFZoom');

  function isSmall(){ return Math.min(window.innerWidth, window.innerHeight) <= 900; }
  function isPortrait(){ return window.matchMedia('(orientation: portrait)').matches; }

  function labelFromPref(p){ return p==='mini' ? 'Mini' : p==='off' ? 'Off' : 'Auto'; }

  function apply(){
    const pref = getPref();
    const small = isSmall();
    const portrait = isPortrait();

    const autoMini = small && portrait;
    const mini = (pref==='mini') ? true : (pref==='off') ? false : autoMini;

    if (overlay) overlay.classList.toggle('show', small && portrait);

    docEl.classList.toggle('mobile-mini', mini);
    docEl.classList.toggle('mobile-compact', false);

    if (compactBtn) compactBtn.setAttribute('data-count', labelFromPref(pref));
  }

  function cycle(){
    const p = getPref();
    const next = p==='auto' ? 'mini' : p==='mini' ? 'off' : 'auto';
    setPref(next);
    apply();
  }

  if (compactBtn) compactBtn.onclick = cycle;
  if (afBtn) afBtn.onclick = function(){
    const on = !document.documentElement.classList.contains('af-zoom');
    document.documentElement.classList.toggle('af-zoom', on);
    const af = document.querySelector('.aetherflow');
    if (on && af) af.scrollIntoView({behavior:'smooth', block:'center'});
  };

  ['resize','orientationchange'].forEach(evt => window.addEventListener(evt, apply, {passive:true}));
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  apply();
})();

// --- Drop Snap: animate when a card lands in a slot ---
(function dropSnap(){
  const slots = document.querySelectorAll('[data-board] .slots');
  const obs = new MutationObserver((mutations)=>{
    for (const m of mutations) {
      if (m.type==='childList' && m.addedNodes.length) {
        m.addedNodes.forEach(node=>{
          if (node && node.classList && node.classList.contains('card')) {
            node.classList.add('drop-zoom');
            setTimeout(()=> node.classList.remove('drop-zoom'), 220);
          }
        });
      }
    }
  });
  slots.forEach(s => obs.observe(s, {childList:true}));
})();

// --- Bottom counters + version badge (kept) ---
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

// --- Engine wiring (unchanged) ---
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
      else console.warn('[safe acceptance] game not detected.'); })();
    (function tick(){
      const g = window.game, i = g ? (g.active ?? g.activePlayer ?? 0) : 0;
      const p = g && g.players ? g.players[i] : null;
      const tempEl = document.querySelector('#tgTempPill .val');
      const chanEl = document.querySelector('#tgChanPill .val');
      if (p && tempEl && chanEl) { tempEl.textContent = String(p.aether ?? 0); chanEl.textContent = String((p.channeledAether ?? p.channeled) ?? 0); }
      requestAnimationFrame(tick);
    })();
  } catch (e) {
    console.error('acceptance import error', e);
  }
})();
