// GameLogic.js
// v2.61 (v2.57 base + spotlight reveal + discard-for-Aether + non-destructive enrich events)

/////////////////////////////
// Constants & Helpers
/////////////////////////////

export const FLOW_COSTS = [4, 3, 2, 2, 2];
export const STARTING_HAND = 5;
export const STARTING_VITALITY = 5;

export const AE_GEM_SVG =
  '<svg class="gem-inline" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M12 2l6 6-6 14-6-14 6-6z" fill="currentColor"/></svg>';

export function withAetherText(s = "") {
  return String(s).replaceAll("Æ", AE_GEM_SVG);
}

function otherSide(side){ return side === "player" ? "ai" : "player"; }

function pushEvt(state, evt){
  (state._events || (state._events = [])).push(evt);
  return state;
}

export function drainEvents(state){
  const q = state._events || [];
  state._events = [];
  return q;
}

function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }



// Split a total cost across p pips, biasing later pips slightly.
// Example: cost=5, pip=2 -> [2,3]; cost=3, pip=3 -> [1,1,1]
function computePipAdvanceCostsForCard(card) {
  const p = Math.max(1, card.pip | 0);
  const total = Math.max(0, card.cost | 0);
  const base = Math.floor(total / p);
  const extra = total % p; // distribute +1 to the rightmost `extra` pips
  const arr = Array.from({ length: p }, (_, i) =>
    base + (i >= (p - extra) ? 1 : 0)
  );
  return arr;
}




/////////////////////////////
// Card Pools (Data)
/////////////////////////////

/**
 * v2.66 Card Pools — from Game Doc
 * NOTE: Some effects in the doc aren’t yet supported by the parser.
 * I’ve aligned text to current grammar where possible:
 *  - “Gain N Æ”      → aether gain
 *  - “Channel N”     → adds Æ + triggers “When you Channel Aether…” glyphs
 *  - “Draw N”        → draw
 *  - “Advance another/target Spell 1” → advance
 */

// =============================================
// BASE DECK — v2 Strategic Aggression Update
// =============================================

const BASE_DECK_LIST = [
  {
    name: "Pulse of the Grey",
    type: "SPELL",
    pip: 1,
    playCost: 0,
    stepCost: 1,
    cost: 1,
    text: "On Resolve: Draw 1, Gain 1 Æ",
    aetherValue: 0,
    role: "Starter draw/flow",
    qty: 1,
  },
  {
    name: "Wispform Surge",
    type: "SPELL",
    pip: 1,
    playCost: 0,
    stepCost: 1,
    cost: 1,
    text: "On Resolve: Advance another Spell 1 step",
    aetherValue: 0,
    role: "Chain activator",
    qty: 1,
  },
  {
    name: "Greyfire Bloom",
    type: "SPELL",
    pip: 2,
    playCost: 0,
    stepCost: 1,
    cost: 1,
    text: "On Resolve: Deal 1 damage per step (max 2)",
    aetherValue: 0,
    role: "Early offense",
    qty: 1,
  },
  {
    name: "Echoing Reservoir",
    type: "SPELL",
    pip: 1,
    playCost: 2,
    stepCost: 0,
    cost: 2,
    text: "On Resolve: Store 1 in Aetherwell",
    aetherValue: 2,
    role: "Energy storage",
    qty: 1,
  },
  {
    name: "Dormant Catalyst",
    type: "SPELL",
    pip: 1,
    playCost: 2,
    stepCost: 0,
    cost: 2,
    text: "On Resolve: Store 2 in Aetherwell",
    aetherValue: 1,
    role: "Aether ramp",
    qty: 1,
  },
  {
    name: "Ashen Focus",
    type: "SPELL",
    pip: 2,
    playCost: 0,
    stepCost: 1,
    cost: 1,
    text: "On Resolve: Draw 1, Store 1 in Aetherwell",
    aetherValue: 1,
    role: "Draw + ramp hybrid",
    qty: 1,
  },
  {
    name: "Surge of Ash",
    type: "INSTANT",
    pip: 0,
    playCost: 1,
    stepCost: 0,
    cost: 1,
    text: "Target Spell advances 1 step",
    aetherValue: 0,
    role: "Tempo accelerator",
    qty: 1,
  },
  {
    name: "Veil of Dust",
    type: "INSTANT",
    pip: 0,
    playCost: 1,
    stepCost: 0,
    cost: 1,
    text: "Prevent 1 damage or deal 1 damage",
    aetherValue: 0,
    role: "Defense / chip offense",
    qty: 1,
  },
  {
    name: "Glyph of Remnant Light",
    type: "GLYPH",
    pip: 0,
    playCost: 0,
    stepCost: 0,
    cost: 0,
    text: "When a Spell resolves → Gain 1 Channelled Aether",
    aetherValue: 0,
    role: "Resource glyph",
    qty: 1,
  },
  {
    name: "Glyph of Returning Echo",
    type: "GLYPH",
    pip: 0,
    playCost: 0,
    stepCost: 0,
    cost: 0,
    text: "When you Store Aether → Draw 1 card",
    aetherValue: 0,
    role: "Draw glyph",
    qty: 1,
  },
];



