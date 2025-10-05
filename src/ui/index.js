// =========================================================
/* THE GREY — UI entry (animated version) */
// - Uses render.js (DOM) + animations.js (MTG-like motion)
// - Keeps typed highlights & drop-targets
// - Wires Draw / End Turn / Reset
// - Buy animation: hero pose then fly to discard
// =========================================================

import { cacheRoots, setGame, renderAll, renderCounts, makeCardEl, Roots } from './render.js';
import { fanOutHand, animateDrawHand, animateDiscardHand, animateBuyHeroToDiscard, animatePlayToSlot } from './animations.js';

const $  = (s, r=document) => r.querySelector(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let G = null;

/* Safe state view */
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

/* Re-render + pose hand each time */
function refreshUI(){
  renderAll({
    onBuy: handleBuyFlow,
    onPlayFromHand: handlePlayFromHand,
    onAdvance: handleAdvance,
  });
  fanOutHand(Roots.ribbon);
}

/* Actions -> UI hooks */
function handleBuyFlow(i, cardEl){
  if (!G?.dispatch) return;
  const discChip = $('#chipDiscard');
  // play hero->discard animation first, then dispatch buy
  animateBuyHeroToDiscard(cardEl, discChip).then(() => {
    G.dispatch({ type:'BUY_FLOW', index:i });
    refreshUI();
  });
}

function handlePlayFromHand(card, handIndex, cardEl){
  if (!G?.dispatch) return;
  // decide default slot (spell) or glyph tray
  const st = S();
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
  if (!G?.dispatch) return;
  G.dispatch({ type:'ADVANCE', slot: slotIndex });
  refreshUI();
}

/* Simple AI turn */
async function runAiTurn(){
  if (!G?.dispatch) return;
  const step = 80;

  G.dispatch({ type:'AI_DRAW'     }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_PLAY_SPELL'}); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_CHANNEL'  }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_ADVANCE'  }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_BUY'      }); refreshUI(); await sleep(step);
  G.dispatch({ type:'AI_SPEND_TRANCE'}); refreshUI(); await sleep(step);
}

/* Button wiring */
function wireButtons(){
  const btnDraw  = $('#btnDraw');
  const btnEnd   = $('#btnEnd');
  const btnReset = $('#btnReset');
  const chipDeck = $('#chipDeck');
  const chipDisc = $('#chipDiscard');

  if (btnDraw) btnDraw.onclick = async () => {
    if (!G?.dispatch) return;
    // engine draw, then animate visual reinforcement
    G.dispatch({ type:'DRAW' });
    refreshUI();
    await animateDrawHand(Roots.ribbon, chipDeck);
  };

  if (btnEnd) btnEnd.onclick = async () => {
    if (!G?.dispatch) return;
    // discard animation -> engine END_TURN
    await animateDiscardHand(Roots.ribbon, chipDisc);
    G.dispatch({ type:'END_TURN' });
    refreshUI();

    await runAiTurn();

    // Start next player turn with draw animation
    G.dispatch({ type:'START_TURN' });
    refreshUI();
    await animateDrawHand(Roots.ribbon, chipDeck);
  };

  if (btnReset) btnReset.onclick = () => {
    if (typeof G.reset === 'function') {
      G.reset();
    } else if (window.GameEngine?.create) {
      window.game = G = window.GameEngine.create();
      setGame(G);
    }
    refreshUI();
  };

  // Stubs for deck/discard modals if you have them elsewhere
  if (chipDeck) chipDeck.onclick = () => console.log('[Deck]', S().deck);
  if (chipDisc) chipDisc.onclick = () => console.log('[Discard]', S().disc);
}

/* Public init */
export function init(game){
  G = game;
  setGame(G);
  cacheRoots();
  wireButtons();
  refreshUI();

  // hide boot-check if present
  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  // Let drag.js know we’re ready
  if (window.DragCards?.refresh) window.DragCards.refresh();

  console.log('[UI] v3.9+ — animations restored, typed highlights, fixed rows');
}

  // TEMP: seed some test cards if state is empty
  if (!G.state.hand?.length) {
    G.state.hand = [
      { id:'h1', n:'Apprentice Bolt', t:'Spell', v:1, p:1, txt:'Deal 1.' },
      { id:'h2', n:'Mirror Ward', t:'Glyph', v:0, p:1, txt:'Reflect next damage (sim).' },
      { id:'h3', n:'Kindle', t:'Spell', v:1, p:2, txt:'On resolve: +1⚡.' },
      { id:'h4', n:'Meditate', t:'Instant', v:1, p:1, txt:'+1⚡ (or play).' }
    ];
    G.state.flowRow = [
      { id:'f1', n:'Ember', t:'Spell', v:0, p:1, txt:'Deal 2.' },
      null,null,null,null
    ];
    G.state.slots = [null,null,null];
    G.state.deck = [{n:'Test Draw'}, {n:'Apprentice Bolt'}];
    G.state.disc = [];
  }

