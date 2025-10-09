/* assets/js/boot-debug.js — build v2.1-acceptanceP1-ui-v5 (2025-10-09) */
(function(){window.__THE_GREY_BUILD='v2.1-acceptanceP1-ui-v5';})();

// Ensure CSS
(function ensureAcceptanceCSS(){
  if (document.querySelector('link[data-acceptance]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = './assets/css/acceptance.css'; link.setAttribute('data-acceptance','true');
  document.head.appendChild(link);
})();

// HUD overlay + version badge
(function ensureHUD(){
  if (!document.getElementById('hudOverlay')) {
    const hud = document.createElement('div'); hud.id='hudOverlay'; hud.className='hud-overlay';
    const heart = document.createElement('span'); heart.id='heartIcon'; heart.className='hud-icon'; heart.textContent='♥';
    const aTemp = document.createElement('span'); aTemp.id='aetherTempIcon'; aTemp.className='hud-icon icon-aether-temp'; aTemp.innerHTML='<span aria-hidden="true">🜂</span><span class="val">0</span>';
    const aChan = document.createElement('span'); aChan.id='aetherChIcon'; aChan.className='hud-icon icon-aether-channeled'; aChan.innerHTML='<span aria-hidden="true">◇</span><span class="val">0</span>';
    hud.appendChild(heart); hud.appendChild(aTemp); hud.appendChild(aChan); document.body.appendChild(hud);
  }
  if (!document.getElementById('versionBadge')) {
    const v = document.createElement('div'); v.id='versionBadge'; v.textContent='The Grey — '+(window.__THE_GREY_BUILD||'dev');
    document.body.appendChild(v);
  }
})();

// UI hooks
const UIHooks = (()=>{
  const heartEl = ()=> document.getElementById('heartIcon');
  function pulseHeart(stage){
    const el = heartEl(); if (!el) return;
    const cls = stage===1 ? 'pulse-blue' : 'pulse-red';
    el.classList.add(cls); setTimeout(()=> el.classList.remove(cls), 2000);
  }
  return { pulseHeart };
})();

// Wire acceptance engine via ESM
(async function wire(){
  try {
    const Engine = await import('./assets/js/engine.acceptance.js');
    const MAX_WAIT_MS = 10000; const start = Date.now();

    function hook(game){
      if (typeof game.dispatch === 'function'){
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const result = original(action);
          const type = (action && action.type) || '';
          if (type==='START_TURN' || type==='START_PHASE' || type==='START') {
            Engine.startPhase(game);
            Engine.checkTrance(game, (s)=> UIHooks.pulseHeart(s));
          }
          return result;
        };
      }
      Engine.startPhase(game);
      Engine.checkTrance(game, (s)=> UIHooks.pulseHeart(s));
    }

    (function wait(){
      if (window.game && window.game.players && window.game.players.length) hook(window.game);
      else if (Date.now()-start < MAX_WAIT_MS) setTimeout(wait, 60);
      else console.warn('[Acceptance] game not detected.');
    })();

    // Market costs + clicks
    const costs = Engine.getMarketCosts();
    document.querySelectorAll('[data-market-slot]').forEach((el,i)=>{
      const c = el.querySelector('.cost'); if (c) c.textContent = costs[i] ?? costs[costs.length-1] ?? '';
      el.addEventListener('click', ()=>{ try { Engine.buyFromMarket(window.game, i); } catch(e){} });
    });

    // HUD value sync
    (function loop(){
      const g = window.game, i = g ? (g.active ?? g.activePlayer ?? 0) : 0;
      const p = g && g.players ? g.players[i] : null;
      const t = document.querySelector('#aetherTempIcon .val');
      const ch = document.querySelector('#aetherChIcon .val');
      if (p && t && ch) { t.textContent = String(p.aether ?? 0); ch.textContent = String((p.channeledAether ?? p.channeled) ?? 0); }
      requestAnimationFrame(loop);
    })();

  } catch (e) {
    console.error('engine.acceptance import failed', e);
  }
})();
