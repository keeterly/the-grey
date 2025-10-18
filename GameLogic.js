// GameLogic.js
// v2.61 (v2.57 base + spotlight reveal + discard-for-Aether + non-destructive enrich events)

/////////////////////////////
// Constants & Helpers
/////////////////////////////

export const FLOW_COSTS = [4, 3, 3, 2, 2];
export const STARTING_HAND = 5;
export const STARTING_VITALITY = 5;

export const AE_GEM_SVG =
  '<svg class="gem-inline" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M12 2l6 6-6 14-6-14 6-6z" fill="currentColor"/></svg>';

export function withAetherText(s = "") {
  return String(s).replaceAll("Æ", AE_GEM_SVG);
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

// small internal event queue so UI can “spotlight” things that happened
function pushEvt(state, e){
  (state._events ||= []).push(e);
}

/////////////////////////////
// Card Pools (Data)
/////////////////////////////

const BASE_DECK_LIST = [
  { name: "Pulse of the Grey",       type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Draw 1, Gain 1 Æ",           aetherValue: 0, role: "Starter draw/flow",    qty: 3 },
  { name: "Wispform Surge",          type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Advance another Spell for free", aetherValue: 0, role: "Chain enabler",    qty: 1 },
  { name: "Greyfire Bloom",          type: "SPELL",   cost: 1, pip: 1, text: "On Resolve: Advance another Spell for free", aetherValue: 0, role: "Aggro chain",      qty: 1 },
  { name: "Echoing Reservoir",       type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 1",                  aetherValue: 2, role: "Aether generator",   qty: 2 },
  { name: "Dormant Catalyst",        type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 2",                  aetherValue: 1, role: "Ramp starter",       qty: 1 },
  { name: "Ashen Focus",             type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 1 and Draw 1",       aetherValue: 1, role: "Draw + Aether",      qty: 1 },
  { name: "Surge of Ash",            type: "INSTANT", cost: 1, pip: 0, text: "Target Spell advances 1 step free",      aetherValue: 0, role: "Tempo burst",        qty: 1 },
  { name: "Veil of Dust",            type: "INSTANT", cost: 1, pip: 0, text: "Prevent 1 damage or negate a hostile Instant", aetherValue: 0, role: "Defense",       qty: 1 },
  { name: "Glyph of Remnant Light",  type: "GLYPH",   cost: 0, pip: 0, text: "When a Spell resolves → Gain 1 Æ",       aetherValue: 0, role: "Passive economy",    qty: 1 },
  { name: "Glyph of Returning Echo", type: "GLYPH",   cost: 0, pip: 0, text: "When you Channel Aether → Draw 1 card",  aetherValue: 0, role: "Draw engine",        qty: 1 },
];

const AETHERFLOW_LIST = [
  { name: "Surge of Cinders",         type: "INSTANT", cost: 2, pip: 0, text: "Deal 2 damage to any target", aetherValue: 0, role: "Aggression", qty: 1 },
  { name: "Pulse Feedback",           type: "INSTANT", cost: 3, pip: 0, text: "Advance all Spells you control by 1", aetherValue: 0, role: "Momentum", qty: 1 },
  { name: "Refracted Will",           type: "INSTANT", cost: 2, pip: 0, text: "Counter an Instant or negate a Glyph trigger", aetherValue: 0, role: "Answer", qty: 1 },
  { name: "Aether Impel",             type: "INSTANT", cost: 4, pip: 0, text: "Gain 3 Æ this turn", aetherValue: 0, role: "Boost", qty: 1 },
  { name: "Cascade Insight",          type: "INSTANT", cost: 3, pip: 0, text: "Draw 2 cards, then discard 1", aetherValue: 0, role: "Filter", qty: 1 },
  { name: "Resonant Chorus",          type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Gain 2 Æ and Channel 1", aetherValue: 1, role: "Hybrid", qty: 1 },
  { name: "Emberline Pulse",          type: "SPELL",   cost: 1, pip: 1, text: "On Resolve: Deal 2 damage and Draw 1", aetherValue: 0, role: "Tempo", qty: 1 },
  { name: "Fractured Memory",         type: "SPELL",   cost: 0, pip: 2, text: "On Resolve: Draw 2 cards", aetherValue: 0, role: "Advantage", qty: 1 },
  { name: "Obsidian Vault",           type: "SPELL",   cost: 0, pip: 1, text: "On Resolve: Channel 2 and Gain 1 Æ", aetherValue: 1, role: "Economy", qty: 1 },
  { name: "Mirror Cascade",           type: "SPELL",   cost: 1, pip: 1, text: "On Resolve: Copy the next Instant you play this turn", aetherValue: 0, role: "Combo", qty: 1 },
  { name: "Sanguine Flow",            type: "SPELL",   cost: 2, pip: 1, text: "On Resolve: Lose 1 Vitality, Gain 3 Æ", aetherValue: 0, role: "Risk", qty: 1 },
  { name: "Glyph of Withering Light", type: "GLYPH",   cost: 0, pip: 0, text: "When an opponent plays a Spell → They lose 1 Æ", aetherValue: 0, role: "Tax", qty: 1 },
  { name: "Glyph of Vigilant Echo",   type: "GLYPH",   cost: 0, pip: 0, text: "At end of your turn → Channel 1", aetherValue: 0, role: "Engine", qty: 1 },
  { name: "Glyph of Buried Heat",     type: "GLYPH",   cost: 0, pip: 0, text: "When you discard a card for Æ → Gain 1 extra Æ", aetherValue: 0, role: "Economy", qty: 1 },
  { name: "Glyph of Soulglass",       type: "GLYPH",   cost: 0, pip: 0, text: "When you buy a card from Aether Flow → Draw 1 card", aetherValue: 0, role: "Growth", qty: 1 },
];

function expandList(list) {
  const out = [];
  list.forEach(c => {
    for (let i = 0; i < (c.qty || 1); i++) {
      out.push({
        id: uid(),
        name: c.name,
        type: c.type,
        cost: c.cost || 0,
        pip: c.pip || 0,
        text: c.text || "",
        aetherValue: c.aetherValue || 0,
        role: c.role || "",
        price: c.cost || 0,
        progress: 0,
      });
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

  const flow = [null, null, null, null, null];
  if (flowDraw.length) flow[0] = { ...flowDraw.shift() };

  return {
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
  s.flow = (s.flow || []).map((c, idx) => c ? ({...c, price: FLOW_COSTS[idx]}) : null);
  s.players.player.deckCount    = s.players.player.deck.length;
  s.players.player.discardCount = s.players.player.discard.length;
  s.players.ai.deckCount        = s.players.ai.deck.length;
  s.players.ai.discardCount     = s.players.ai.discard.length;
  return s;
}

/////////////////////////////
// Turn / Flow mechanics
/////////////////////////////

export function startTurn(state) {
  if (!state) return state;
  const hd = state.flowDraw || [];
  if (!state.flow) state.flow = [null,null,null,null,null];
  if (!state.flow[0] && hd.length) {
    state.flow[0] = { ...hd.shift() };
    // Spotlight: reveal into Aetherflow
    try {
      const c = state.flow[0];
      if (c) {
        pushEvt(state, {
          t: "reveal",
          source: "flow",
          side: state.activePlayer,
          flowIndex: 0,
          cardId: c.id,
          cardType: c.type,
          cardData: { ...c }
        });
      }
    } catch(_) {}
  }
  return state;
}

// END TURN
export function endTurn(state) {
  if (!state?.flow) return state;
  const endingPlayer = state.activePlayer;
  const P = state.players[endingPlayer];

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

  if (endingPlayer === "player") {
    // Slide cards right into empty slots; do not overwrite occupied slots.
    for (let i = state.flow.length - 1; i > 0; i--) {
      if (!state.flow[i] && state.flow[i - 1]) {
        state.flow[i] = state.flow[i - 1];
        state.flow[i - 1] = null;
      }
    }
    state.flow[0] = null;
  }

  state.activePlayer = (state.activePlayer === "player") ? "ai" : "player";
  if (state.activePlayer === "player") state.turn += 1;

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
  }
  // Spotlight discard-for-Aether
  try {
    pushEvt(state, {
      t: "resolved",
      source: "discard-aether",
      side: playerId,
      cardId: card.id,
      cardType: card.type,
      cardData: { ...card }
    });
  } catch(_) {}
  return state;
}

// Play Spell to slot
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
  card.progress = 0;
  slot.card = card;
  slot.hasCard = true;
  return state;
}

// Set Glyph to slot 3
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

// Buy → discard
export function buyFromFlow(state, playerId, flowIndex){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (!state.flow) throw new Error("no flow");
  const card = state.flow[flowIndex];
  if (!card) throw new Error("no card at flow index");
  const price = FLOW_COSTS[flowIndex] || 0;
  if ((P.aether || 0) < price) throw new Error("Not enough Æ");

  P.aether -= price;
  P.discard.push(card);
  state.flow[flowIndex] = null;

  pushEvt(state, {
    t: "resolved",
    source: "buy",
    side: playerId,
    cardId: card.id,
    cardType: card.type,
    flowIndex,
    cardData: { ...card }
  });
  return state;
}

/////////////////////////////
// Resolving helpers
/////////////////////////////

function restockIfEmpty(P){
  if (!P.deck.length && P.discard.length){
    shuffle(P.discard);
    P.deck = P.discard.splice(0);
  }
}

export function drawOne(state, playerId){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  restockIfEmpty(P);
  if (!P.deck.length) return state;
  P.hand.push(P.deck.shift());
  return state;
}

export function drawN(state, playerId, n){
  for (let i=0;i<n;i++) drawOne(state, playerId);
  return state;
}

// Advance spell
export function advanceSpell(state, playerId, slotIndex, steps = 1){
  const P = state.players[playerId];
  const slot = P?.slots?.[slotIndex];
  const c = slot?.card;
  if (!slot?.hasCard || !c || c.type!=="SPELL") return state;

  c.progress = Math.max(0, (c.progress|0) + (steps|0));
  if ((c.progress|0) >= (c.pip|0)) {
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
  }
  return state;
}

// Resolve Instant
export function resolveInstantFromHand(state, playerId, cardId){
  const P = state.players[playerId];
  const i = P.hand.findIndex(c => c.id === cardId && c.type==="INSTANT");
  if (i < 0) return state;
  const card = P.hand.splice(i,1)[0];
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

// Drain UI events
export function drainEvents(state){
  const evts = (state._events||[]).splice(0);
  return evts;
}

export function aiTakeTurn(state){ return state; }

export function getStack(state, playerId, which){
  const P = state.players?.[playerId];
  if (!P) return [];
  if (which === "deck")    return clone(P.deck    || []);
  if (which === "discard") return clone(P.discard || []);
  if (which === "hand")    return clone(P.hand    || []);
  return [];
}