// ===== Aetherflow Deck (v2 — Harmonized Progression Pool) =====
const AETHERFLOW_LIST = [
  // Instants — pay to cast
  { name: "Surge of Cinders",  type: "INSTANT", pip: 0, playCost: 2, stepCost: 0, cost: 2, aetherValue: 0,
    text: "Deal 2 damage to any target.", role: "Burn", qty: 1 },

  { name: "Pulse Feedback",    type: "INSTANT", pip: 0, playCost: 3, stepCost: 0, cost: 3, aetherValue: 0,
    text: "Deal 1 damage and gain 1 Æ.", role: "Utility", qty: 1 },

  { name: "Refracted Will",    type: "INSTANT", pip: 0, playCost: 2, stepCost: 0, cost: 2, aetherValue: 0,
    text: "Cancel a Spell or Instant. Draw 1.", role: "Utility", qty: 1 },

  { name: "Aether Impel",      type: "INSTANT", pip: 0, playCost: 4, stepCost: 0, cost: 4, aetherValue: 0,
    text: "Advance all your active Spells 1 step.", role: "Ramp", qty: 1 },

  { name: "Cascade Insight",   type: "INSTANT", pip: 0, playCost: 3, stepCost: 0, cost: 3, aetherValue: 0,
    text: "Draw 2 cards, then discard 1.", role: "Utility", qty: 1 },

  // Spells — some pay to play, some pay per step
  { name: "Resonant Chorus",   type: "SPELL",   pip: 1, playCost: 0, stepCost: 2, cost: 0, aetherValue: 1,
    text: "On Resolve: Gain 2 Æ and Channel 1.", role: "Ramp", qty: 1 },

  { name: "Emberline Pulse",   type: "SPELL",   pip: 1, playCost: 2, stepCost: 0, cost: 2, aetherValue: 0,
    text: "On Resolve: Deal 1 damage and Draw 1.", role: "Burn", qty: 1 },

  { name: "Fractured Memory",  type: "SPELL",   pip: 2, playCost: 0, stepCost: 1, cost: 0, aetherValue: 0,
    text: "On Resolve: Draw 2 cards.", role: "Utility", qty: 1 },

  { name: "Obsidian Vault",    type: "SPELL",   pip: 1, playCost: 3, stepCost: 0, cost: 3, aetherValue: 1,
    text: "On Resolve: Channel 2 and gain 1 Æ.", role: "Ramp", qty: 1 },

  { name: "Mirror Cascade",    type: "SPELL",   pip: 2, playCost: 0, stepCost: 2, cost: 0, aetherValue: 0,
    text: "On Resolve: Copy your next Instant or Spell resolve effect.", role: "Utility", qty: 1 },

  { name: "Sanguine Flow",     type: "SPELL",   pip: 1, playCost: 2, stepCost: 0, cost: 2, aetherValue: 0,
    text: "On Resolve: Gain 3 Æ, lose 1 Vitality.", role: "Burn / Ramp", qty: 1 },

  { name: "Echoflame Sigil",   type: "SPELL",   pip: 2, playCost: 0, stepCost: 1, cost: 0, aetherValue: 1,
    text: "On Resolve: Return 1 card from your discard pile to your hand.", role: "Recursion", qty: 1 },

  // Glyphs — no play cost
  { name: "Glyph of Withering Light", type: "GLYPH", pip: 0, playCost: 0, stepCost: 0, cost: 0, aetherValue: 0,
    text: "When an opponent resolves a Spell → Deal 1 damage.", role: "Burn", qty: 1 },

  { name: "Glyph of Buried Heat",     type: "GLYPH", pip: 0, playCost: 0, stepCost: 0, cost: 0, aetherValue: 0,
    text: "When you take damage → Channel 2.", role: "Ramp / Defense", qty: 1 },

  { name: "Glyph of Soulglass",       type: "GLYPH", pip: 0, playCost: 0, stepCost: 0, cost: 0, aetherValue: 0,
    text: "When you draw outside your Draw Step → Gain 1 Æ.", role: "Utility", qty: 1 },
];



function expandList(list) {
  const out = [];
  list.forEach(c => {
    for (let i = 0; i < (c.qty || 1); i++) {
      const proto = {
        id: uid(),
        name: c.name,
        type: c.type,
        cost: c.cost || 0,
        pip:  c.pip  || 0,
        text: c.text || "",
        aetherValue: c.aetherValue || 0,
        role: c.role || "",
        price: c.cost || 0,
        progress: 0,
      };
      // ← NEW: per-pip costs live on the card
      proto.pipCosts = computePipAdvanceCostsForCard(proto);
      out.push(proto);
    }
  });
  return out;
}


/////////////////////////////
// State init / serialization
/////////////////////////////

