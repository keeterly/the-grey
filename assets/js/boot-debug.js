/* assets/js/boot-debug.js — fixed import path */
(function(){ window.__THE_GREY_BUILD = window.__THE_GREY_BUILD || 'v2.3.9-acceptanceP1-safe-v12'; })();

// Inject bottom-right pills (Temp 🜂 and Channeled ◇)
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

  if (!document.getElementById('tgVersion')) {
    const v = document.createElement('div'); v.id='tgVersion'; v.className='tgVersion';
    v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev');
    document.body.appendChild(v);
  }
})();

// Mechanics + HUD sync (use local path; boot-debug.js lives in /assets/js/)
(async function wireAcceptance(){
  try {
    // IMPORTANT: relative path from this file's directory
    const Engine = await import('./engine.acceptance.safe.js');

    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const r = original(action);
          const t = (action && action.type) || '';
          if (t==='START_TURN' || t==='START_PHASE' || t==='START') {
            Engine.startPhase(game);
            Engine.checkTrance?.(game, ()=>{});
          }
          return r;
        };
      }
      Engine.startPhase(game);
      Engine.checkTrance?.(game, ()=>{});
    }

    const MAX=10000, START=Date.now();
    (function wait(){
      if (window.game && window.game.players && window.game.players.length) attach(window.game);
      else if (Date.now()-START < MAX) setTimeout(wait, 60);
      else console.warn('[safe acceptance] game not detected.');
    })();

    // Sync bottom counters
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
    console.error('acceptance.safe import error', e);
  }
})();
