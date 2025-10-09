/* assets/js/boot-debug.js — SAFE BUILD v2.3.9-acceptanceP1-safe-v7 (2025-10-09) */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v7'; })();

// HUD overlay & version badge (scoped)
(function ensureHUD(){
  if (!document.querySelector('.tgHUD')) {
    const hud = document.createElement('div');
    hud.className = 'tgHUD';
    hud.innerHTML = '<span class="icon" id="tgHeart">♥</span>' +
                    '<span class="icon" id="tgTemp">🜂 <span class="val">0</span></span>' +
                    '<span class="icon" id="tgChan">◇ <span class="val">0</span></span>';
    document.body.appendChild(hud);
  }
  if (!document.getElementById('tgVersion')) {
    const v = document.createElement('div');
    v.id = 'tgVersion'; v.className='tgVersion';
    v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev');
    document.body.appendChild(v);
  }
})();

// Mechanics (safe engine)
(async function wireAcceptance(){
  try {
    const Engine = await import('./assets/js/engine.acceptance.safe.js');

    // Update market costs (no-ops if your markup differs)
    const costs = Engine.getMarketCosts();
    document.querySelectorAll('[data-market-slot]').forEach((el,i)=>{
      const c = el.querySelector('.cost'); if (c) c.textContent = costs[i] ?? costs[costs.length-1] ?? '';
      el.addEventListener('click', ()=>{ try { Engine.buyFromMarket(window.game, i); } catch(e){} });
    });

    // Hook start/trance
    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const r = original(action);
          const t = (action && action.type) || '';
          if (t==='START_TURN' || t==='START_PHASE' || t==='START') {
            Engine.startPhase(game);
            Engine.checkTrance(game, (s)=>{
              const heart = document.getElementById('tgHeart');
              if (heart) {
                const cls = s===1 ? 'tgPulse1' : 'tgPulse2';
                heart.classList.add(cls); setTimeout(()=>heart.classList.remove(cls), 1200);
              }
            });
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

    // HUD sync loop
    (function tick(){
      const g = window.game, i = g ? (g.active ?? g.activePlayer ?? 0) : 0;
      const p = g && g.players ? g.players[i] : null;
      const temp = document.querySelector('#tgTemp .val');
      const chan = document.querySelector('#tgChan .val');
      if (p && temp && chan) { temp.textContent = String(p.aether ?? 0); chan.textContent = String((p.channeledAether ?? p.channeled) ?? 0); }
      requestAnimationFrame(tick);
    })();
  } catch(e) {
    console.error('acceptance.safe import failed', e);
  }
})();