export function initState(seed) {
  const playerDeck = shuffle(expandList(BASE_DECK_LIST));
  const aiDeck     = shuffle(expandList(BASE_DECK_LIST));
  const flowDraw   = shuffle(expandList(AETHERFLOW_LIST));

  const handP = [];
  const handAI = [];
  for (let i = 0; i < STARTING_HAND && playerDeck.length; i++) handP.push(playerDeck.shift());
  for (let i = 0; i < STARTING_HAND && aiDeck.length; i++)     handAI.push(aiDeck.shift());

  // Start with an empty 5-slot rail
  const flow = [null, null, null, null, null];

  let state = {
    turn: 1,
    activePlayer: "player",
    flow,
    flowDraw,
    _events: [],
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deck: playerDeck, hand: handP, discard: [],
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { isGlyph:true, hasCard:false, card:null },
        ],
        weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"./weaver_aria_Portrait.jpg" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deck: aiDeck, hand: handAI, discard: [],
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { isGlyph:true, hasCard:false, card:null },
        ],
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"./weaver_morr_Portrait.jpg" },
      }
    }
  };

  // Fill Aetherflow with 5 cards on boot
  state = initialFillFlow(state);
  return state;
}


function initialFillFlow(state) {
  state.flow ||= [null, null, null, null, null];
  const pool = state.flowDraw || [];
  for (let i = 0; i < 5 && pool.length; i++) {
    const c = { ...pool.shift() };
    state.flow[i] = c;
    (state._events ||= []).push({
      t: 'reveal',
      source: 'flow',
      side: state.activePlayer,
      flowIndex: i,
      cardId: c.id,
      cardType: c.type,
      cardData: { ...c }
    });
  }
  return state;
}


export function serializePublic(state) {
 const s = clone(state);

  // Aetherflow: publish slot prices
  s.flow = (s.flow || []).map((c, idx) => c ? ({ ...c, price: FLOW_COSTS[idx] }) : null);

  // Deck/discard counts only
  s.players.player.deckCount    = s.players.player.deck.length;
  s.players.player.discardCount = s.players.player.discard.length;
  s.players.ai.deckCount        = s.players.ai.deck.length;
  s.players.ai.discardCount     = s.players.ai.discard.length;

  // Compute canAdvance for player's spell slots (used by UI to control pip pulse/click)
  const me = s.players.player;
  for (let i = 0; i < (me.slots?.length || 0); i++) {
    const slot = me.slots[i];
    const c = slot?.card;
     if (slot?.hasCard && c?.type === "SPELL") {
      const notSameTurn      = c._enteredTurn !== s.turn;           // paid cannot on placement turn
      const notPaidThisTurn  = c._paidAdvancedTurn !== s.turn;      // only one paid advance per turn
      const notComplete      = ((c.progress|0) < (c.pip|0));
      const stepCost         = Number(c.stepCost ?? c.cost ?? 0);
      const affordable       = (((me.aether|0)+(me.tempAether|0)) >= stepCost);
      slot.canAdvance = notSameTurn && notPaidThisTurn && notComplete && affordable;
    } else if (slot) {
      slot.canAdvance = false;
    }
  }

  // (We intentionally do NOT expose canAdvance for the AI slots.)
  return s;
}


// --- Aetherflow: compact gaps, shift right by one, reveal one ---
function slideFlowRightOnceAndReveal(state) {
  state.flow ||= [null, null, null, null, null];
  state._events ||= [];

  const before = (state.flow || []).map(c => c ? { id: c.id } : null);

  // Did we have a card in the rightmost slot BEFORE the move?
  const hadRightmost = !!before[4];

  // Survivors in order (remove holes)
  const survivors = (state.flow || []).filter(Boolean);

  // Build the next rail: reserve index 0 for the new reveal,
  // place survivors starting at index 1 (keeping order).
  const next = [null, null, null, null, null];
  for (let i = 0; i < Math.min(4, survivors.length); i++) {
    next[i + 1] = survivors[i];
  }

  // Reveal a single new card into index 0
  const pool = state.flowDraw || [];
  const newCard = pool.length ? { ...pool.shift() } : null;
  next[0] = newCard;

  // Commit
  state.flow = next;

  // Emit falloff if there *was* a card in index 4 before the shift
  if (hadRightmost) {
    // Find which card fell off: it’s the rightmost in the old rail
    // that wasn’t bought, i.e., before[4]’s id (if any)
    const fell = before[4];
    if (fell) {
      state._events.push({
        t: 'resolved',
        source: 'flow-falloff',
        side: state.activePlayer,
        cardData: { id: fell.id }   // enough for UI to animate/log
      });
    }
  }

  // Slide description for animation
  const after = (state.flow || []).map(c => c ? { id: c.id } : null);
  state._events.push({
    t: 'flow_slide',
    source: 'flow',
    side: state.activePlayer,
    before,
    after
  });

  // Spotlight the newly revealed card
  if (newCard) {
    state._events.push({
      t: 'reveal',
      source: 'flow',
      side: state.activePlayer,
      flowIndex: 0,
      cardId: newCard.id,
      cardType: newCard.type,
      cardData: { ...newCard }
    });
  }

  return state;
}



/////////////////////////////
// Turn / Flow mechanics
/////////////////////////////

export function startTurn(state) {
  return state; // no flow movement here anymore
}


