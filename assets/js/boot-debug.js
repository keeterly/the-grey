/* assets/js/boot-debug.js — SAFE BUILD v2.3.9-acceptanceP1-safe-v13 (2025-10-09) */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v13'; })();

// Build pill-style controls and counters in bottom HUD
(function ensureBottomHUD(){
  const hud = document.querySelector('.hud-min');
  if (!hud) return;
  const left = hud.querySelector('.left'); const right = hud.querySelector('.right');
  const endBtn = document.getElementById('btnEnd') || right.lastElementChild;

  // Convert deck & discard to pill buttons on the left
  function toPill(btn, id, sym) {
    if (!btn) return null;
    const pill = document.createElement('span');
    pill.className = 'hud-pill btn-pill'; pill.id = id;
    pill.innerHTML = `<span class="sym">${sym}</span>`;
    btn.replaceWith(pill);
    return pill;
  }
  const deckPill = toPill(document.getElementById('deckIcon'), 'deckPill', '⟲');
  const discardPill = toPill(document.getElementById('discardIcon'), 'discardPill', '⌫');

  // Create End Turn pill on the right
  if (!document.getElementById('endPill')) {
    const endPill = document.createElement('span');
    endPill.id = 'endPill'; endPill.className = 'hud-pill btn-pill';
    endPill.innerHTML = '<span class="sym">⏵</span>';
    if (endBtn) endBtn.replaceWith(endPill); else right.appendChild(endPill);
  }

  // Replace counters with pill style (if not already present)
  function makeCounter(id, sym) {
    const el = document.createElement('span'); el.id = id; el.className = 'hud-pill';
    el.innerHTML = `<span class="sym">${sym}</span><span class="val">0</span>`; return el;
  }
  if (!document.getElementById('tgTempPill')) right.insertBefore(makeCounter('tgTempPill','🜂'), right.firstChild);
  if (!document.getElementById('tgChanPill')) right.insertBefore(makeCounter('tgChanPill','◇'), right.firstChild);

  // Invisible drop proxy to keep aetherWell DnD working, but convert gain to permanent ◇
  if (!document.getElementById('_aetherWellProxy')) {
    const proxy = document.createElement('div'); proxy.id = '_aetherWellProxy'; document.body.appendChild(proxy);
    proxy.addEventListener('dragover', e => { e.preventDefault(); });
    proxy.addEventListener('drop', e => {
      try {
        const g = window.game; if (!g || !g.players) return;
        const i = g.active ?? g.activePlayer ?? 0; const p = g.players[i];
        // Try to read amount from dataTransfer; fallback to +1
        let delta = 1;
        const dt = e.dataTransfer;
        if (dt) {
          const raw = dt.getData('text/plain') || dt.getData('application/aether') || '';
          const m = raw.match(/[+-]?\d+/); if (m) delta = parseInt(m[0],10);
        }
        p.channeledAether = (p.channeledAether ?? p.channeled ?? 0) + (isNaN(delta)?1:delta);
        // If base handler already added to temp, try to net it out
        if ((p.aether ?? 0) >= delta) p.aether -= delta;
      } catch(_e) { }
    });
  }

  // Hide the original lightning bolt but keep its element for any legacy handlers
  const aetherWell = document.getElementById('aetherWell');
  if (aetherWell) aetherWell.setAttribute('aria-hidden','true');

  // Version badge
  if (!document.getElementById('tgVersion')) {
    const v = document.createElement('div'); v.id='tgVersion'; v.className='tgVersion';
    v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev');
    document.body.appendChild(v);
  }
})();

// Mechanics + HUD sync
(async function wireAcceptance(){
  try {
    const Engine = await import('./assets/js/engine.acceptance.safe.js');

    // Update market costs if available
    const costs = Engine.getMarketCosts();
    document.querySelectorAll('[data-market-slot]').forEach((el,i)=>{
      const c = el.querySelector('.cost'); if (c) c.textContent = costs[i] ?? costs[costs.length-1] ?? '';
      el.addEventListener('click', ()=>{ try { Engine.buyFromMarket(window.game, i); } catch(e){} });
    });

    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const r = original(action);
          const t = (action && action.type) || '';
          if (t==='START_TURN' || t==='START_PHASE' || t==='START') {
            Engine.startPhase(game);
            Engine.checkTrance(game, ()=>{});
          }
          return r;
        };
      }
      Engine.startPhase(game);
      Engine.checkTrance(game, ()=>{});
    }

    const MAX=10000, START=Date.now();
    (function wait(){
      if (window.game && window.game.players && window.game.players.length) attach(window.game);
      else if (Date.now()-START < MAX) setTimeout(wait, 60);
      else console.warn('[safe acceptance] game not detected.');
    })();

    // Sync bottom counters (🜂 temp, ◇ channeled)
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

    // Stronger centering fallback
    (function centerFallback(){
      const rows = document.querySelectorAll('.board .slots, .slot-row, .slots, [data-player-slots], [data-ai-slots]');
      rows.forEach(row=>{
        row.style.display = 'flex';
        row.style.justifyContent = 'center';
        row.style.alignItems = 'center';
      });
    })();

  } catch(e) {
    console.error('acceptance.safe import failed', e);
  }
})();
