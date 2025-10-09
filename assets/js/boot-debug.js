/* boot-debug.js — v2.1-acceptanceP1-ui-v5-index (2025-10-09) */
(function(){window.__THE_GREY_BUILD='v2.1-acceptanceP1-ui-v5-index';})();

// Ensure HUD + version badge
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

// Inject acceptance.css if not present
(function ensureAcceptanceCSS(){
  if (document.querySelector('link[data-acceptance]')) return;
  const link = document.createElement('link');
  link.rel='stylesheet'; link.href='./assets/css/acceptance.css'; link.setAttribute('data-acceptance','true');
  document.head.appendChild(link);
})();

// Minimal engine to satisfy Part 1 without requiring your full engine
(function acceptPart1(){
  const MARKET_COSTS = [4,3,2,2,2];
  function ensurePlayerShape(p){
    return { aether:p.aether||0, channeledAether:p.channeledAether||p.channeled||0, hand:p.hand||[], deck:p.deck||[], discard:p.discard||[], hp:p.hp||10, tranceStages:p.tranceStages||{stage1:4,stage2:2}, tranceStage:p.tranceStage||0, aetherFlow:p.aetherFlow||[{cost:4},{cost:3},{cost:2}] };
  }
  function drawOne(player){
    if (player.deck.length===0 && player.discard.length>0) { player.deck = player.discard.slice(); player.discard=[]; for (let i=player.deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [player.deck[i],player.deck[j]]=[player.deck[j],player.deck[i]]; } }
    if (player.deck.length>0) player.hand.push(player.deck.pop());
  }
  function startPhase(game){
    const idx = game.active ?? game.activePlayer ?? 0;
    const p = ensurePlayerShape(game.players[idx]);
    p.aether = 0;
    if (p.aetherFlow.length>0) { p.aetherFlow.shift(); const tail=p.aetherFlow[p.aetherFlow.length-1]; const next=Math.max(1,(tail?.cost||2)-1); p.aetherFlow.push({cost:next}); }
    const need = Math.max(0, 5 - p.hand.length); for (let i=0;i<need;i++) drawOne(p);
    Object.assign(game.players[idx], p);
  }
  function buyFromMarket(game, i){
    const idx = game.active ?? game.activePlayer ?? 0;
    const p = ensurePlayerShape(game.players[idx]);
    const cost = MARKET_COSTS[i] ?? MARKET_COSTS[MARKET_COSTS.length-1];
    let remain = cost;
    const payA = Math.min(p.aether, remain); p.aether -= payA; remain -= payA;
    if (remain>0) { const payC = Math.min(p.channeledAether, remain); p.channeledAether -= payC; remain -= payC; }
    if (remain>0) return false;
    let card = null;
    if (game.market && typeof game.market.removeAt==='function') card=game.market.removeAt(i);
    if (!card && typeof window.marketRemoveAt==='function') card=window.marketRemoveAt(i);
    if (!card) card={ name:'Card@'+i, id:'mk-'+i+'-'+Date.now(), type:'Market' };
    p.discard.push(card); Object.assign(game.players[idx], p); return true;
  }
  function pulse(stage){
    const el=document.getElementById('heartIcon'); if(!el) return; const cls=stage===1?'pulse-blue':'pulse-red'; el.classList.add(cls); setTimeout(()=>el.classList.remove(cls),2000);
  }
  function checkTrance(game){
    const idx = game.active ?? game.activePlayer ?? 0;
    const p = ensurePlayerShape(game.players[idx]);
    if (p.tranceStage<1 && p.hp<=p.tranceStages.stage1) { p.tranceStage=1; Object.assign(game.players[idx], p); pulse(1); }
    if (p.tranceStage===1 && p.hp<=p.tranceStages.stage2) { p.tranceStage=2; Object.assign(game.players[idx], p); pulse(2); }
  }

  // Wire market chip labels and clicks
  (function wireMarket(){
    const costs=MARKET_COSTS.slice();
    document.querySelectorAll('[data-market-slot]').forEach((el,i)=>{
      const c=el.querySelector('.cost'); if(c) c.textContent = costs[i] ?? costs[costs.length-1] ?? '';
      el.addEventListener('click',()=>buyFromMarket(window.game, i));
    });
  })();

  // Patch dispatch
  (function hook(){
    const g=window.game; if(!g || !g.players || !g.players.length) return;
    if (typeof g.dispatch==='function') {
      const orig=g.dispatch.bind(g);
      g.dispatch=(action)=>{ const r=orig(action); const t=(action&&action.type)||''; if(t==='START_TURN'||t==='START_PHASE'||t==='START'){ startPhase(g); checkTrance(g); } return r; };
    }
    startPhase(g); checkTrance(g);
  })();

  // HUD sync loop
  (function loop(){
    const g=window.game, i=g?(g.active??g.activePlayer??0):0; const p=g&&g.players?g.players[i]:null;
    const t=document.querySelector('#aetherTempIcon .val'); const ch=document.querySelector('#aetherChIcon .val');
    if(p&&t&&ch){ t.textContent=String(p.aether||0); ch.textContent=String((p.channeledAether||p.channeled)||0); }
    requestAnimationFrame(loop);
  })();
})();