export function endTurn(state) {
  if (!state?.flow) return state;

  const endingPlayer = state.activePlayer;
  const P = state.players[endingPlayer];

  // discard remaining cards
  if (P?.hand?.length){
    while (P.hand.length) {
      const c = P.hand.shift();
      P.discard.push(c);
      pushEvt(state, {
        t: "resolved",
        source: "hand-discard",
        side: endingPlayer,
        cardId: c.id,
        cardType: c.type,
        cardData: { ...c }
      });
    }
  }

  // 👉 Flow slides right and reveals a new card ONLY when AI ends its turn
  if (endingPlayer === 'ai') {
    state = compactSlideRightAndReveal(state);
  }

  // pass turn
  state.activePlayer = (state.activePlayer === "player") ? "ai" : "player";
  if (state.activePlayer === "player") state.turn += 1;

  // no auto-move at start of turn anymore
  startTurn(state);
  return state;
}



/////////////////////////////
// Player actions + resolve
/////////////////////////////

export function discardForAether(state, playerId, cardId){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  const idx = P.hand.findIndex(c => c.id === cardId);
  if (idx < 0) throw new Error("card not in hand");
  const card = P.hand[idx];
  P.hand.splice(idx, 1);
  P.discard.push(card);

  const gain = Number(card.aetherValue || 0);
  if (gain > 0){
    P.aether = (P.aether || 0) + gain;
    state = applyGlyphPassives(state, playerId, "discardForAe");
    state = applyGlyphPassives(state, playerId, "channel");
    pushEvt(state, { t: "aether", side: playerId, amount: gain, by: card.id });
  }

  pushEvt(state, {
    t: "resolved",
    source: "discard-aether",
    side: playerId,
    cardId: card.id,
    cardType: card.type,
    cardData: { ...card }
  });
  return state;
}

export function dealDamage(state, targetSide, amount = 1, meta = {}) {
  const n = Math.max(0, amount);
  const newHP = Math.max(0, state[targetSide].hp - n);
  state[targetSide].hp = newHP;

  pushEvt(state, {
    t: "damage",
    source: meta.source || "effect",
    side: targetSide,
    amount: n,
  });

  // Trigger glyphs & trance effects when taking damage
  state = applyGlyphPassives(state, targetSide, "tookDamage");
  return state;
}


// ⬇️ REPLACE your existing playCardToSpellSlot with this
export function playCardToSpellSlot(state, playerId, cardId, slotIndex){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (slotIndex < 0 || slotIndex > 2) throw new Error("spell slot index 0..2");
  const slot = P.slots[slotIndex];
  if (slot.hasCard) throw new Error("slot occupied");

  const i = P.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new Error("card not in hand");
  const card = P.hand[i];
  if (card.type !== "SPELL") throw new Error("only SPELL can be played to spell slots");

  const playCost = Number(card.playCost || 0);
  if ((P.aether|0) < playCost) throw new Error("Not enough Æ to play this Spell");

  // pay to play (if any)
  if (playCost > 0) P.aether -= playCost;

  P.hand.splice(i,1);
  card.progress = 0;
  slot.card = card;
  slot.hasCard = true;
   // New: mark entry turn so it cannot advance this same turn
  card._enteredTurn = state.turn;
  delete card._advancedTurn;

  // (Optional) event for the payment
  if (playCost > 0) pushEvt(state, { t:"aether", side: playerId, amount: -playCost, by: card.id });

  return state;
}


// ⬇️ REPLACE your existing setGlyphFromHand with this
export function setGlyphFromHand(state, playerId, cardId){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  const slot = P.slots[3];
  if (!slot?.isGlyph) throw new Error("no glyph slot");
  if (slot.hasCard) throw new Error("glyph slot occupied");

  const i = P.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new Error("card not in hand");
  const card = P.hand[i];
  if (card.type !== "GLYPH") throw new Error("only GLYPH may be set");

  const playCost = Number(card.playCost || 0);
  if ((P.aether|0) < playCost) throw new Error("Not enough Æ to set this Glyph");
  if (playCost > 0) { P.aether -= playCost; pushEvt(state,{t:"aether",side:playerId,amount:-playCost,by:card.id}); }

  P.hand.splice(i,1);
  slot.card = card;
  slot.hasCard = true;
  return state;
}


// Buy → discard
export function buyFromFlow(state, playerId, flowIndexRaw){
  const flowIndex = (Number(flowIndexRaw) | 0);
  if (flowIndex < 0 || flowIndex > 4) throw new Error("bad flow index");

  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (!state.flow) throw new Error("no flow");

  const card = state.flow[flowIndex];
  if (!card) throw new Error("no card at flow index");

  const price = FLOW_COSTS[flowIndex] || 0;
  const haveTemp = (P.tempAether | 0);
  const haveReg  = (P.aether | 0);
  if (haveTemp + haveReg < price) throw new Error("Not enough Æ");

  // Clear the slot first so renderers see it empty immediately
  state.flow[flowIndex] = null;
  pushEvt(state, { t: 'flow_slot_empty', side: playerId, flowIndex });

  // Take payment (temp Æ first) and move the card to discard
  const spendTemp = Math.min(haveTemp, price);
  const spendReg  = price - spendTemp;
  if (spendTemp) P.tempAether = haveTemp - spendTemp;
  if (spendReg)  { P.aether = haveReg - spendReg; pushEvt(state,{t:"aether",side:playerId,amount:-spendReg}); }
  P.discard.push({ ...card });

  // Normal buy event (kept as-is)
  pushEvt(state, {
    t: "resolved",
    source: "buy",
    side: playerId,
    cardId: card.id,
    cardType: card.type,
    flowIndex,
    cardData: { ...card }
  });

  // Glyph passive: buy
  state = applyGlyphPassives(state, playerId, "buy");
  return state;
}


