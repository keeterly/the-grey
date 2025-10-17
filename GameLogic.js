// GameLogic.js
// v2.55 logic foundation (v2.54 + pip progress field)

/////////////////////////////
// Constants & Helpers
/////////////////////////////

export const FLOW_COSTS = [4, 3, 2, 2, 2];
export const STARTING_HAND = 5;
export const STARTING_VITALITY = 5;

// a tiny inline blue gem SVG you can inject into HTML strings
export const AE_GEM_SVG =
  '<svg class="gem-inline" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M12 2l6 6-6 14-6-14 6-6z" fill="currentColor"/></svg>';

// replace the glyph Æ with the inline gem SVG (call this in your UI when rendering text)
export function withAetherText(s = "") {
  return String(s).replaceAll("Æ", AE_GEM_SVG);
}

// Simple Fisher–Yates
function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uid() {
  // lightweight uid; browsers with crypto get UUIDs
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/////////////////////////////
// Card Pools (Data)
/////////////////////////////

// Shared starting deck (for both players)
const BASE_DECK_LIST = [
  { name: "Pulse of the Grey",       type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Draw 1, Gain 1 Æ",              aetherValue: 0, role: "Starter draw/flow",    qty: 3 },
  { name: "Wispform Surge",          type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Advance another Spell for free", aetherValue: 0, role: "Chain enabler",        qty: 1 },
  { name: "Greyfire Bloom",          type: "SPELL",   cost: 1, pip: 1, text: "On Resolve: Advance another Spell for free", aetherValue: 0, role: "Aggro chain",          qty: 1 },
  { name: "Echoing Reservoir",       type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 1",                     aetherValue: 2, role: "Aether generator",     qty: 2 },
  { name: "Dormant Catalyst",        type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 2",                     aetherValue: 1, role: "Ramp starter",         qty: 1 },
  { name: "Ashen Focus",             type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 1 and Draw 1",          aetherValue: 1, role: "Draw + Aether hybrid", qty: 1 },
  { name: "Surge of Ash",            type: "INSTANT", cost: 1, pip: 0, text: "Target Spell advances 1 step free",         aetherValue: 0, role: "Tempo burst",          qty: 1 },
  { name: "Veil of Dust",            type: "INSTANT", cost: 1, pip: 0, text: "Prevent 1 damage or negate a hostile Instant", aetherValue: 0, role: "Reactive defense",  qty: 1 },
  { name: "Glyph of Remnant Light",  type: "GLYPH",   cost: 0, pip: 0, text: "When a Spell resolves → Gain 1 Æ",          aetherValue: 0, role: "Passive economy",      qty: 1 },
  { name: "Glyph of Returning Echo", type: "GLYPH",   cost: 0, pip: 0, text: "When you Channel Aether → Draw 1 card",     aetherValue: 0, role: "Draw engine",          qty: 1 },
];

// Aetherflow deck (river-style market)
const AETHERFLOW_LIST = [
  { name: "Surge of Cinders",         type: "INSTANT", cost: 2, pip: 0, text: "Deal 2 damage to any target",                                              aetherValue: 0, role: "Early aggression",  qty: 1 },
  { name: "Pulse Feedback",           type: "INSTANT", cost: 3, pip: 0, text: "Advance all Spells you control by 1",                                      aetherValue: 0, role: "Momentum burst",    qty: 1 },
  { name: "Refracted Will",           type: "INSTANT", cost: 2, pip: 0, text: "Counter an Instant or negate a Glyph trigger",                             aetherValue: 0, role: "Defensive answer",  qty: 1 },
  { name: "Aether Impel",             type: "INSTANT", cost: 4, pip: 0, text: "Gain 3 Æ this turn",                                                       aetherValue: 0, role: "Temporary boost",   qty: 1 },
  { name: "Cascade Insight",          type: "INSTANT", cost: 3, pip: 0, text: "Draw 2 cards, then discard 1",                                             aetherValue: 0, role: "Hand filter",       qty: 1 },
  { name: "Resonant Chorus",          type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Gain 2 Æ and Channel 1",                                       aetherValue: 1, role: "Hybrid economy",    qty: 1 },
  { name: "Emberline Pulse",          type: "SPELL",   cost: 1, pip: 1, text: "On Resolve: Deal 2 damage and Draw 1",                                      aetherValue: 0, role: "Core tempo",        qty: 1 },
  { name: "Fractured Memory",         type: "SPELL",   cost: 0, pip: 2, text: "On Resolve: Draw 2 cards",                                                 aetherValue: 0, role: "Card advantage",    qty: 1 },
  { name: "Obsidian Vault",           type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 2 and Gain 1 Æ",                                       aetherValue: 1, role: "Long-term economy", qty: 1 },
  { name: "Mirror Cascade",           type: "SPELL",   cost: 1, pip: 1, text: "On Resolve: Copy the next Instant you play this turn",                      aetherValue: 0, role: "Combo tool",        qty: 1 },
  { name: "Sanguine Flow",            type: "SPELL",   cost: 2, pip: 1, text: "On Resolve: Lose 1 Vitality, Gain 3 Æ",                                     aetherValue: 0, role: "Risk/reward burst", qty: 1 },
  { name: "Glyph of Withering Light", type: "GLYPH",   cost: 0, pip: 0, text: "When an opponent plays a Spell → They lose 1 Æ",                           aetherValue: 0, role: "Tempo tax",         qty: 1 },
  { name: "Glyph of Vigilant Echo",   type: "GLYPH",   cost: 0, pip: 0, text: "At end of your turn → Channel 1",                                          aetherValue: 0, role: "Slow engine",       qty: 1 },
  { name: "Glyph of Buried Heat",     type: "GLYPH",   cost: 0, pip: 0, text: "When you discard a card for Æ → Gain 1 extra Æ",                           aetherValue: 0, role: "Economy reward",    qty: 1 },
  { name: "Glyph of Soulglass",       type: "GLYPH",   cost: 0, pip: 0, text: "When you buy a card from Aether Flow → Draw 1 card",                        aetherValue: 0, role: "Deck-growth loop",  qty: 1 },
];

function expandList(list) {
  const out = [];
  list.forEach(c => {
    for (let i = 0; i < (c.qty || 1); i++) {
      out.push({
        id: uid(),
        name: c.name,
        type: c.type,         // "SPELL" | "INSTANT" | "GLYPH"
        cost: c.cost || 0,    // resource to play
        pip: c.pip || 0,      // number of stages to resolve (pips)
        text: c.text || "",
        aetherValue: c.aetherValue || 0, // gained when discarding
        role: c.role || "",
        price: c.cost || 0,   // for market labeling fallback
        // NEW: progress field so the UI can update pips immediately
        progress: 0
      });
    }
  });
  return out;
}

/////////////////////////////
// State init / serialization
/////////////////////////////

export function initState(seed) {
  // Build decks
  const playerDeck = shuffle(expandList(BASE_DECK_LIST));
  const aiDeck     = shuffle(expandList(BASE_DECK_LIST));
  const flowDraw   = shuffle(expandList(AETHERFLOW_LIST));

  // Starting hands
  const handP = [];
  const handAI = [];
  for (let i = 0; i < STARTING_HAND && playerDeck.length; i++) handP.push(playerDeck.shift());
  for (let i = 0; i < STARTING_HAND && aiDeck.length; i++)     handAI.push(aiDeck.shift());

  // Flow slots: 5 slots, only slot 0 reveals at game start
  const flow = [null, null, null, null, null];
  // reveal one into slot 0 if available
  if (flowDraw.length) flow[0] = { ...flowDraw.shift() };

  return {
    turn: 1,
    activePlayer: "player",
    flow,                 // array of 5 or nulls/card objects
    flowDraw,             // facedown river deck
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deck: playerDeck, hand: handP, discard: [],
        slots: [
          { hasCard:false, card:null }, // spell
          { hasCard:false, card:null }, // spell
          { hasCard:false, card:null }, // spell
          { isGlyph:true, hasCard:false, card:null }, // glyph
        ],
        weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"./weaver_aria.jpg" },
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
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"./weaver_morr.jpg" },
      }
    }
  };
}

export function serializePublic(state) {
  const s = clone(state);
  // add price rails for flow (derived from position)
  s.flow = (s.flow || []).map((c, idx) => c ? ({...c, price: FLOW_COSTS[idx]}) : null);
  // reduce deck arrays to counts for UI if you prefer (left as full arrays for flexibility)
  s.players.player.deckCount = s.players.player.deck.length;
  s.players.ai.deckCount     = s.players.ai.deck.length;
  return s;
}

/////////////////////////////
// Turn / Flow mechanics
/////////////////////////////

// Start of active player's turn:
// - reveal into slot 0 if empty (river head)
export function startTurn(state) {
  if (!state) return state;
  const hd = state.flowDraw || [];
  if (!state.flow) state.flow = [null,null,null,null,null];

  if (!state.flow[0] && hd.length) {
    state.flow[0] = { ...hd.shift() };
  }
  return state;
}

// End of turn:
// - river shift happens ONLY when the PLAYER ends their turn
// - swap active player; auto-start next player's turn with a reveal if needed
export function endTurn(state) {
  if (!state?.flow) return state;

  const endingPlayer = state.activePlayer;

  // Shift the river only when the player ends their turn
  if (endingPlayer === "player") {
    for (let i = state.flow.length - 1; i > 0; i--) {
      state.flow[i] = state.flow[i] || state.flow[i - 1] ? state.flow[i - 1] : null;
    }
    state.flow[0] = null;
  }

  // Switch active player
  state.activePlayer = (state.activePlayer === "player") ? "ai" : "player";
  if (state.activePlayer === "player") state.turn += 1;

  // Reveal at the start of whoever's new turn
  startTurn(state);
  return state;
}

/////////////////////////////
// Player actions
/////////////////////////////

// Discard from hand for aether (gain equals card.aetherValue)
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
  }
  return state;
}

// Play SPELL from hand into a spell slot (0..2)
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

  P.hand.splice(i,1);
  // Defensive: ensure progress field exists and resets when entering play
  if (typeof card.progress !== "number") card.progress = 0;
  card.progress = 0;

  slot.card = card;
  slot.hasCard = true;
  return state;
}

// Set GLYPH from hand into glyph slot (index 3)
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

  P.hand.splice(i,1);
  slot.card = card;
  slot.hasCard = true;
  return state;
}

