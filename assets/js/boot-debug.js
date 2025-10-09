
/* assets/js/boot-debug.js — mobile compact + rotate overlay + toggle; version v2.3.9-acceptanceP1-safe-v14 */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v14'; })();

// --- Mobile Controller with Persistent Compact Toggle ---
(function mobileController(){
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref'; // 'auto' | 'on' | 'off'
  function getPref(){ try{ return localStorage.getItem(LS_KEY) || 'auto'; }catch(_){ return 'auto'; } }
  function setPref(v){ try{ localStorage.setItem(LS_KEY, v); }catch(_){} }

  // Create rotate overlay
  let overlay = document.getElementById('tgRotateOverlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'tgRotateOverlay';
    overlay.className = 'tg-rotate-overlay';
    overlay.innerHTML = '<div class="tg-rotate-card"><div class="tg-rotate-title">Rotate for best view</div><div class="tg-rotate-sub">Landscape shows more of the board. You can still play in portrait— we\'ll compact the layout automatically.</div></div>';
    document.body.appendChild(overlay);
  }

  // Add a tiny "Compact" toggle in HUD (cycles Auto → On → Off)
  function ensureCompactToggle(){
    const left = document.querySelector('.hud-min .left');
    if (!left) return;
    if (document.getElementById('tgCompactToggle')) return;
    const btn = document.createElement('div');
    btn.id = 'tgCompactToggle';
    btn.className = 'icon btn';
    btn.title = 'Compact layout: Auto / On / Off';
    btn.textContent = '⇆'; // simple icon
    left.appendChild(btn);

    function labelFromPref(p){ return p==='on' ? 'On' : p==='off' ? 'Off' : 'Auto'; }
    function cycle(){ const p=getPref(); const next = p==='auto' ? 'on' : p==='on' ? 'off' : 'auto'; setPref(next); apply(); }
    btn.addEventListener('click', cycle);
    btn.addEventListener('mouseenter', ()=>{ btn.setAttribute('data-count', labelFromPref(getPref())); });
    btn.addEventListener('mouseleave', ()=>{ btn.removeAttribute('data-count'); });
  }

  function smallSide(){ return Math.min(window.innerWidth, window.innerHeight); }
  function isSmall(){ return smallSide() <= 900; }
  function isPortrait(){ return window.matchMedia('(orientation: portrait)').matches; }

  function apply(){
    const pref = getPref();
    const small = isSmall();
    const portrait = isPortrait();
    const autoCompact = small && portrait;
    const compact = pref==='on' ? true : pref==='off' ? false : autoCompact;
    // Apply UI
    overlay.classList.toggle('show', compact && portrait); // prompt only in portrait
    docEl.classList.toggle('mobile-compact', compact);
    // Reflect state on toggle
    const btn = document.getElementById('tgCompactToggle');
    if (btn) btn.setAttribute('data-count', (pref==='on'?'On':pref==='off'?'Off':'Auto'));
  }

  ['resize','orientationchange'].forEach(evt => window.addEventListener(evt, apply, {passive:true}));
  document.addEventListener('DOMContentLoaded', ()=>{ ensureCompactToggle(); apply(); }, {once:true});
  apply();
})();

// --- HUD counters + version badge (unchanged) ---
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

// --- Mechanics + HUD sync ---
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
