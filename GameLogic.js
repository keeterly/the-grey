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


// ----------------------------------------------
// Trance System definitions (WIP)
// Each Spellweaver has two HP thresholds where their trance power activates.
// When a player’s vitality falls to or below the first threshold and their
// weaver.stage is 0, they enter stage 1. When vitality falls to or below
// the second threshold and stage is 1, they enter stage 2. Effects for
// each stage should be handled elsewhere (UI or additional game logic).
// This helper will raise a trance event when the stage changes so that
// the UI can show a cinematic or apply passives.
const WEAVER_TRANCE_THRESHOLDS = {
  // Format: weaverId: { stage1: hpThreshold, stage2: hpThreshold }
  aria:  { stage1: 4, stage2: 2 }, // Aria, Runesurge Adept
  enoch: { stage1: 3, stage2: 1 }, // Enoch, Stillmind Scribe
  morr:  { stage1: 4, stage2: 1 }, // Morr, Gravecurrent Binder
  veyra: { stage1: 4, stage2: 2 }, // Veyra, Spiral Sage
  kareth:{ stage1: 3, stage2: 1 }  // Kareth, Ember Architect
};

function checkTranceThresholds(state, playerId) {
  const P = state.players?.[playerId];
  if (!P) return state;
  const weaver = P.weaver || {};
  const thresholds = WEAVER_TRANCE_THRESHOLDS[weaver.id];
  if (!thresholds) return state;
  const hp = P.vitality | 0;
  if ((weaver.stage|0) < 1 && hp <= thresholds.stage1) {
    weaver.stage = 1;
    pushEvt(state, { t: 'trance', source: 'trance', side: playerId, stage: 1, weaverId: weaver.id });
  }
  if ((weaver.stage|0) < 2 && hp <= thresholds.stage2) {
    weaver.stage = 2;
    pushEvt(state, { t: 'trance', source: 'trance', side: playerId, stage: 2, weaverId: weaver.id });
  }
  return state;
}

// ----------------------------------------------
// Weaver Trance Passive Helpers
//
// Some weavers gain additional effects when certain game actions occur.
// Kareth: After spending Æ, deal 1 damage once per turn. On stage II,
//         also deal 1 extra damage whenever a single spend is 3 or more.
// Morr:   Gain 1 Æ whenever a card leaves one of your slots (spell or glyph).
//         On stage II, cards from the Aetherflow cost 1 less (min 0) and
//         you gain 1 Æ after buying from the flow.
// Enoch:  Gain 1 Æ when you set a glyph (stage I) and draw 1 card when the
//         glyph is revealed (stage II). The draw occurs immediately after
//         placing the glyph.
// Aria:   Gain 1 Æ each time you advance a spell (stage I). On stage II
//         the first paid advance each turn costs 1 less (min 0).
// Veyra:  Gain 1 Æ whenever you draw a card (outside of the normal draw
//         step is not currently distinguished). On stage II, at the
//         beginning of your turn you look at the top two cards of your deck
//         and may reorder or discard one. This implementation pushes a
//         'veyraScry' event to the UI; reordering/discarding is handled
//         externally.

function processAetherSpend(state, side, amount) {
  // Only process non‑zero spends
  if (!amount || amount <= 0) return state;
  const w = state.players?.[side]?.weaver;
  if (!w) return state;
  // Kareth: Aggression passive
  if (w.id === "kareth" && (w.stage | 0) >= 1) {
    // Stage I: once per turn after any spend, deal 1 damage
    if (w._damageTurn !== state.turn) {
      state = dealDamage(state, otherSide(side), 1, { source: "trance-kareth" });
      w._damageTurn = state.turn;
    }
    // Stage II: if a single payment is 3 or more, deal 1 extra damage
    if ((w.stage | 0) >= 2 && amount >= 3) {
      state = dealDamage(state, otherSide(side), 1, { source: "trance-kareth" });
    }
  }
  return state;
}