/////////////////////////////
// Resolving helpers
/////////////////////////////

function restockIfEmpty(state, playerId){
  const P = state.players[playerId];
  if (!P.deck.length && P.discard.length){
    // tell the UI we’re about to reshuffle
    pushEvt(state, {
      t: "reshuffle",
      side: playerId,
      discardCount: P.discard.length
    });
    shuffle(P.discard);
    P.deck = P.discard.splice(0);
  }
}

export function drawOne(state, playerId){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  restockIfEmpty(state, playerId);
  if (!P.deck.length) return state;
  const c = P.deck.shift();
  P.hand.push(c);
  // tell the UI a card was actually drawn (animate from deck → hand)
  (state._events ||= []).push({
    t: "draw",
    side: playerId,
    amount: 1,
    cardId: c?.id
  });
  return state;
}

export function drawN(state, playerId, n){
  for (let i = 0; i < n; i++) state = drawOne(state, playerId);
  return state;
}

// --- Aetherflow helpers ---
function revealOneIntoFlow(s) {
  s.flow ||= [null, null, null, null, null];
  s._events ||= [];

  // Fall off rightmost (index 4) if present
  const fall = s.flow[4] || null;
  if (fall) {
    s._events.push({
      t: 'resolved',
      source: 'flow-falloff',
      side: s.activePlayer,
      cardData: { ...fall }
    });
  }

  // Shift right
  for (let i = 4; i > 0; i--) s.flow[i] = s.flow[i - 1] || null;

  // Reveal a new card into index 0 from the flow draw pile
  const pool = s.flowDraw || [];
  const newCard = pool.length ? { ...pool.shift() } : null;
  s.flow[0] = newCard;

  // Spotlight the newly revealed card (for UI)
  if (newCard) {
    s._events.push({
      t: 'reveal',
      source: 'flow',
      side: s.activePlayer,
      flowIndex: 0,
      cardId: newCard.id,
      cardType: newCard.type,
      cardData: { ...newCard }
    });
  }
  return s;
}

export function revealIntoFlow(s, count = 1) {
  for (let i = 0; i < count; i++) s = revealOneIntoFlow(s);
  return s;
}

function compactSlideRightAndReveal(state) {
  state.flow ||= [null, null, null, null, null];
  state._events ||= [];

  const before = state.flow.map(c => (c ? { id: c.id } : null));

  // Remove gaps created by buys, preserving order
  const survivors = state.flow.filter(Boolean);

  // If rail was full (5), the rightmost falls off; otherwise nothing falls off
  let fellOff = null;
  let carry = survivors;
  if (survivors.length === 5) {
    fellOff = survivors[4];
    carry   = survivors.slice(0, 4);
  }

  // Place carry into indexes 1..n, reveal new into 0
  const next = [null, null, null, null, null];
  for (let i = 0; i < carry.length; i++) next[i + 1] = carry[i];

  const pool = state.flowDraw || [];
  const newCard = pool.length ? { ...pool.shift() } : null;
  next[0] = newCard;

  state.flow = next;

  if (fellOff) {
    state._events.push({
      t: 'resolved',
      source: 'flow-falloff',
      side: state.activePlayer,
      cardData: { ...fellOff }
    });
  }

  const after = state.flow.map(c => (c ? { id: c.id } : null));
  state._events.push({
    t: 'flow_slide',
    source: 'flow',
    side: state.activePlayer,
    before,
    after
  });

  if (newCard) {
    state._events.push({
      t: 'reveal',
      source: 'flow',
      side: state.activePlayer,
      flowIndex: 0,
      cardId: newCard.id,
      cardType: newCard.type,
      cardData: { ...newCard }
    });
  }

  return state;
}


