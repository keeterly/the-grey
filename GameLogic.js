// v2.54 — Base deck & Aetherflow definitions with:
// - aetherValue = "Aether" column (discard value)
// - pip = number of advance stages for SPELLS (or null/0 for none)

const FLOW_COSTS = [4, 3, 3, 2, 2];
const STARTING_VITALITY = 5;

/* ------------ Helpers ------------ */
function mk(id, name, type, { playCost = 0, pip = null, effect = "", aetherValue = 0 } = {}) {
  // Note: We keep playCost and pip for future mechanics/UX
  // Text uses "Æ" where appropriate; UI will swap with an inline gem
  return {
    id, name, type,
    playCost, pip, aetherValue,
    text: effect
  };
}
function dup(baseCard, n) {
  return Array.from({ length: n }, (_, i) => ({ ...baseCard, id: `${baseCard.id}#${i + 1}` }));
}

/* ------------ Shared Starting Deck (10 cards) ------------ */
/*
| Name                    | Type    | Cost | Pip | Effect                                       | Aether | Qty |
| Pulse of the Grey       | Spell   | 0    | 1   | On Resolve: Draw 1, Gain 1 Aether            | 0      | 3   |
| Wispform Surge          | Spell   | 0    | 1   | On Resolve: Advance another Spell for free   | 0      | 1   |
| Greyfire Bloom          | Spell   | 1    | 1   | On Resolve: Advance another Spell for free   | 0      | 1   |
| Echoing Reservoir       | Spell   | 0    | 1   | On Resolve: Channel 1                        | 2      | 2   |
| Dormant Catalyst        | Spell   | 0    | 1   | On Resolve: Channel 2                        | 1      | 1   |
| Ashen Focus             | Spell   | 0    | 1   | On Resolve: Channel 1 and Draw 1             | 1      | 1   |
| Surge of Ash            | Instant | 1    | —   | Target Spell advances 1 step free            | 0      | 1   |
| Veil of Dust            | Instant | 1    | —   | Prevent 1 damage or negate a hostile Instant | 0      | 1   |
| Glyph of Remnant Light  | Glyph   | 0    | —   | When a Spell resolves → Gain 1 Aether        | 0      | 1   |
| Glyph of Returning Echo | Glyph   | 0    | —   | When you Channel Aether → Draw 1 card        | 0      | 1   |
*/
function starterDeck() {
  const PULSE = mk("c_pulse", "Pulse of the Grey", "SPELL", {
    playCost: 0, pip: 1, aetherValue: 0,
    effect: "On resolve: Draw 1, gain Æ1."
  });
  const WISP = mk("c_wisp", "Wispform Surge", "SPELL", {
    playCost: 0, pip: 1, aetherValue: 0,
    effect: "On resolve: Advance another spell 1 (free)."
  });
  const BLOOM = mk("c_bloom", "Greyfire Bloom", "SPELL", {
    playCost: 1, pip: 1, aetherValue: 0,
    effect: "On resolve: Advance another spell 1 (free)."
  });
  const ECHO = mk("c_echo", "Echoing Reservoir", "SPELL", {
    playCost: 0, pip: 1, aetherValue: 2,
    effect: "On resolve: Channel 1."
  });
  const CATAL = mk("c_catal", "Dormant Catalyst", "SPELL", {
    playCost: 0, pip: 1, aetherValue: 1,
    effect: "On resolve: Channel 2."
  });
  const ASHEN = mk("c_ashen", "Ashen Focus", "SPELL", {
    playCost: 0, pip: 1, aetherValue: 1,
    effect: "On resolve: Channel 1, draw 1."
  });
  const SURGE = mk("c_surge", "Surge of Ash", "INSTANT", {
    playCost: 1, pip: null, aetherValue: 0,
    effect: "Target spell advances 1 step (free)."
  });
  const VEIL = mk("c_veil", "Veil of Dust", "INSTANT", {
    playCost: 1, pip: null, aetherValue: 0,
    effect: "Prevent 1 damage or negate a hostile instant."
  });
  const GL1 = mk("g_light", "Glyph of Remnant Light", "GLYPH", {
    playCost: 0, pip: null, aetherValue: 0,
    effect: "When a spell resolves: gain Æ1."
  });
  const GL2 = mk("g_echo", "Glyph of Returning Echo", "GLYPH", {
    playCost: 0, pip: null, aetherValue: 0,
    effect: "When you channel Aether: draw 1."
  });

  return [
    ...dup(PULSE, 3),
    WISP,
    BLOOM,
    ...dup(ECHO, 2),
    CATAL,
    ASHEN,
    SURGE,
    VEIL,
    GL1,
    GL2
  ];
}

