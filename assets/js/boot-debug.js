/* assets/js/boot-debug.js — Repo build v2.3.9-acceptanceP1-ui-v4 (2025-10-09)
   This file wires HUD overlay + acceptance engine.
*/
(function(){window.__THE_GREY_BUILD='v2.3.9-acceptanceP1-ui-v4';})();

// Inject CSS from assets/css/acceptance.css if not already loaded
(function ensureAcceptanceCSS(){
  if (document.querySelector('link[data-acceptance]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = './assets/css/acceptance.css'; link.setAttribute('data-acceptance','true');
  document.head.appendChild(link);
})();

// HUD overlay
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

// Minimal UI hooks
const UIHooks = (()=>{
  const heartEl = ()=> document.getElementById('heartIcon');
  const toastEl = ()=> document.getElementById('toast');
  function toast(msg){
    const el = toastEl(); if (!el) return;
    el.textContent = msg; el.classList.add('show'); setTimeout(()=> el.classList.remove('show'), 1200);
  }
  function pulseHeart(stage){
    const el = heartEl(); if (!el) return;
    const cls = stage===1 ? 'pulse-blue' : 'pulse-red';
    el.classList.add(cls); setTimeout(()=> el.classList.remove(cls), 2000);
  }
  return { toast, pulseHeart };
})();

// Load engine module (ESM dynamic import to avoid bundler changes)
(async function wireAcceptance(){
  try {
    const mod = await import('./assets/js/engine.acceptance.js');
    const Acceptance = mod;

    // Render market slot costs if markup exists
    const costs = Acceptance.getMarketCosts();
    document.querySelectorAll('[data-market-slot]').forEach((el, i)=>{
      const c = el.querySelector('.cost'); if (c) c.textContent = costs[i] ?? costs[costs.length-1] ?? '';
      el.addEventListener('click', ()=>{ try {
        const res = Acceptance.buyFromMarket(window.game, i);
        if (!res.ok) return; UIHooks.toast((res.card?.name||'Card')+' → Discard');
      } catch(e){} });
    });

    // Patch dispatch for Start Phase + Trance
    function hook(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{
          const result = original(action);
          const type = (action && action.type) || '';
          if (type==='START_TURN' || type==='START_PHASE' || type==='START') {
            Acceptance.startPhase(game);
            Acceptance.checkTrance(game, (stage)=> UIHooks.pulseHeart(stage));
          }
          return result;
        };
      }
      Acceptance.startPhase(game);
      Acceptance.checkTrance(game, (stage)=> UIHooks.pulseHeart(stage));
    }

    const MAX_WAIT_MS = 10000; const start = Date.now();
    (function waitGame(){
      if (window.game && window.game.players && window.game.players.length) hook(window.game);
      else if (Date.now()-start < MAX_WAIT_MS) setTimeout(waitGame, 60);
      else console.warn('[Acceptance] game not detected.');
    })();

    // Continuous HUD sync
    (function loop(){
      const g = window.game, i = g ? (g.active ?? g.activePlayer ?? 0) : 0;
      const p = g && g.players ? g.players[i] : null;
      const tempEl = document.querySelector('#aetherTempIcon .val');
      const chanEl = document.querySelector('#aetherChIcon .val');
      if (p && tempEl && chanEl){
        tempEl.textContent = String(p.aether ?? 0);
        chanEl.textContent = String((p.channeledAether ?? p.channeled) ?? 0);
      }
      requestAnimationFrame(loop);
    })();

  } catch (e) {
    console.error('Failed to wire acceptance engine', e);
  }
})();
