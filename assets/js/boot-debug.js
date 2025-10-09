/* assets/js/boot-debug.js — SAFE BUILD v2.3.9-acceptanceP1-safe-v9 (2025-10-09) */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v9'; })();

// Inject bottom-right pills (Temp 🜂 and Channeled ◇) with clean spacing
(function ensureBottomCounters(){
  const right = document.querySelector('.hud-min .right');
  if (!right) return;

  // Insert pills before the End Turn button
  const endBtn = document.getElementById('btnEnd');

  function makePill(id, sym){
    const el = document.createElement('span');
    el.id = id; el.className = 'hud-pill';
    el.innerHTML = `<span class="sym">{sym}</span><span class="val">0</span>`;
    return el;
  }

  if (!document.getElementById('tgTempPill')) {
    right.insertBefore(makePill('tgTempPill', '🜂'), endBtn);
  }
  if (!document.getElementById('tgChanPill')) {
    right.insertBefore(makePill('tgChanPill', '◇'), endBtn);
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

    // Light centering fallback (only add inline style if not already centered)
    (function centerFallback(){
      const rows = document.querySelectorAll('.board .slots, .slot-row, .slots, [data-player-slots], [data-ai-slots]');
      rows.forEach(row=>{
        const st = getComputedStyle(row);
        if (st.display !== 'flex' || st.justifyContent !== 'center') {
          row.style.display = 'flex';
          row.style.justifyContent = 'center';
          row.style.alignItems = 'center';
          row.style.gap = row.style.gap || '0.75rem';
        }
      });
    })();

  } catch(e) {
    console.error('acceptance.safe import failed', e);
  }
})();
