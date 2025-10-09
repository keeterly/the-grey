/* =======================================================================
   The Grey — Acceptance Checklist (Part 1) bootstrap
   Drop-in file — replace /assets/js/boot-debug.js with this file.
   Implements:
     • Start Phase: 🜂=0, ◇ preserved, Aether Flow drifts, draw-to-5
     • Market: slot costs (4/3/2/2/2); pay 🜂 then ◇; bought → Discard
     • Trance: thresholds per weaver; heart pulses on entering Stage I/II
   ======================================================================= */

(function injectAcceptanceCSS(){
  const css = `
  .pulse-blue { animation: pulseBlue 1.25s ease-in-out 2; }
  .pulse-red  { animation: pulseRed  1.25s ease-in-out 2; }
  @keyframes pulseBlue {
    0%,100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(0,255,255,.6)); }
    50%     { transform: scale(1.18); filter: drop-shadow(0 0 14px rgba(0,255,255,.9)); }
  }
  @keyframes pulseRed {
    0%,100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(220,20,60,.6)); }
    50%     { transform: scale(1.18); filter: drop-shadow(0 0 14px rgba(220,20,60,.9)); }
  }`;
  const tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);
})();

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
  function renderMarketCosts(costs) {
    const slots = document.querySelectorAll('[data-market-slot]');
    if (!slots.length) return;
    [...slots].forEach((slot, i) => {
      const costEl = slot.querySelector('.cost');
      if (costEl) costEl.textContent = costs[i] ?? costs[costs.length - 1] ?? '';
    });
  }
  return { toast, pulseHeart, renderMarketCosts };
})();

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
    if (player.deck.length > 0) {
      player.hand.push(player.deck.pop());
    }
  }
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
  function getMarketCosts() { return MARKET_COSTS.slice(); }
  function canAfford(player, cost) {
    const p = ensurePlayerShape(player);
    return (p.aether + p.channeledAether) >= cost;
  }
  function payCost(player, cost) {
    const p = ensurePlayerShape(player);
    let remain = cost;
    const payA = Math.min(p.aether, remain);
    p.aether -= payA; remain -= payA;
    if (remain > 0) {
      const payC = Math.min(p.channeledAether, remain);
      p.channeledAether -= payC; remain -= payC;
    }
    Object.assign(player, p);
    return remain === 0;
  }
  function buyFromMarket(game, slotIndex) {
    const pIndex = game.active ?? game.activePlayer ?? 0;
    const player = ensurePlayerShape(game.players[pIndex]);
    const costs = getMarketCosts();
    const cost = costs[slotIndex] ?? costs[costs.length - 1];
    if (!canAfford(player, cost)) return { ok:false, reason:'Not enough Aether' };
    if (!payCost(player, cost))   return { ok:false, reason:'Payment failed' };
    let card = null;
    if (game.market && typeof game.market.removeAt === 'function') {
      card = game.market.removeAt(slotIndex);
    }
    if (!card && typeof window.marketRemoveAt === 'function') {
      card = window.marketRemoveAt(slotIndex);
    }
    if (!card) {
      card = { name: 'Card@' + slotIndex, id: 'mk-' + slotIndex + '-' + Date.now(), type: 'Market' };
      console.warn('[Acceptance] placeholder card used:', card);
    }
    player.discard.push(card);
    Object.assign(game.players[pIndex], player);
    return { ok:true, card };
  }
  function checkTrance(game, onStageEnter) {
    const pIndex = game.active ?? game.activePlayer ?? 0;
    const player = ensurePlayerShape(game.players[pIndex]);
    const { hp, tranceStages } = player;
    if (player.tranceStage < 1 && hp <= tranceStages.stage1) {
      player.tranceStage = 1;
      Object.assign(game.players[pIndex], player);
      if (onStageEnter) onStageEnter(1);
    }
    if (player.tranceStage === 1 && hp <= tranceStages.stage2) {
      player.tranceStage = 2;
      Object.assign(game.players[pIndex], player);
      if (onStageEnter) onStageEnter(2);
    }
  }
  return { startPhase, getMarketCosts, buyFromMarket, checkTrance };
})();

(function bootAcceptancePart1(){
  const MAX_WAIT_MS = 10000;
  const START = Date.now();
  const tick = () => {
    if (window.game && window.game.players && window.game.players.length) {
      wireUp(window.game);
    } else if (Date.now() - START < MAX_WAIT_MS) {
      setTimeout(tick, 60);
    } else {
      console.warn('[Acceptance] game not detected; bootstrap aborted.');
    }
  };
  function wireUp(game) {
    window.AcceptancePart1 = { ...Acceptance };
    UIHooks.renderMarketCosts(Acceptance.getMarketCosts());
    const slots = document.querySelectorAll('[data-market-slot]');
    [...slots].forEach((el, i) => {
      el.addEventListener('click', () => {
        const res = Acceptance.buyFromMarket(game, i);
        if (!res.ok) { UIHooks.toast(res.reason || 'Cannot buy'); return; }
        UIHooks.toast(`${res.card?.name || 'Card'} → Discard`);
        const rerender = window.rerenderMarketSlot || window.renderMarketSlot;
        if (typeof rerender === 'function') { try { rerender(i); } catch (e) {} }
      });
    });
    if (typeof game.dispatch === 'function') {
      const original = game.dispatch.bind(game);
      game.dispatch = (action) => {
        const result = original(action);
        const type = (action && action.type) || '';
        if (type === 'START_TURN' || type === 'START_PHASE' || type === 'START') {
          Acceptance.startPhase(game);
          Acceptance.checkTrance(game, (stage) => {
            UIHooks.pulseHeart(stage);
            UIHooks.toast(stage === 1 ? 'Trance I awakened' : 'Trance II awakened');
          });
        }
        return result;
      };
    }
    Acceptance.startPhase(game);
    Acceptance.checkTrance(game, (stage) => {
      UIHooks.pulseHeart(stage);
      UIHooks.toast(stage === 1 ? 'Trance I awakened' : 'Trance II awakened');
    });
    console.log('[Acceptance] Part 1 wired.');
  }
  tick();
})();