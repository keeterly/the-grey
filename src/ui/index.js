// src/ui/index.js
// Animated UI entry: never import engine here.

import { cacheRoots, setGame, renderAll, Roots } from './render.js';
import { fanOutHand, animateDrawHand, animateDiscardHand, animateBuyHeroToDiscard, animatePlayToSlot } from './animations.js';

const $ = (s, r=document) => r.querySelector(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let G = null;

function S(){
  const s = G?.state || {};
  s.deck     = Array.isArray(s.deck)    ? s.deck    : [];
  s.disc     = Array.isArray(s.disc)    ? s.disc    : [];
  s.hand     = Array.isArray(s.hand)    ? s.hand    : [];
  s.glyphs   = Array.isArray(s.glyphs)  ? s.glyphs  : [];
  s.flowRow  = Array.isArray(s.flowRow) ? s.flowRow : [null,null,null,null,null];
  s.slots    = Array.isArray(s.slots)   ? s.slots   : [null,null,null];
  s.ai       = typeof s.ai==='object'   ? s.ai      : { slots:[null,null,null] };
  s.ai.slots = Array.isArray(s.ai.slots)? s.ai.slots: [null,null,null];
  return s;
}

function refreshUI(){
  renderAll({
    onBuy: handleBuyFlow,
    onPlayFromHand: handlePlayFromHand,
    onAdvance: handleAdvance,
  });
  fanOutHand(Roots.ribbon);
}

function handleBuyFlow(i, cardEl){
  const discChip = $('#chipDiscard');
  animateBuyHeroToDiscard(cardEl, discChip).then(()=>{
    G.dispatch({ type:'BUY_FLOW', index:i });
    refreshUI();
  });
}

function handlePlayFromHand(card, handIndex, cardEl){
  if (card.t === 'Instant'){
    G.dispatch({ type:'CHANNEL_FROM_HAND', index: handIndex });
    refreshUI();
    return;
  }
  if (card.t === 'Glyph'){
    G.dispatch({ type:'PLAY_FROM_HAND', index: handIndex, slot: null });
    refreshUI();
    return;
  }
  const st = S();
  const s = st.slots.findIndex(x => !x);
  const targetSlotEl = $('#playerSlots')?.children?.[s] || null;
  if (targetSlotEl) {
    animatePlayToSlot(cardEl, targetSlotEl).then(()=>{
      G.dispatch({ type:'PLAY_FROM_HAND', index: handIndex, slot: s });
      refreshUI();
    });
  } else {
    G.dispatch({ type:'PLAY_FROM_HAND', index: handIndex, slot: null });
    refreshUI();
  }
}

function handleAdvance(slotIndex){
  G.dispatch({ type:'ADVANCE', slot: slotIndex });
  refreshUI();
}

async function runAiTurn(){
  const step = 80;
  G.dispatch({ type:'AI_DRAW'       }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_PLAY_SPELL' }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_CHANNEL'    }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_ADVANCE'    }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_BUY'        }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_SPEND_TRANCE'}); refreshUI(); await sleep(step);
}

function wireButtons(){
  const btnDraw  = document.querySelector('#btnDraw, #fabDraw');
  const btnEnd   = document.querySelector('#btnEnd, #fabEnd');
  const btnReset = document.querySelector('#btnReset, #fabReset');
  const chipDeck = $('#chipDeck');
  const chipDisc = $('#chipDiscard');

  if (btnDraw) btnDraw.onclick = async () => {
    G.dispatch({ type:'DRAW' });
    refreshUI();
    await animateDrawHand(Roots.ribbon, chipDeck);
  };

  if (btnEnd) btnEnd.onclick = async () => {
    await animateDiscardHand(Roots.ribbon, chipDisc);
    G.dispatch({ type:'END_TURN' });
    refreshUI();

    await runAiTurn();

    G.dispatch({ type:'START_TURN' });
    refreshUI();
    await animateDrawHand(Roots.ribbon, chipDeck);
  };

  if (btnReset) btnReset.onclick = () => {
    if (typeof G.reset === 'function') G.reset();
    refreshUI();
  };

  if (chipDeck) chipDeck.onclick = () => console.log('[Deck]', S().deck);
  if (chipDisc) chipDisc.onclick = () => console.log('[Discard]', S().disc);
}

export function init(game){
  G = game;
  setGame(G);
  cacheRoots();
  wireButtons();
  refreshUI();

  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  if (window.DragCards?.refresh) window.DragCards.refresh();

  console.log('[UI] v3.9+ — animations restored, typed highlights, fixed rows');
}