// Buy from the Aetherflow into discard if enough Æ
export function buyFromFlow(state, playerId, flowIndex){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (!state.flow) throw new Error("no flow");
  const card = state.flow[flowIndex];
  if (!card) throw new Error("no card at flow index");
  const price = FLOW_COSTS[flowIndex] || 0;
  if ((P.aether || 0) < price) throw new Error("Not enough Æ");

  P.aether -= price;
  // into discard
  P.discard.push(card);
  // remove from flow (slot stays empty until future shifts/reveals)
  state.flow[flowIndex] = null;
  return state;
}

/////////////////////////////
// Draw helpers (for future)
/////////////////////////////

export function drawOne(state, playerId){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (!P.deck.length) {
    // shuffle discard into deck if empty
    if (P.discard.length){
      P.deck = shuffle(P.discard.splice(0));
    }
  }
  if (!P.deck.length) return state; // no cards to draw
  P.hand.push(P.deck.shift());
  return state;
}

export function drawN(state, playerId, n){
  for (let i=0;i<n;i++) drawOne(state, playerId);
  return state;
}

/////////////////////////////
// Optional: minimal AI stub
/////////////////////////////

export function aiTakeTurn(state){
  // Placeholder: AI currently just ends turn.
  // (Hook in your future logic here.)
  return state;
}