// Added param: bypassPlacementLock (default false). Used by Instants like Surge of Ash.
export function advanceSpell(
  state,
  playerId,
  slotIndex,
  steps = 1,
  free = false,
  bypassPlacementLock = false
){
  const P = state.players[playerId];
  const slot = P?.slots?.[slotIndex];
  const c = slot?.card;
  if (!slot?.hasCard || !c || c.type!=="SPELL") return state;


// --- New rules ---
  // 1) Placement lock: cannot advance the same turn it was placed
// paid placement lock (effects may bypass)
  if (!free && !bypassPlacementLock && c?._enteredTurn === state.turn) return state;
  // only one PAID advance per card per turn
  if (!free && c?._paidAdvancedTurn === state.turn) return state;

  
  // Enforce single-step per call
    steps = 1;


  
  const stepCost = Number(c.stepCost || c.cost || 0);
  const totalCost = free ? 0 : stepCost * Math.max(1, steps|0);





// Pay temp Æ first, then regular Æ (matches the UI affordance)
  if (totalCost > 0) {
    const haveTemp = (P.tempAether|0);
    const haveReg  = (P.aether|0);
    const available = haveTemp + haveReg;
    if (available < totalCost) return state;
    const spendTemp = Math.min(haveTemp, totalCost);
    const spendReg  = totalCost - spendTemp;
    if (spendTemp > 0) P.tempAether = haveTemp - spendTemp;
    if (spendReg  > 0) {
      P.aether = haveReg - spendReg;
      pushEvt(state, { t:"aether", side:playerId, amount:-spendReg, by:c.id });
    }
  }


  

 c.progress = Math.max(0, (c.progress|0) + (steps|0));
  // Only mark for PAID advances (free/effect advances don't consume the "once/turn")
  if (!free) c._paidAdvancedTurn = state.turn;
  
  if ((c.progress|0) >= (c.pip|0)) {
    state = applyParsedEffects(state, playerId, c);

    // move to discard & emit
    slot.card = null;
    slot.hasCard = false;
    c.progress = 0;
    P.discard.push(c);
    pushEvt(state, {
      t: "resolved",
      source: "spell",
      side: playerId,
      cardId: c.id,
      cardType: "SPELL",
      slotIndex,
      cardData: { ...c }
    });

    state = applyGlyphPassives(state, playerId, "spell_resolved");
  }
  return state;
}


export function payAndAdvanceOne(state, side, slotIndex) {
  // Single-source of truth: advanceSpell does guard + payment + once-per-turn mark.
  return advanceSpell(state, side, slotIndex, 1 /*steps*/, false /*free*/, false /*bypassPlacementLock*/);
}



// ⬇️ REPLACE your existing resolveInstantFromHand with this
export function resolveInstantFromHand(state, playerId, cardId){
  const P = state.players[playerId];
  const i = P.hand.findIndex(c => c.id === cardId && c.type==="INSTANT");
  if (i < 0) return state;
  const card = P.hand[i];

  const playCost = Number(card.playCost || 0);
  if ((P.aether|0) < playCost) throw new Error("Not enough Æ to cast this Instant");
  if (playCost > 0) { P.aether -= playCost; pushEvt(state,{t:"aether",side:playerId,amount:-playCost,by:card.id}); }

  // move to stack resolution
  P.hand.splice(i,1)[0];
  state = applyParsedEffects(state, playerId, card);

  P.discard.push(card);
  pushEvt(state, {
    t: "resolved",
    source: "instant",
    side: playerId,
    cardId: card.id,
    cardType: "INSTANT",
    cardData: { ...card }
  });
  return state;
}


// Resolve Glyph
export function resolveGlyphFromSlot(state, playerId){
  const P = state.players[playerId];
  const slot = P.slots[3];
  if (!slot?.isGlyph || !slot.hasCard) return state;
  const g = slot.card;
  slot.card = null; slot.hasCard=false;
  P.discard.push(g);
  pushEvt(state, {
    t: "resolved",
    source: "glyph",
    side: playerId,
    cardId: g.id,
    cardType: "GLYPH",
    slotIndex: 3,
    cardData: { ...g }
  });
  return state;
}

// === Very Basic AI: draw up to 5, try to play cheapest legal card, else channel ===
export async function aiTakeTurn(state, emit) {
  const E = emit || (()=>{});

  // Start: draw up to 5
  const pub0 = serializePublic(state);
  const aiHandN = (pub0.players?.ai?.hand?.length || 0);
  if (aiHandN < 5) state = drawN(state, "ai", 5 - aiHandN);

  // snapshot for decisions
  const pub = serializePublic(state);
  const hand = (pub.players?.ai?.hand || []).slice();

  // helper: find first empty spell slot
  const firstEmptySpellSlot = () => {
    const slots = pub.players?.ai?.slots || [];
    for (let i=0;i<3;i++) {
      if (!slots[i]?.hasCard) return i;
    }
    return -1;
  };

  // 1) Instant we can afford
  const cheapInstant = hand
    .filter(c => c.type === "INSTANT")
    .sort((a,b)=> (a.cost|0)-(b.cost|0))[0];

  if (cheapInstant && (cheapInstant.cost|0) <= (pub.players?.ai?.aether|0)) {
    try {
      E({ kind:"ai-instant", cardId: cheapInstant.id });
      state = resolveInstantFromHand(state, "ai", cheapInstant.id);
      return state;
    } catch {}

  }

  // 2) Glyph if we have none set and can afford one
  const aiGlyphHasCard = !!(pub.players?.ai?.slots?.[3]?.hasCard);
  const wantGlyph = !aiGlyphHasCard;
  if (wantGlyph) {
    const glyph = hand.find(c => c.type === "GLYPH" && (c.cost|0) <= (pub.players?.ai?.aether|0));
    if (glyph) {
      try {
        E({ kind:"ai-glyph", cardId: glyph.id });
        state = setGlyphFromHand(state, "ai", glyph.id);
        return state;
      } catch {}
    }
  }

  // 3) Spell — cheapest playable to first empty slot
  const slotIndex = firstEmptySpellSlot();
  if (slotIndex >= 0) {
    const spell = hand
      .filter(c => c.type === "SPELL")
      .sort((a,b)=> (a.cost|0)-(b.cost|0))
      .find(c => (c.cost|0) <= (pub.players?.ai?.aether|0));

    if (spell) {
      try {
        E({ kind:"ai-spell", cardId: spell.id, slotIndex });
        state = playCardToSpellSlot(state, "ai", spell.id, slotIndex);
        return state;
      } catch {}
    }
  }

  // 4) Nothing affordable: channel (discard highest Æ value card)
  const bestForAether = hand
    .slice()
    .sort((a,b)=> (b.aetherValue|0)-(a.aetherValue|0))[0];

  if (bestForAether && (bestForAether.aetherValue|0) > 0) {
    try {
      E({ kind:"ai-channel", cardId: bestForAether.id });
      state = discardForAether(state, "ai", bestForAether.id);
      return state;
    } catch {}
  }

  // 5) Truly stuck: end turn untouched
  return state;
}