/* ------------ Aetherflow Pool (examples kept from prior step) ------------ */
function marketPool() {
  return [
    mk("m_cinders","Surge of Cinders","INSTANT",{playCost:2, pip:null, aetherValue:0, effect:"Deal 2 damage to any target."}),
    mk("m_feedback","Pulse Feedback","INSTANT",{playCost:3, pip:null, aetherValue:0, effect:"Advance all spells you control by 1."}),
    mk("m_refract","Refracted Will","INSTANT",{playCost:2, pip:null, aetherValue:0, effect:"Counter an instant or negate a glyph trigger."}),
    mk("m_impel","Aether Impel","INSTANT",{playCost:4, pip:null, aetherValue:0, effect:"Gain Æ3 this turn."}),
    mk("m_cascade","Cascade Insight","INSTANT",{playCost:3, pip:null, aetherValue:0, effect:"Draw 2 cards, then discard 1."}),

    mk("m_resonant","Resonant Chorus","SPELL",{playCost:0, pip:1, aetherValue:1, effect:"On resolve: Gain Æ2 and Channel 1."}),
    mk("m_ember","Emberline Pulse","SPELL",{playCost:1, pip:1, aetherValue:0, effect:"On resolve: Deal 2 damage and draw 1."}),
    mk("m_fracture","Fractured Memory","SPELL",{playCost:0, pip:2, aetherValue:0, effect:"On resolve: Draw 2 cards."}),
    mk("m_vault","Obsidian Vault","SPELL",{playCost:0, pip:1, aetherValue:1, effect:"On resolve: Channel 2 and gain Æ1."}),
    mk("m_mirror","Mirror Cascade","SPELL",{playCost:1, pip:1, aetherValue:0, effect:"On resolve: Copy the next instant you play this turn."}),
    mk("m_sanguine","Sanguine Flow","SPELL",{playCost:2, pip:1, aetherValue:0, effect:"On resolve: Lose 1 Vitality, gain Æ3."}),

    mk("g_wither","Glyph of Withering Light","GLYPH",{playCost:0, pip:null, aetherValue:0, effect:"When an opponent plays a spell: they lose Æ1."}),
    mk("g_vigil","Glyph of Vigilant Echo","GLYPH",{playCost:0, pip:null, aetherValue:0, effect:"End of your turn: Channel 1."}),
    mk("g_buried","Glyph of Buried Heat","GLYPH",{playCost:0, pip:null, aetherValue:0, effect:"When you discard a card for Æ: gain +1 extra Æ."}),
    mk("g_soul","Glyph of Soulglass","GLYPH",{playCost:0, pip:null, aetherValue:0, effect:"When you buy from Aether Flow: draw 1."}),
  ];
}

/* ------------ State Init ------------ */
export function initState() {
  const deck = starterDeck();
  const hand = deck.slice(0, 5);
  const remaining = deck.slice(5);

  const pool = marketPool();
  const flowDeck = [];
  for (let i = 0; i < 80; i++) {
    const b = pool[i % pool.length];
    flowDeck.push({ ...b, id: `${b.id}_${i}` });
  }

  return {
    turn: 1,
    activePlayer: "player",
    flowSlots: [null, null, null, null, null],
    flowDeck,
    lastFlowDrop: null,
    lastBoughtCard: null,
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: remaining.length,
        hand,
        discardCount: 0,
        slots: [
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { isGlyph: true, hasCard: false, card: null }
        ],
        weaver: { id: "aria", name: "Aria, Runesurge Adept", stage: 0, portrait: "./weaver_aria.jpg" }
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: [],
        discardCount: 0,
        slots: [
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { isGlyph: true, hasCard: false, card: null }
        ],
        weaver: { id: "morr", name: "Morr, Gravecurrent Binder", stage: 0, portrait: "./weaver_morr.jpg" }
      }
    }
  };
}

export function serializePublic(state) {
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flowSlots: state.flowSlots,
    lastFlowDrop: state.lastFlowDrop,
    lastBoughtCard: state.lastBoughtCard,
    player: state.players?.player,
    ai: state.players?.ai
  };
}

/* ------------ River helpers ------------ */
const slotCost = i => FLOW_COSTS[i] ?? 0;
function drawFlow(state) { return state.flowDeck.shift() || null; }

export function startTurn(state) {
  if (!state.flowSlots[0]) state.flowSlots[0] = drawFlow(state);
  state.lastFlowDrop = null;
  return state;
}
export function endTurn(state) {
  state.lastFlowDrop = state.flowSlots[4] || null;
  for (let i = state.flowSlots.length - 1; i >= 1; i--) {
    state.flowSlots[i] = state.flowSlots[i - 1];
  }
  state.flowSlots[0] = null;
  state.turn += 1;
  return state;
}

/* ------------ Draw / Discard stubs ------------ */
export function drawNewHand(state, n = 5) {
  const src = starterDeck();
  state.players.player.hand = src.slice(0, n).map((c, i) => ({ ...c, id: `draw_${state.turn}_${i}_${c.id}` }));
  return state;
}
export function discardHand(state) {
  const P = state.players.player;
  P.discardCount += P.hand.length;
  P.hand = [];
  return state;
}

/* ------------ Actions ------------ */
export function playCardToSpellSlot(state, playerId, cardId, slotIndex) {
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (slotIndex < 0 || slotIndex > 2) throw new Error("spell slot index 0..2");
  const slot = P.slots[slotIndex];
  if (slot.hasCard) throw new Error("slot occupied");

  const i = P.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new Error("card not in hand");
  const card = P.hand[i];
  if (card.type !== "SPELL") throw new Error("only SPELL can be played to spell slots");

  P.hand.splice(i, 1);
  slot.card = card;
  slot.hasCard = true;
  return state;
}

export function setGlyphFromHand(state, playerId, cardId) {
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  const slot = P.slots[3];
  if (!slot?.isGlyph) throw new Error("no glyph slot");
  if (slot.hasCard) throw new Error("glyph slot occupied");

  const i = P.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new Error("card not in hand");
  const card = P.hand[i];
  if (card.type !== "GLYPH") throw new Error("only GLYPH may be set");

  P.hand.splice(i, 1);
  slot.card = card;
  slot.hasCard = true;
  return state;
}

export function buyFromFlow(state, playerId, flowIndex) {
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  const card = state.flowSlots?.[flowIndex];
  if (!card) throw new Error("no card at flow index");
  const cost = slotCost(flowIndex);
  if ((P.aether | 0) < cost) throw new Error("Not enough Æ");

  P.aether = (P.aether | 0) - cost;
  P.discardCount += 1;
  state.lastBoughtCard = { ...card };

  for (let i = flowIndex; i > 0; i--) {
    state.flowSlots[i] = state.flowSlots[i - 1];
  }
  state.flowSlots[0] = null;
  return state;
}
