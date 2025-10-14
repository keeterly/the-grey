/* =========================================================
   The Grey — v2.57 animation wiring (safe integrator)
   Replace your index.js with this, or merge the WIRING blocks.
   It expects GameLogic to exist and keeps all state there.
   ========================================================= */

import './animations.js'; // make sure this is included after your bundler resolves or via <script>

const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

/* ---------- DOM pointers that are fairly stable in v2.57 ---------- */
const DOM = {
  deck:   $('#hud-deck')    || $('#deckBtn')    || $('[data-role="deck"]')    || $('.hud .btn-deck'),
  discard:$('#hud-discard') || $('#discardBtn') || $('[data-role="discard"]') || $('.hud .btn-discard'),
  flowRow: $('#flow-row')   || $('[data-role="aetherflow"]'),
  hand:    $('.hand')       || $('#hand'),
  endTurn: $('#endTurn')    || $('[data-role="end-turn"]'),
};

/* Safety: if something is missing we still run without crashing */
function elOrNull(x){ return x instanceof Element ? x : null; }

/* ---------- WIRING: Begin turn (draw N with animation) ---------- */
async function doBeginTurn() {
  // Ask GameLogic how many to draw; fallback 5 if missing
  const n = (window.GameLogic?.cardsToDrawStartOfTurn?.() ?? 0);

  for (let i = 0; i < n; i++) {
    // Create a card in logic, get DOM node once in hand
    const card = await window.GameLogic.drawOneToHand(); // should append to hand and return the new .card element
    const cardEl = elOrNull(card?.el || card);           // accept element or wrapper
    await GREY_ANIM.animateDraw(cardEl, elOrNull(DOM.deck), elOrNull(DOM.hand));
  }

  // Optional: flash aether gem under portrait if GameLogic gained aether on draw
  const gem = $('.aether-display');
  if (gem) gem.classList.add('flash'), setTimeout(()=>gem.classList.remove('flash'), 580);
}

/* ---------- WIRING: End turn (discard all hand with animation) ---------- */
async function doEndTurn() {
  const handCards = $$('.hand .card');
  for (const card of handCards) {
    await GREY_ANIM.animateDiscard(card, elOrNull(DOM.discard));
    window.GameLogic?.discardCardFromHand?.(card); // remove from state/DOM after flight
  }
  // Pass priority to AI (your logic)
  await window.GameLogic?.aiTurn?.();
  // Start next player turn
  await doBeginTurn();
}

/* ---------- WIRING: Aetherflow (river) operations ---------- */
function setupAetherflowObservers(){
  if (!DOM.flowRow) return;

  // 1) Reveal animation when a new card node is inserted in flow-row
  const obs = new MutationObserver(muts=>{
    for (const m of muts) {
      m.addedNodes.forEach(node=>{
        if (!(node instanceof Element)) return;
        if (node.classList.contains('flow-card') || node.matches('.flow-card .card, .market-card, .flow .card')) {
          GREY_ANIM.animateFlowReveal(node.classList.contains('card') ? node : node.querySelector('.card') || node);
        }
      });
      m.removedNodes.forEach(node=>{
        if (!(node instanceof Element)) return;
        // falloff only for removals from the right-most slot:
        if (m.target === DOM.flowRow) {
          const before = $$('.flow-card, .market-card', DOM.flowRow);
          if (!before.length) return;
          // if the removed element had been the last column, play falloff from a clone of the last before removal
          GREY_ANIM.animateFlowFalloff(node.querySelector('.card') || node);
        }
      });
    }
  });
  obs.observe(DOM.flowRow, {childList:true, subtree:false});
}

/* ---------- WIRING: Buy from aetherflow → spotlight → discard ---------- */
/* Expect GameLogic to call this when a card is purchased */
window.onAetherflowBuy = async function(cardEl){
  await GREY_ANIM.animateBuyToDiscard(cardEl, elOrNull(DOM.discard));
  window.GameLogic?.moveFlowCardToDiscard?.(cardEl);
};

/* ---------- Hook End Turn button ---------- */
function wireEndTurn(){
  if(!DOM.endTurn) return;
  DOM.endTurn.addEventListener('click', async ()=>{
    await doEndTurn();
  });
}

/* ---------- Init ---------- */
async function init(){
  setupAetherflowObservers();
  wireEndTurn();

  // If your GameLogic exposes a turn lifecycle, attach:
  if (window.GameLogic?.on) {
    window.GameLogic.on('turn:begin', doBeginTurn);
    window.GameLogic.on('turn:end',   doEndTurn);
    window.GameLogic.on('flow:buy',   window.onAetherflowBuy);
  } else {
    // Fallback: just kick a first draw
    await doBeginTurn();
  }
}

document.addEventListener('DOMContentLoaded', init);