function veyraScry(state, side) {
  // Stage II Veyra: at the start of your turn, look at the top 2 cards
  const P = state.players?.[side];
  const w = P?.weaver;
  if (!P || !w || w.id !== "veyra" || (w.stage | 0) < 2) return state;
  // Ensure deck is stocked before peeking
  restockIfEmpty(state, side);
  const peek = [];
  if (P.deck?.length > 0) peek.push(P.deck[0]);
  if (P.deck?.length > 1) peek.push(P.deck[1]);
  if (peek.length > 0) {
    // Emit a veyraScry event with the top two cards. UI can handle reorder/discard.
    pushEvt(state, {
      t: "veyraScry",
      side,
      cardIds: peek.map(c => c.id),
      cardData: peek.map(c => ({ ...c }))
    });
  }
  return state;
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





/**
 * Apply a reaction card’s effect based on its name and the trigger.
 * Reaction cards currently supported:
 *  - Spell Snuff: cancel an opponent’s spell cast.
 *  - Aether Disruption: negate an opponent’s spell advancement.
 *  - Aether Shield: reduce incoming damage by 2.
 *
 * @param {Object} state The game state.
 * @param {Object} reactionCard The reaction card being played.
 * @param {String} trigger The trigger type ('spell_cast', 'spell_advance', or 'damage').
 * @param {Object|null} triggeringSpell The spell card that caused the trigger, if any.
 * @param {Number|null} damage The amount of damage that would be dealt, if any.
 * @param {Number} reactingPlayer The player index (0 or 1) who is playing the reaction.
 */
function applyReactionEffect(state, reactionCard, trigger, triggeringSpell, damage, reactingPlayer) {
  const opponent = 1 - reactingPlayer;
  // Cancel a spell cast: remove from opponent’s board and move it to their graveyard
  if (reactionCard.name === 'Spell Snuff' && trigger === 'spell_cast' && triggeringSpell) {
    const slot = state.board[opponent].indexOf(triggeringSpell);
    if (slot >= 0) {
      // Remove the spell and reset progress
      state.board[opponent][slot] = null;
      state.spellProgress[opponent][slot] = 0;
      state.graveyards[opponent].push(triggeringSpell);
      state._events.push({
        type: 'spell_snuffed',
        player: reactingPlayer,
        targetPlayer: opponent,
        card: triggeringSpell
      });
    }
  }
  // Negate an advancement: decrement the opponent’s spell progress by one
  else if (reactionCard.name === 'Aether Disruption' && trigger === 'spell_advance' && triggeringSpell) {
    const slot = state.board[opponent].indexOf(triggeringSpell);
    if (slot >= 0) {
      const current = state.spellProgress[opponent][slot];
      state.spellProgress[opponent][slot] = current > 0 ? current - 1 : 0;
      state._events.push({
        type: 'advance_negated',
        player: reactingPlayer,
        targetPlayer: opponent,
        card: triggeringSpell
      });
    }
  }
  // Shield: reduce incoming damage by 2 (increase vitality by 2) without exceeding starting vitality
  else if (reactionCard.name === 'Aether Shield' && trigger === 'damage') {
    // Assuming VITALITY_START defines the max starting vitality (imported or defined elsewhere)
    const maxVitality = typeof VITALITY_START !== 'undefined' ? VITALITY_START : 30;
    state.vitality[reactingPlayer] = Math.min(
      state.vitality[reactingPlayer] + 2,
      maxVitality
   );
    state._events.push({
      type: 'shield_used',
     player: reactingPlayer,
      amount: 2
    });
  }
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
  // Spells (5)
  { name:"Pulse of the Grey", type:"SPELL", playCost:0, stepCost:1, pip:1, text:"Draw 1 card and Store 1 Aether.", aetherValue:0, qty:1 },
  { name:"Wispform Surge",   type:"SPELL", playCost:0, stepCost:1, pip:1, text:"Advance another Spell 1 step and Gain 1 Aether.", aetherValue:0, qty:1 },
  { name:"Ashen Focus",      type:"SPELL", playCost:0, stepCost:1, pip:2, text:"Draw 1 card and Store 1 Aether.", aetherValue:1, qty:1 },
  { name:"Wisp of Insight",  type:"SPELL", playCost:0, stepCost:0, pip:1, text:"Gain 1 Aether and Draw 1 card.", aetherValue:0, qty:1 },
  { name:"Greyfire Bloom",   type:"SPELL", playCost:2, stepCost:0, pip:1, text:"Deal 1 damage to opponent.", aetherValue:1, qty:1 },

  // Instants (3)
  { name:"Surge of Ash",     type:"INSTANT", playCost:1, text:"Target Spell advances 1 step.", aetherValue:0, qty:1 },
  { name:"Veil of Dust",     type:"INSTANT", playCost:1, text:"Prevent 1 damage or Draw 1 card.", aetherValue:0, qty:1 },
  { name:"Minor Invocation", type:"INSTANT", playCost:1, text:"The next card you purchase this turn costs 1 less Æ.", aetherValue:1, qty:1 },

  // Reaction (1)
  { name:"Spell Snuff",      type:"REACTION", playCost:2, text:"When your opponent casts a Spell, pay 2 Æ to cancel that Spell.", aetherValue:1, qty:1 },

  // Glyph (1)
  { name:"Glyph of Returning Echo", type:"GLYPH", playCost:0, text:"When you Store Aether → Draw 1 card.", aetherValue:1, qty:1 }
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


  // --- v3 Reaction Cards ---
  { name: "Aether Disruption", type: "REACTION", pip: 0, playCost: 1, stepCost: 0, cost: 1, aetherValue: 0,
    text: "When your opponent advances a Spell, pay 1 Æ to negate that advancement.", role: "Counter", qty: 1 },
  { name: "Spell Snuff", type: "REACTION", pip: 0, playCost: 2, stepCost: 0, cost: 2, aetherValue: 0,
    text: "When your opponent casts a Spell, pay 2 Æ to cancel that Spell.", role: "Counter", qty: 1 },
  { name: "Aether Shield", type: "REACTION", pip: 0, playCost: 0, stepCost: 0, cost: 0, aetherValue: 0,
    text: "When you would take damage, discard this to reduce that damage by 2.", role: "Defense", qty: 1 },
  
];



function expandList(list) {
  const out = [];
  list.forEach(c => {
    for (let i = 0; i < (c.qty || 1); i++) {
     const proto = {
        id: uid(),
        name: c.name,
        type: c.type,
        // Preserve playCost and stepCost so the engine and UI see them.
        playCost: c.playCost || 0,
        stepCost: c.stepCost || 0,
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


// ----------------------------------------------
// Reaction System (WIP)
// A reaction window can open after certain triggers (spell advance, spell cast, damage).
// The state.reactionWindow holds information about the trigger and the side allowed to react.
function triggerReactionWindow(state, trigger, context) {
  // If a reaction window is already open, do not open another.
  if (state.reactionWindow) return state;
  // The non‑active player gets the chance to react.
  const nonActiveSide = otherSide(state.activePlayer);
  state.reactionWindow = { trigger, context, side: nonActiveSide };
  // Emit an event for the UI to offer reaction options.
  pushEvt(state, { t: "reaction_window", trigger, context, side: nonActiveSide });
  return state;
}

function clearReactionWindow(state) {
  state.reactionWindow = null;
  return state;
}

// Play a Reaction card from hand.  This pays its cost and moves it to the discard.
// Actual negate/cancel effects must be implemented by the UI or additional logic.
export function resolveReactionFromHand(state, playerId, cardId) {
  const P = state.players[playerId];
  const idx = P.hand.findIndex(c => c.id === cardId && c.type === "REACTION");
  if (idx < 0) return state;
  const card = P.hand[idx];
  const playCost = Number(card.playCost || 0);
  if ((P.aether|0) < playCost) throw new Error("Not enough Æ to play this Reaction");
  if (playCost > 0) {
    P.aether -= playCost;
    pushEvt(state,{t:"aether",side:playerId,amount:-playCost,by:card.id});
  }
  // Spending Æ triggers Kareth’s passive
  state = processAetherSpend(state, playerId, playCost);
  // Remove from hand and discard
  P.hand.splice(idx, 1);
  P.discard.push(card);
  pushEvt(state, {
    t: "resolved",
    source: "reaction",
    side: playerId,
    cardId: card.id,
    cardType: "REACTION",
    cardData: { ...card }
  });
  // Clear the reaction window once a reaction resolves
  clearReactionWindow(state);
  return state;
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
  // Veyra Stage II: allow the player to look at the top two cards at the start of their turn
  state = veyraScry(state, state.activePlayer);
  // Draw up to 5 cards in hand.  If the player retained cards from the previous turn,
  // this will only draw the difference.
  state = drawUpTo(state, state.activePlayer, 5);
  return state; // no flow movement here anymore
}


export function endTurn(state) {
  if (!state?.flow) return state;

  const endingPlayer = state.activePlayer;
  const P = state.players[endingPlayer];

  // Players now retain their hand between turns.  We no longer discard
  // the remaining hand here.

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
  const P = state.players?.[targetSide];
  if (!P) return state;
  const n = Math.max(0, amount | 0);
  if (n <= 0) return state;


 // Trigger reaction window before damage is applied (Aether Shield).
  state = triggerReactionWindow(state, "damage", { targetSide, amount: n, source: meta.source, cardId: meta.cardId });



  
  const before = P.vitality | 0;
  P.vitality = Math.max(0, before - n);
  // After dealing damage, check for trance threshold updates
  state = checkTranceThresholds(state, targetSide);

  pushEvt(state, {
    t: "damage",
    source: meta.source || "effect",
    side: targetSide,
    amount: n
  });

  // Trigger any glyph that responds to taking damage
  state = applyGlyphPassives(state, targetSide, "damage");
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
 // Process Kareth spend triggers
  state = processAetherSpend(state, playerId, playCost);



  
  // Before the spell fully enters play, allow the opponent to react (Spell Snuff).
  state = triggerReactionWindow(state, "spell_cast", { playerId, cardId });

  
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

   // Process Kareth spend triggers
  state = processAetherSpend(state, playerId, playCost);


  P.hand.splice(i,1);
  slot.card = card;
  slot.hasCard = true;

 // Enoch trance: gain Æ when setting a glyph (stage I) and draw on stage II
  const weaver = P.weaver;
  if (weaver?.id === "enoch") {
    if ((weaver.stage | 0) >= 1) {
      P.aether = (P.aether | 0) + 1;
      pushEvt(state, { t: "aether", side: playerId, amount: 1, by: "trance-enoch" });
    }
    if ((weaver.stage | 0) >= 2) {
      state = drawN(state, playerId, 1);
      pushEvt(state, { t: "draw", side: playerId, amount: 1, by: "trance-enoch" });
    }
  }


  
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

 let price = FLOW_COSTS[flowIndex] || 0;
  // Morr Stage II: flow costs 1 less (minimum 0)
  const wF = state.players[playerId]?.weaver;
  if (wF?.id === "morr" && (wF.stage | 0) >= 2) {
    price = Math.max(0, price - 1);
  }
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

  // Process Kareth spend triggers
  state = processAetherSpend(state, playerId, price);

  // Morr Stage II: after buying, gain 1 Æ
  if (wF?.id === "morr" && (wF.stage | 0) >= 2) {
    P.aether = (P.aether | 0) + 1;
    pushEvt(state, { t:"aether", side: playerId, amount: 1, by: "trance-morr" });
  }


  
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

// Draw cards until the specified hand size is reached.  If the current hand
// already meets or exceeds the target size, no cards are drawn.
function drawUpTo(state, side, target = 5) {
  const P = state.players?.[side];
  if (!P) return state;
  const handCount = (P.hand?.length || 0);
  if (handCount < target) {
    const toDraw = target - handCount;
    state = drawN(state, side, toDraw);
  }
  return state;
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
  
  // Veyra Stage I: gain 1 Æ when you draw a card (outside draw step not distinguished)
  const w = state.players?.[playerId]?.weaver;
  if (w?.id === "veyra" && (w.stage | 0) >= 1) {
    state.players[playerId].aether = (state.players[playerId].aether | 0) + 1;
    pushEvt(state, { t:"aether", side: playerId, amount: 1, by:"trance-veyra" });
  }
  // Trigger any glyph that responds to drawing outside the draw step
  state = applyGlyphPassives(state, playerId, "draw");
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


// Trigger reaction window for the opponent before advancing a spell.
  state = triggerReactionWindow(state, "spell_advance", { playerId, slotIndex, cardId: c.id });


  

// --- New rules ---
  // 1) Placement lock: cannot advance the same turn it was placed
// paid placement lock (effects may bypass)
  if (!free && !bypassPlacementLock && c?._enteredTurn === state.turn) return state;
  // only one PAID advance per card per turn
  if (!free && c?._paidAdvancedTurn === state.turn) return state;

  
  // Enforce single-step per call
    steps = 1;


  
 // Determine the cost per step. Aria Stage II discount applies to the first paid advance each turn.
  let stepCost = Number(c.stepCost || c.cost || 0);
  const w = state.players[playerId]?.weaver;
  if (w?.id === "aria" && (w.stage | 0) >= 2 && !free) {
    if (w._discountTurn !== state.turn) {
      stepCost = Math.max(0, stepCost - 1);
      w._discountTurn = state.turn;
    }
  }
  const totalCost = free ? 0 : stepCost * Math.max(1, steps | 0);



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

  
  // Process Kareth spend triggers
  state = processAetherSpend(state, playerId, totalCost);

  

 c.progress = Math.max(0, (c.progress|0) + (steps|0));
  // Only mark for PAID advances (free/effect advances don't consume the "once/turn")
  if (!free) c._paidAdvancedTurn = state.turn;



  // Aria Stage I: gain 1 Æ whenever you advance a spell
  {
    const w2 = state.players[playerId]?.weaver;
    if (w2?.id === "aria" && (w2.stage | 0) >= 1) {
      state.players[playerId].aether = (state.players[playerId].aether | 0) + 1;
      pushEvt(state, { t: "aether", side: playerId, amount: 1, by: "trance-aria" });
    }
  }
  
  
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


    // Morr Stage I: gain 1 Æ when a card leaves a slot
    const w3 = P.weaver;
    if (w3?.id === "morr" && (w3.stage | 0) >= 1) {
      P.aether = (P.aether | 0) + 1;
      pushEvt(state, { t: "aether", side: playerId, amount: 1, by: "trance-morr" });
    }

    
    state = applyGlyphPassives(state, playerId, "spell_resolved");

    // Also trigger opponent glyphs for “opponent spell resolves”
      state = applyGlyphPassives(state, otherSide(playerId), "opponent_spell_resolved");
    
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
 const i = P.hand.findIndex(c => c.id === cardId && (c.type === "INSTANT" || c.type === "REACTION"));
  if (i < 0) return state;
  const card = P.hand[i];

  const playCost = Number(card.playCost || 0);
  if ((P.aether|0) < playCost) throw new Error("Not enough Æ to cast this Instant");
  if (playCost > 0) { P.aether -= playCost; pushEvt(state,{t:"aether",side:playerId,amount:-playCost,by:card.id}); }

// Process Kareth spend triggers
 state = processAetherSpend(state, playerId, playCost);

  
  // If it’s a Reaction card, handle with the Reaction resolver
  if (card.type === "REACTION") {
    return resolveReactionFromHand(state, playerId, card.id);
  }
  // otherwise handle as normal Instant
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

  
  // Morr Stage I: gain 1 Æ when a glyph leaves a slot
  const w = P.weaver;
  if (w?.id === "morr" && (w.stage | 0) >= 1) {
    P.aether = (P.aether | 0) + 1;
    pushEvt(state, { t:"aether", side: playerId, amount: 1, by: "trance-morr" });
  }
  
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

function parseEffectsFromText(raw) {
  if (!raw) return [];
  const t = String(raw).toLowerCase();

  const fx = [];

  // Draw N
  { const m = t.match(/\bdraw\s+(\d+)/); if (m) fx.push({t:"draw", n:+m[1]}); }

  // Gain N Æ (normal) — exclude "... this turn" separately below
  { const m = t.match(/\b(?:you\s+)?gain\s+(\d+)\s*(?:æ|ae|aether)\b(?!\s*this\s+turn)/i);
    if (m) fx.push({ t: "aether", n: +m[1] }); }

  // "Gain N Æ this turn" — treat as normal gain for now
  { const m = t.match(/\bgain\s+(\d+)\s*(?:æ|ae|aether)\s+this\s+turn\b/i);
    if (m) fx.push({ t: "aether", n: +m[1] }); }

  // Channel N
  { const m = t.match(/\bchannel\s+(\d+)/); if (m) fx.push({t:"channel", n:+m[1]}); }

  // Treat "Store N in Aetherwell" as channel N for effect resolution
  { const m = t.match(/\bstore\s+(\d+)\s+in\s+aetherwell\b/i);
    if (m) fx.push({ t:"channel", n: +m[1] }); }


  // Treat "Store N Aether" (no location specified) as channel N
  { const m = t.match(/\bstore\s+(\d+)\s+aether\b/i);
    if (m) fx.push({ t:"channel", n: +m[1] }); }
  
  // Deal N damage
  { const m = t.match(/\bdeal\s+(\d+)\s+damage/); if (m) fx.push({t:"damage", n:+m[1]}); }

  // Heal / Lose N vitality
  { const m = t.match(/\bheal\s+(\d+)/); if (m) fx.push({t:"heal", n:+m[1]}); }
  { const m = t.match(/\blose\s+(\d+)\s+vitality/); if (m) fx.push({t:"selfLose", n:+m[1]}); }

  // Advance another spell / target spell — detect "free"
  if (/\badvance\s+another\s+spell\b/.test(t)) {
    const isFree = /\bfree\b/.test(t);
    fx.push({ t: isFree ? "advanceOtherFree" : "advanceOther", n: 1 });
  }
  if (/\btarget\s+spell\s+advances?\s+1\b/.test(t)) {
    const isFree = /\bfree\b/.test(t);
    fx.push({ t: isFree ? "advanceTargetFree" : "advanceTarget", n: 1 });
  }

  return fx;
}


function applyGlyphPassives(state, side, trigger){
  const slot = state.players?.[side]?.slots?.[3];
  const text = slot?.hasCard ? (slot.card?.text || "").toLowerCase() : "";
  let fired = false;

  if (trigger === "spell_resolved" &&
      (
        /when\s+a\s+spell\s+resolves?\s*→?\s*gain\s+1\s*(?:æ|ae|aether)/.test(text) ||
        /when\s+a\s+spell\s+resolves?\s*→?\s*gain\s+1\s+channelled\s*(?:æ|ae|aether)/.test(text)
      )) {
    // For "gain 1 channelled Aether" we simply add 1 Æ; adjust here if you
    // later differentiate between regular and channelled Aether.
    state.players[side].aether = (state.players[side].aether|0) + 1;
    pushEvt(state, { t:"aether", side, amount:1, by: slot.card?.id });
    fired = true;
  }

  // New: opponent spell resolves → deal 1 damage
  if (trigger === "opponent_spell_resolved" &&
      /when\s+an\s+opponent\s+resolves?\s+a\s+spell\s*→?\s*deal\s+1\s+damage/.test(text)) {
    state = dealDamage(state, otherSide(side), 1, { source: "glyph", cardId: slot.card?.id });
    fired = true;
  }

  // New: taking damage → channel N Æ (defaults to 2)
  if (trigger === "damage" &&
      /when\s+you\s+take\s+damage\s*→?\s*channel\s+(\d+)/.test(text)) {
    const m = text.match(/channel\s+(\d+)/);
    const amt = m ? Number(m[1]) : 1;
    state.players[side].aether = (state.players[side].aether | 0) + amt;
    pushEvt(state, { t: "aether", side, amount: amt, by: slot.card?.id });
    // Also trigger channel passives on this player (e.g., Glyph of Returning Echo)
    state = applyGlyphPassives(state, side, "channel");
    fired = true;
  }

  // New: draw outside draw step → gain N Æ (defaults to 1)
  if (trigger === "draw" &&
      /when\s+you\s+draw\s+outside\s+your\s+draw\s+step\s*→?\s*gain\s+(\d+)/.test(text)) {
    const m = text.match(/gain\s+(\d+)/);
    const amt = m ? Number(m[1]) : 1;
    state.players[side].aether = (state.players[side].aether | 0) + amt;
    pushEvt(state, { t: "aether", side, amount: amt, by: slot.card?.id });
    fired = true;
  }

 if (trigger === "channel" &&
      (
        /when\s+you\s+channel\s+aether\s*→?\s*draw\s+1/.test(text) ||
        /when\s+you\s+store\s+aether\s*→?\s*draw\s+1/.test(text)
      )) {
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
