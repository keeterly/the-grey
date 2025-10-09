/* assets/js/boot-debug.js — cleaned import + version tag */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v13'; })();

// Inject bottom-right pills (Temp 🜂 and Channeled ◇) + version badge
(function ensureHud(){
  const right = document.querySelector('.hud-min .right');
  if (right) {
    const endBtn = document.getElementById('btnEnd') || right.lastElementChild;
    function pill(id, sym){
      const el = document.createElement('span');
      el.id = id; el.className = 'hud-pill';
      el.innerHTML = `<span class="sym">${sym}</span><span class="val">0</span>`;
      return el;
    }
    if (!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill','🜂'), endBtn);
    if (!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill','◇'), endBtn);
  }
  if (!document.getElementById('tgVersion')) {
    const v = document.createElement('div'); v.id='tgVersion'; v.className='tgVersion';
    v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev');
    document.body.appendChild(v);
  }
})();

// Mechanics + HUD sync
(async function wireAcceptance(){
  try {
    // Clean, local import (this file is in /assets/js/)
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
      else console.warn('[acceptance] game not detected.');
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
    console.error('boot-debug import error', e);
  }
})();
