/* =======================================================================
   The Grey — Repo‑Merged Variant (v3)
   Drop-in replacements for your existing scripts, no HTML edits required.
   Guarantees:
     • HUD overlay injected (♥, 🜂 temp Aether, ◇ channeled) at 3× size
     • Centered AI/Player slot rows via CSS + JS fallbacks
     • +25% card visual scale (safe origin), increased hand spacing
     • Acceptance Part 1 gameplay: Start Phase, Market buy, Trance pulse
   ======================================================================= */

/* --------------------------- Runtime CSS -------------------------------- */
(function injectCSS(){
  const css = `
  .hud-overlay { position: fixed; top: .75rem; right: .75rem; z-index: 9999; display: flex; gap: .5rem; align-items: center; background: rgba(20,20,20,.35); backdrop-filter: blur(2px); padding: .4rem .6rem; border-radius: .5rem; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  .hud-icon { display:inline-flex; align-items:center; gap:.35em; font-size: 3em; line-height: 1; color:#e6e6e6; }
  .hud-icon .val { font-size:.45em; opacity:.9; min-width:1.2em; text-align:center; }
  #heartIcon { filter: drop-shadow(0 0 4px rgba(255,80,80,.4)); }
  .icon-aether-temp { filter: drop-shadow(0 0 4px rgba(255,200,80,.25)); }
  .icon-aether-channeled { filter: drop-shadow(0 0 4px rgba(160,220,255,.25)); }
  .pulse-blue { animation: pulseBlue 1.25s ease-in-out 2; }
  .pulse-red  { animation: pulseRed  1.25s ease-in-out 2; }
  @keyframes pulseBlue { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(0,255,255,.6)); } 50% { transform: scale(1.18); filter: drop-shadow(0 0 14px rgba(0,255,255,.9)); } }
  @keyframes pulseRed  { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(220,20,60,.6)); } 50% { transform: scale(1.18); filter: drop-shadow(0 0 14px rgba(220,20,60,.9)); } }
  .board .slots, .slot-row, .slots, [data-slot-row], [data-player-slots], [data-ai-slots] { display: flex; justify-content: center; align-items: center; gap: 0.75rem; }
  .card, .Card, .card-entity, .card-in-hand, .card-slot .card, [data-card] { transform: scale(1.25); transform-origin: center bottom; will-change: transform; }
  .hand, .hand-row, [data-hand] { gap: calc(var(--hand-gap, .5rem) * 1.25); }
  `;
  const tag = document.createElement('style');
  tag.setAttribute('data-acceptance-merge', 'true');
  tag.textContent = css;
  document.head.appendChild(tag);
})();

/* ------------------------------ HUD Overlay ------------------------------ */
(function ensureHUD(){
  if (!document.getElementById('hudOverlay')) {
    const hud = document.createElement('div');
    hud.id = 'hudOverlay';
    hud.className = 'hud-overlay';

    const heart = document.createElement('span');
    heart.id = 'heartIcon';
    heart.className = 'hud-icon';
    heart.setAttribute('title', 'Vitality');
    heart.textContent = '♥';

    const aTemp = document.createElement('span');
    aTemp.id = 'aetherTempIcon';
    aTemp.className = 'hud-icon icon-aether-temp';
    aTemp.setAttribute('title', 'Aether (temporary)');
    aTemp.innerHTML = '<span aria-hidden="true">🜂</span><span class="val">0</span>';

    const aChan = document.createElement('span');
    aChan.id = 'aetherChIcon';
    aChan.className = 'hud-icon icon-aether-channeled';
    aChan.setAttribute('title', 'Channeled Aether');
    aChan.innerHTML = '<span aria-hidden="true">◇</span><span class="val">0</span>';

    hud.appendChild(heart);
    hud.appendChild(aTemp);
    hud.appendChild(aChan);
    document.body.appendChild(hud);
  }
})();

/* ---------------------------- UI Hooks ---------------------------------- */
const UIHooks = (() => {
  const heartEl = () => document.getElementById('heartIcon');
  const toastEl = () => document.getElementById('toast');
  function toast(msg) {
    const el = toastEl();
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1200);
  }
  function pulseHeart(stage) {
    const el = heartEl();
    if (!el) return;
    const cls = stage === 1 ? 'pulse-blue' : 'pulse-red';
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 2000);
  }
  return { toast, pulseHeart };
})();