export function getStack(state, playerId, which){
  const P = state.players?.[playerId];
  if (!P) return [];
  if (which === "deck")    return clone(P.deck    || []);
  if (which === "discard") return clone(P.discard || []);
  if (which === "hand")    return clone(P.hand    || []);
  return [];
}

// =============================================
// EFFECT PARSER — supports new triggers
// =============================================

function parseEffectsFromText(raw) {
  const t = raw.toLowerCase();
  const fx = [];

  // Damage patterns
  if (/deal\s+(\d+)\s+damage/.test(t)) {
    const n = parseInt(t.match(/deal\s+(\d+)\s+damage/)[1]);
    fx.push({ t: "damage", n });
  }

  // Draw patterns
  if (/draw\s+(\d+)/.test(t)) {
    const n = parseInt(t.match(/draw\s+(\d+)/)[1]);
    fx.push({ t: "draw", n });
  }

  // Store Aether
  if (/store\s+(\d+)/.test(t)) {
    const n = parseInt(t.match(/store\s+(\d+)/)[1]);
    fx.push({ t: "store", n });
  }

  // Channel Aether
  if (/gain\s+(\d+)\s+(?:channelled|temporary)?\s*aether/.test(t)) {
    const n = parseInt(t.match(/gain\s+(\d+)\s+(?:channelled|temporary)?\s*aether/)[1]);
    fx.push({ t: "channel", n });
  }

  // Advance single target spell
  if (/target\s+spell\s+advances?\s+1(?:\s+step)?/.test(t)) {
    const isFree = /\bfree\b/.test(t);
    fx.push({ t: isFree ? "advanceTargetFree" : "advanceTarget", n: 1 });
  }

  // Advance all spells
  if (/advance\s+all\s+your\s+active\s+spells\s+1\s*step/.test(t)) {
    fx.push({ t: "advanceAll", n: 1 });
  }

  // Return cards from discard
  if (/return\s+(\d+)\s+card/.test(t)) {
    const n = parseInt(t.match(/return\s+(\d+)\s+card/)[1]);
    fx.push({ t: "returnFromDiscard", n });
  }

  return fx;
}



function applyGlyphPassives(state, side, trigger){
  const slot = state.players?.[side]?.slots?.[3];
  const text = slot?.hasCard ? (slot.card?.text || "").toLowerCase() : "";
  let fired = false;

  if (trigger === "spell_resolved" &&
      /when\s+a\s+spell\s+resolves?\s*→?\s*gain\s+1\s*(?:æ|ae|aether)/.test(text)) {
    state.players[side].aether = (state.players[side].aether|0) + 1;
    pushEvt(state, { t:"aether", side, amount:1, by: slot.card?.id });
    fired = true;
  }

  if (trigger === "channel" &&
      /when\s+you\s+channel\s+aether\s*→?\s*draw\s+1/.test(text)) {
    state = drawN(state, side, 1);
    pushEvt(state, { t:"draw", side, amount:1, by: slot.card?.id });
    fired = true;
  }

  if (trigger === "discardForAe" &&
      /when\s+you\s+discard\s+a\s+card\s+for\s*æ.*gain\s+1\s+extra\s*æ/i.test(text)) {
    state.players[side].aether = (state.players[side].aether|0) + 1;
    pushEvt(state, { t:"aether", side, amount:1, by: slot.card?.id });
    fired = true;
  }

  if (trigger === "buy" &&
      /when\s+you\s+buy\s+a\s+card\s+from\s+aether\s+flow\s*→?\s*draw\s+1/.test(text)) {
    state = drawN(state, side, 1);
    pushEvt(state, { t:"draw", side, amount:1, by: slot.card?.id });
    fired = true;
  }
// When opponent resolves a spell → Withering Light
if (trigger === "spell_resolved_opponent" &&
    /when\s+opponent\s+resolves\s+a\s+spell\s*→\s*deal\s+1\s+damage/.test(text)) {
  state = dealDamage(state, 1 - side, 1, { source: "glyph" });
  fired = true;
}

// When player takes damage → Buried Heat
if (trigger === "tookDamage" &&
    /when\s+you\s+take\s+damage\s*→\s*channel\s+(\d+)\s*aether/.test(text)) {
  const m = text.match(/channel\s+(\d+)/);
  const n = parseInt(m?.[1] || 1);
  state[side].aether += n;
  fired = true;
}

// When drawing outside draw step → Soulglass
if (trigger === "draw_outside" &&
    /when\s+you\s+draw\s+outside\s+your\s+draw\s+step\s*→\s*gain\s+1\s+channelled\s+aether/.test(text)) {
  state[side].aether += 1;
  fired = true;
}

  // Auto-discard once a passive fires
  if (fired) {
    state = resolveGlyphFromSlot(state, side);
  }

  return state;
}

