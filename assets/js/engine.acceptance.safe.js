// assets/js/engine.acceptance.safe.js
// Safe, additive acceptance mechanics (no DOM/layout changes).

export const MARKET_COSTS = [4,3,2,2,2];

function ensurePlayerShape(p){
  return {
    aether: p.aether ?? 0,
    channeledAether: p.channeledAether ?? p.channeled ?? 0,
    hand: Array.isArray(p.hand) ? p.hand : [],
    deck: Array.isArray(p.deck) ? p.deck : [],
    discard: Array.isArray(p.discard) ? p.discard : [],
    hp: p.hp ?? 10,
    tranceStages: p.tranceStages ?? { stage1:4, stage2:2 },
    tranceStage: p.tranceStage ?? 0,
    aetherFlow: Array.isArray(p.aetherFlow) ? p.aetherFlow : [{cost:4},{cost:3},{cost:2}],
  };
}

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function drawOne(player){
  if (player.deck.length === 0 && player.discard.length > 0) {
    player.deck = player.discard.slice();
    player.discard = [];
    shuffle(player.deck);
  }
  if (player.deck.length > 0) player.hand.push(player.deck.pop());
}

// Start Phase: 🜂=0, ◇ preserved, Aether Flow drift, draw-to-5
export function startPhase(game){
  const idx = game.active ?? game.activePlayer ?? 0;
  const player = ensurePlayerShape(game.players[idx]);
  player.aether = 0;
  if (player.aetherFlow.length > 0){
    player.aetherFlow.shift();
    const tail = player.aetherFlow[player.aetherFlow.length - 1];
    const nextCost = Math.max(1, (tail?.cost ?? 2) - 1);
    player.aetherFlow.push({ cost: nextCost });
  }
  const need = Math.max(0, 5 - player.hand.length);
  for (let i = 0; i < need; i++) drawOne(player);
  Object.assign(game.players[idx], player);
}

// Market helpers
export function getMarketCosts(){ return MARKET_COSTS.slice(); }
export function canAfford(player, cost){
  const p = ensurePlayerShape(player);
  return (p.aether + p.channeledAether) >= cost;
}
export function payCost(player, cost){
  const p = ensurePlayerShape(player);
  let remain = cost;
  const payA = Math.min(p.aether, remain); p.aether -= payA; remain -= payA;
  if (remain > 0){ const payC = Math.min(p.channeledAether, remain); p.channeledAether -= payC; remain -= payC; }
  Object.assign(player, p);
  return remain === 0;
}
export function buyFromMarket(game, slotIndex){
  const idx = game.active ?? game.activePlayer ?? 0;
  const player = ensurePlayerShape(game.players[idx]);
  const costs = getMarketCosts();
  const cost = costs[slotIndex] ?? costs[costs.length - 1];
  if (!canAfford(player, cost)) return { ok:false, reason:'Not enough Aether' };
  if (!payCost(player, cost))   return { ok:false, reason:'Payment failed' };
  let card = null;
  if (game.market && typeof game.market.removeAt === 'function') card = game.market.removeAt(slotIndex);
  if (!card && typeof window.marketRemoveAt === 'function') card = window.marketRemoveAt(slotIndex);
  if (!card) card = { name:'Card@'+slotIndex, id:'mk-'+slotIndex+'-'+Date.now(), type:'Market' };
  player.discard.push(card);
  Object.assign(game.players[idx], player);
  return { ok:true, card };
}

// Trance thresholds
export function checkTrance(game, onStageEnter){
  const idx = game.active ?? game.activePlayer ?? 0;
  const player = ensurePlayerShape(game.players[idx]);
  const { hp, tranceStages } = player;
  if (player.tranceStage < 1 && hp <= tranceStages.stage1){
    player.tranceStage = 1; Object.assign(game.players[idx], player);
    if (onStageEnter) onStageEnter(1);
  }
  if (player.tranceStage === 1 && hp <= tranceStages.stage2){
    player.tranceStage = 2; Object.assign(game.players[idx], player);
    if (onStageEnter) onStageEnter(2);
  }
}