/* ---------------------------- Acceptance Engine ------------------------- */
const Acceptance = (() => {
  const MARKET_COSTS = [4, 3, 2, 2, 2];
  function ensurePlayerShape(p) {
    return {
      aether: p.aether ?? 0,
      channeledAether: p.channeledAether ?? p.channeled ?? 0,
      hand: Array.isArray(p.hand) ? p.hand : [],
      deck: Array.isArray(p.deck) ? p.deck : [],
      discard: Array.isArray(p.discard) ? p.discard : [],
      hp: p.hp ?? 10,
      tranceStages: p.tranceStages ?? { stage1: 4, stage2: 2 },
      tranceStage: p.tranceStage ?? 0,
      aetherFlow: Array.isArray(p.aetherFlow) ? p.aetherFlow : [{cost:4},{cost:3},{cost:2}],
    };
  }
  function drawOne(player) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      player.deck = player.discard.slice();
      player.discard = [];
      for (let i = player.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
      }
    }
    if (player.deck.length > 0) player.hand.push(player.deck.pop());
  }
  // Start Phase
  function startPhase(game) {
    const pIndex = game.active ?? game.activePlayer ?? 0;
    const player = ensurePlayerShape(game.players[pIndex]);
    player.aether = 0;
    if (player.aetherFlow.length > 0) {
      player.aetherFlow.shift();
      const tail = player.aetherFlow[player.aetherFlow.length - 1];
      const nextCost = Math.max(1, (tail?.cost ?? 2) - 1);
      player.aetherFlow.push({ cost: nextCost });
    }
    const need = Math.max(0, 5 - player.hand.length);
    for (let i = 0; i < need; i++) drawOne(player);
    Object.assign(game.players[pIndex], player);
  }
  // Market
  function getMarketCosts(){ return MARKET_COSTS.slice(); }
  function canAfford(player, cost){
    const p = ensurePlayerShape(player);
    return (p.aether + p.channeledAether) >= cost;
  }
  function payCost(player, cost){
    const p = ensurePlayerShape(player);
    let remain = cost;
    const payA = Math.min(p.aether, remain); p.aether -= payA; remain -= payA;
    if (remain > 0) { const payC = Math.min(p.channeledAether, remain); p.channeledAether -= payC; remain -= payC; }
    Object.assign(player, p);
    return remain === 0;
  }
  function buyFromMarket(game, slotIndex){
    const pIndex = game.active ?? game.activePlayer ?? 0;
    const player = ensurePlayerShape(game.players[pIndex]);
    const costs = getMarketCosts();
    const cost = costs[slotIndex] ?? costs[costs.length - 1];
    if (!canAfford(player, cost)) return { ok:false, reason:'Not enough Aether' };
    if (!payCost(player, cost))   return { ok:false, reason:'Payment failed' };
    let card = null;
    if (game.market && typeof game.market.removeAt === 'function') card = game.market.removeAt(slotIndex);
    if (!card && typeof window.marketRemoveAt === 'function') card = window.marketRemoveAt(slotIndex);
    if (!card) card = { name: 'Card@' + slotIndex, id: 'mk-' + slotIndex + '-' + Date.now(), type: 'Market' };
    player.discard.push(card);
    Object.assign(game.players[pIndex], player);
    return { ok:true, card };
  }
  // Trance
  function checkTrance(game, onStageEnter){
    const pIndex = game.active ?? game.activePlayer ?? 0;
    const player = ensurePlayerShape(game.players[pIndex]);
    const { hp, tranceStages } = player;
    if (player.tranceStage < 1 && hp <= tranceStages.stage1) { player.tranceStage = 1; Object.assign(game.players[pIndex], player); if (onStageEnter) onStageEnter(1); }
    if (player.tranceStage === 1 && hp <= tranceStages.stage2) { player.tranceStage = 2; Object.assign(game.players[pIndex], player); if (onStageEnter) onStageEnter(2); }
  }
  return { startPhase, getMarketCosts, buyFromMarket, checkTrance };
})();

/* ---------------------- Market costs + click hooks ---------------------- */
(function marketWire(){
  const costs = Acceptance.getMarketCosts();
  document.querySelectorAll('[data-market-slot]').forEach((el, i) => {
    const c = el.querySelector('.cost'); if (c) c.textContent = costs[i] ?? costs[costs.length - 1] ?? '';
    el.addEventListener('click', () => {
      try {
        const res = Acceptance.buyFromMarket(window.game, i);
        if (!res.ok) return;
        const t = document.getElementById('toast');
        if (t) { t.textContent = (res.card?.name || 'Card') + ' → Discard'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1100); }
      } catch(e){}
    });
  });
})();

/* -------------------- HUD Value Sync (Aether/Channeled) ------------------ */
(function hudSyncLoop(){
  function readGameState(){
    const g = window.game;
    if (!g || !g.players || !g.players.length) return null;
    const i = g.active ?? g.activePlayer ?? 0;
    return g.players[i] || null;
  }
  function tick(){
    const p = readGameState();
    const tempEl = document.querySelector('#aetherTempIcon .val');
    const chanEl = document.querySelector('#aetherChIcon .val');
    if (p && tempEl && chanEl){
      tempEl.textContent = String(p.aether ?? 0);
      chanEl.textContent = String((p.channeledAether ?? p.channeled) ?? 0);
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

/* ------------------------------- Bootstrap ------------------------------- */
(function boot(){
  const MAX_WAIT_MS = 10000;
  const START = Date.now();
  function wireUp(game){
    if (typeof game.dispatch === 'function') {
      const original = game.dispatch.bind(game);
      game.dispatch = (action) => {
        const result = original(action);
        const type = (action && action.type) || '';
        if (type === 'START_TURN' || type === 'START_PHASE' || type === 'START') {
          Acceptance.startPhase(game);
          Acceptance.checkTrance(game, (stage) => UIHooks.pulseHeart(stage));
        }
        return result;
      };
    }
    Acceptance.startPhase(game);
    Acceptance.checkTrance(game, (stage) => UIHooks.pulseHeart(stage));
    console.log('[Repo‑Merged] Acceptance Part 1 active.');
  }
  (function waitForGame(){
    if (window.game && window.game.players && window.game.players.length) {
      wireUp(window.game);
    } else if (Date.now() - START < MAX_WAIT_MS) {
      setTimeout(waitForGame, 60);
    } else {
      console.warn('[Repo‑Merged] game not detected; bootstrap aborted.');
    }
  })();
})();