function applyParsedEffects(state, side, card, opts = {}) {
  const rival = otherSide(side);
  const effects = parseEffectsFromText(card?.text || "");

  // Allow instant text like "Target Spell advances 1" to pick a target:
  const pickOwnAdvancableSlot = () => {
    const slots = state.players[side]?.slots || [];
    for (let i=0;i<3;i++){
      const s = slots[i];
      const c = s?.card;
      if (s?.hasCard && c?.type === "SPELL" && (c.progress|0) < (c.pip|0)) return i;
    }
    return -1;
  };

  for (const e of effects) {
    switch (e.t) {
      case "draw":
        if (e.n > 0) { state = drawN(state, side, e.n); pushEvt(state,{t:"draw",side,amount:e.n,by:card.id}); }
        break;

      case "aether":
        if (e.n > 0) { state.players[side].aether = (state.players[side].aether|0) + e.n; pushEvt(state,{t:"aether",side,amount:e.n,by:card.id}); }
        break;

      case "channel":
        if (e.n > 0) {
          state.players[side].aether = (state.players[side].aether|0) + e.n;
          pushEvt(state,{t:"aether",side,amount:e.n,by:card.id});
          state = applyGlyphPassives(state, side, "channel");
        }
        break;

      case "damage":
        if (e.n > 0) state = dealDamage(state, rival, e.n, { source: card.type?.toLowerCase?.() || "card", cardId: card.id });
        break;

      case "heal":
        if (e.n > 0) {
          const cur = state.players[side].vitality|0;
          state.players[side].vitality = Math.max(0, cur + e.n);
          pushEvt(state,{t:"heal",side,amount:e.n,by:card.id});
        }
        break;

      case "selfLose":
        if (e.n > 0) state = dealDamage(state, side, e.n, { source: "self", cardId: card.id });
        break;

            case "advanceOther": {
        const slots = state.players[side]?.slots || [];
        for (let i=0;i<3;i++){
          const s = slots[i], c2 = s?.card;
          if (s?.hasCard && c2?.type === "SPELL" && c2.id !== card.id && (c2.progress|0) < (c2.pip|0)) {
             // Effect-based advance: free and bypass placement/paid locks
            state = advanceSpell(state, side, i, 1, /*free=*/true, /*bypassPlacementLock=*/true);
            break;
          }
        }
        break;
      }

      case "advanceOtherFree": {
        const slots = state.players[side]?.slots || [];
        for (let i=0;i<3;i++){
          const s = slots[i], c2 = s?.card;
          if (s?.hasCard && c2?.type === "SPELL" && c2.id !== card.id && (c2.progress|0) < (c2.pip|0)) {
            // Free effect step: also bypass placement lock
            state = advanceSpell(state, side, i, 1, /*free=*/true, /*bypassPlacementLock=*/true);
            break;
          }
        }
        break;
      }

      case "advanceTarget": {
        const idx = (opts.targetSlotIndex ?? (() => {
          const slots = state.players[side]?.slots || [];
          for (let i=0;i<3;i++){
            const s = slots[i], c2 = s?.card;
            if (s?.hasCard && c2?.type === "SPELL" && (c2.progress|0) < (c2.pip|0)) return i;
          }
          return -1;
        })());
        if (idx >= 0) {
          // Effect-based advance: free and bypass placement/paid locks
          state = advanceSpell(state, side, idx, 1, /*free=*/true, /*bypassPlacementLock=*/true);
       }
        break;
      }

      case "advanceTargetFree": {
        const idx = (opts.targetSlotIndex ?? (() => {
          const slots = state.players[side]?.slots || [];
          for (let i=0;i<3;i++){
            const s = slots[i], c2 = s?.card;
            if (s?.hasCard && c2?.type === "SPELL" && (c2.progress|0) < (c2.pip|0)) return i;
          }
          return -1;
        })());
        if (idx >= 0) {
          // Free effect step: also bypass placement lock
          state = advanceSpell(state, side, idx, 1, /*free=*/true, /*bypassPlacementLock=*/true);
        }
        break;
      }


      default: break;
    }
  }

  return state;
}
