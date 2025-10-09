/* assets/js/boot-debug.js — SAFE BUILD v2.3.9-acceptanceP1-safe-v8 (2025-10-09) */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v8'; })();

// Create counter pills inside bottom-right HUD, next to aetherWell
(function ensureBottomCounters(){
  const right = document.querySelector('.hud-min .right');
  if (!right) return;
  // Avoid duplicates
  if (!document.getElementById('tgTempPill')) {
    const temp = document.createElement('span');
    temp.id = 'tgTempPill'; temp.className = 'hud-pill temp';
    temp.innerHTML = '<span class="val">0</span>';
    right.insertBefore(temp, document.getElementById('btnEnd'));
  }
  if (!document.getElementById('tgChanPill')) {
    const chan = document.createElement('span');
    chan.id = 'tgChanPill'; chan.className = 'hud-pill chan';
    chan.innerHTML = '<span class="val">0</span>';
    right.insertBefore(chan, document.getElementById('btnEnd'));
  }
  // Version badge (top-left)
  if (!document.getElementById('tgVersion')) {
    const v = document.createElement('div'); v.id='tgVersion'; v.className='tgVersion';
    v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev');
    document.body.appendChild(v);
  }
})();

// Mechanics (safe engine) + HUD sync
(async function wireAcceptance(){
  try {
    const Engine = await import('./assets/js/engine.acceptance.safe.js');

    // Update market costs where present
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

    // Bottom HUD sync: temp (🜂) and channeled (◇) aether
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

  } catch(e) {
    console.error('acceptance.safe import failed', e);
  }
})();
