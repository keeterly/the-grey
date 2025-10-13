// GameLogic.js — v2.5.1 active base deck (Player & AI)
// Works with your current index.js (drag-to-slot for SPELLS, drag GLYPH to glyph bay,
// discard for aether, buy from flow, end-turn draws, glyph triggers).

/** =========================
 * Types (informal, for ref)
 * Card: { id, name, type:'SPELL'|'INSTANT'|'GLYPH', aetherValue:number, text?:string, cost?:number }
 * Player: { vitality, aether, channeled, deck:Card[], discard:Card[], hand:Card[], slots[3], glyphSlot }
 * ========================= */

const FLOW_COSTS = [4, 3, 2, 2, 2];
const STARTING_VITALITY = 5;
const HAND_SIZE = 5;

/* -------------------------
   Card Database (Base Set)
   ------------------------- */

const CardsDB = {
  // --- Spells of Utility ---
  pulseGrey: () => ({
    id: 'c:pulse', name: 'Pulse of the Grey', type: 'SPELL',
    cost: 0, aetherValue: 0,
    text: 'Resolve: Draw 1. Gain 🜂1.',
  }),
  wispform: () => ({
    id: 'c:wisp', name: 'Wispform Surge', type: 'SPELL',
    cost: 0, aetherValue: 0,
    text: 'Resolve: Advance another Spell 1 (free). (Stub: grants +🜂1 here.)',
  }),
  greyfire: () => ({
    id: 'c:greyfire', name: 'Greyfire Bloom', type: 'SPELL',
    cost: 1, aetherValue: 0,
    text: 'Resolve: Deal 1 damage to an enemy.',
  }),

  // --- Channelers ---
  echoing: () => ({
    id: 'c:echo', name: 'Echoing Reservoir', type: 'SPELL',
    cost: 0, aetherValue: 2,
    text: 'Resolve: Channel 1 (gain ◇1). Discard for 🜂2.',
  }),
  catalyst: () => ({
    id: 'c:catalyst', name: 'Dormant Catalyst', type: 'SPELL',
    cost: 0, aetherValue: 1,
    text: 'Resolve: Channel 2 (gain ◇2). Discard for 🜂1.',
  }),
  ashen: () => ({
    id: 'c:ashen', name: 'Ashen Focus', type: 'SPELL',
    cost: 0, aetherValue: 1,
    text: 'Resolve: Channel 1 (◇1) and Draw 1. Discard for 🜂1.',
  }),

  // --- Instants ---
  surgeAsh: () => ({
    id: 'c:surge', name: 'Surge of Ash', type: 'INSTANT',
    cost: 1, aetherValue: 0,
    text: 'Target Spell advances 1 (free). (UI: no target yet)',
  }),
  veilDust: () => ({
    id: 'c:veil', name: 'Veil of Dust', type: 'INSTANT',
    cost: 1, aetherValue: 0,
    text: 'Prevent 1 damage or counter an Instant. (UI: no stack yet)',
  }),

  // --- Glyphs ---
  glyphRemnant: () => ({
    id: 'g:remnant', name: 'Glyph of Remnant Light', type: 'GLYPH',
    cost: 0, aetherValue: 0,
    text: 'When a Spell you control resolves → Gain 🜂1.',
  }),
  glyphEcho: () => ({
    id: 'g:echo', name: 'Glyph of Returning Echo', type: 'GLYPH',
    cost: 0, aetherValue: 0,
    text: 'When you Channel Aether → Draw 1.',
  }),
};

/* Helper to clone card instances */
function make(idFactory, count) {
  return Array.from({ length: count }, () => idFactory());
}

/* The 10-card starter deck for both players */
function buildStarterDeck() {
  return [
    ...make(CardsDB.pulseGrey, 1),   // Pulse of the Grey (x1)
    ...make(CardsDB.wispform, 1),    // Wispform Surge (x1)
    ...make(CardsDB.greyfire, 1),    // Greyfire Bloom (x1)
    ...make(CardsDB.echoing, 1),     // Echoing Reservoir (x1)
    ...make(CardsDB.catalyst, 1),    // Dormant Catalyst (x1)
    ...make(CardsDB.ashen, 1),       // Ashen Focus (x1)
    ...make(CardsDB.surgeAsh, 1),    // Surge of Ash (x1)
    ...make(CardsDB.veilDust, 1),    // Veil of Dust (x1)
    ...make(CardsDB.glyphRemnant, 1),// Glyph of Remnant Light (x1)
    ...make(CardsDB.glyphEcho, 1),   // Glyph of Returning Echo (x1)
  ];
}

/* -------------------------
   Flow (market) seed
   ------------------------- */
function mkFlowCard(id, name, type, price, text = '') {
  return { id, name, type, price, aetherValue: 0, text };
}

function initialFlow() {
  return [
    mkFlowCard('f:resChorus', 'Resonant Chorus', 'SPELL',  FLOW_COSTS[0], 'Resolve: Gain 🜂2 and ◇1.'),
    mkFlowCard('f:pulseFb',   'Pulse Feedback',  'INSTANT',FLOW_COSTS[1], 'Advance all your Spells by 1.'),
    mkFlowCard('f:refract',   'Refracted Will',  'GLYPH',  FLOW_COSTS[2], 'Counter an Instant or negate a Glyph trigger.'),
    mkFlowCard('f:cascade',   'Cascade Insight', 'INSTANT',FLOW_COSTS[3], 'Draw 2, then discard 1.'),
    mkFlowCard('f:obsVault',  'Obsidian Vault',  'SPELL',  FLOW_COSTS[4], 'Resolve: ◇2 and gain 🜂1.'),
  ];
}

/* -------------------------
   RNG + Shuffle
   ------------------------- */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* -------------------------
   State construction
   ------------------------- */
function mkPlayer(id, name, portrait, rng) {
  const deck = shuffle(buildStarterDeck(), rng);
  const hand = [];
  const discard = [];

  // draw 5
  drawNFromDeck({ deck, hand, discard }, HAND_SIZE, rng);

  return {
    vitality: STARTING_VITALITY,
    aether: 0,        // 🜂 (temp)
    channeled: 0,     // ◇ (persist)
    deck,
    discard,
    hand,
    slots: [
      { hasCard: false, card: null },
      { hasCard: false, card: null },
      { hasCard: false, card: null },
    ],
    glyphSlot: { hasGlyph: false, card: null },
    weaver: { id, name, stage: 0, portrait },
  };
}

export function initState(opts = {}) {
  const rng = mulberry32(opts.seed ?? 424242);

  return {
    rng,
    turn: 1,
    activePlayer: 'player',

    flow: initialFlow(),

    players: {
      player: mkPlayer('aria', 'Aria, Runesurge Adept', 'weaver_aria.jpg', rng),
      ai:     mkPlayer('morr', 'Morr, Gravecurrent Binder', 'weaver_morr.jpg', rng),
    },
  };
}

export function serializePublic(state) {
  const P = state.players.player;
  const A = state.players.ai;
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: {
      vitality: P.vitality,
      aether: P.aether,
      channeled: P.channeled,
      deckCount: P.deck.length,
      hand: P.hand.map(toPublicCard),
      discardCount: P.discard.length,
      slots: P.slots.map(s => ({ hasCard: s.hasCard, card: s.card ? toPublicCard(s.card) : null })),
      glyphSlot: { hasGlyph: P.glyphSlot.hasGlyph, card: P.glyphSlot.card ? toPublicCard(P.glyphSlot.card) : null },
      weaver: P.weaver,
    },
    ai: {
      vitality: A.vitality,
      aether: A.aether,
      channeled: A.channeled,
      deckCount: A.deck.length,
      hand: [], // hidden
      discardCount: A.discard.length,
      slots: A.slots.map(s => ({ hasCard: s.hasCard, card: s.card ? toPublicCard(s.card) : null })),
      glyphSlot: { hasGlyph: A.glyphSlot.hasGlyph, card: A.glyphSlot.card ? toPublicCard(A.glyphSlot.card) : null },
      weaver: A.weaver,
    },
  };
}

function toPublicCard(c) {
  return { id: c.id, name: c.name, type: c.type, aetherValue: c.aetherValue ?? 0, text: c.text, cost: c.cost };
}

/* -------------------------
   Reducer + Rules Hooks
   ------------------------- */
export function reducer(state, action) {
  switch (action.type) {
    case 'START_TURN': {
      state.activePlayer = action.player || 'player';
      return state;
    }

    case 'END_TURN': {
      // Player end phase
      const P = state.players.player;
      // discard hand
      while (P.hand.length) P.discard.push(P.hand.shift());
      // lose temp aether
      P.aether = 0;

      // AI turn: trivial — discard hand, draw 5, maybe ping 1 dmg randomly if Greyfire appears
      aiTurn(state);

      // New turn for player: draw up to 5
      drawUpTo(state, 'player', HAND_SIZE);
      state.turn += 1;
      state.activePlayer = 'player';
      return state;
    }

    case 'BUY_FROM_FLOW': {
      const P = state.players[action.player];
      const c = state.flow[action.flowIndex];
      if (!P || !c) throw new Error('Invalid market index');
      const cost = c.price ?? 0;

      // pay from 🜂 then ◇
      const payTemp = Math.min(P.aether, cost);
      let remaining = cost - payTemp;
      P.aether -= payTemp;
      if (remaining > 0) {
        if (P.channeled < remaining) throw new Error('Not enough Aether');
        P.channeled -= remaining;
      }
      // goes to discard
      P.discard.push(c);

      // mark the slot as “bought” (optional visual)
      state.flow[action.flowIndex] = { ...c, id: c.id + ':bought' };
      return state;
    }

    case 'DISCARD_FOR_AETHER': {
      const P = state.players[action.player];
      const i = P.hand.findIndex(h => h.id === action.cardId);
      if (i < 0) throw new Error('Card not in hand');
      const card = P.hand.splice(i, 1)[0];
      P.discard.push(card);

      const add = Number(card.aetherValue || 0);
      if (add > 0) {
        P.aether += add;
        // channel trigger (glyph of returning echo)
        triggerGlyphs(state, action.player, 'CHANNEL');
      }
      return state;
    }

    case 'PLAY_CARD_TO_SLOT': {
      const P = state.players[action.player];
      const idx = action.slotIndex;
      if (idx < 0 || idx > 2) throw new Error('Spell slot index 0..2');
      const slot = P.slots[idx];
      if (slot.hasCard) throw new Error('Slot occupied');

      const i = P.hand.findIndex(h => h.id === action.cardId);
      if (i < 0) throw new Error('Card not in hand');
      const card = P.hand[i];
      if (card.type !== 'SPELL') throw new Error('Only SPELL can be played to spell slots');

      // pay open cost if any
      const cost = Number(card.cost || 0);
      if (cost > 0) {
        if (P.aether >= cost) {
          P.aether -= cost;
        } else {
          const need = cost - P.aether;
          if (P.channeled >= need) {
            P.channeled -= need; P.aether = 0;
          } else {
            throw new Error('Not enough Aether');
          }
        }
      }

      // place + resolve immediately (lightweight loop so glyphs work)
      P.hand.splice(i, 1);
      slot.card = card;
      slot.hasCard = true;

      resolveSpellNow(state, action.player, idx);
      return state;
    }

    case 'SET_GLYPH_FROM_HAND': {
      const P = state.players[action.player];
      if (P.glyphSlot.hasGlyph) throw new Error('Glyph slot already set');
      const i = P.hand.findIndex(h => h.id === action.cardId);
      if (i < 0) throw new Error('Card not in hand');
      const card = P.hand[i];
      if (card.type !== 'GLYPH') throw new Error('Only GLYPH can be set');
      // (glyphs default 0 cost)
      P.hand.splice(i, 1);
      P.glyphSlot.card = card;
      P.glyphSlot.hasGlyph = true;
      return state;
    }

    default:
      return state;
  }
}

/* -------------------------
   Spell Resolution (instant)
   ------------------------- */
function resolveSpellNow(state, pid, slotIndex) {
  const P = state.players[pid];
  const opp = pid === 'player' ? state.players.ai : state.players.player;
  const slot = P.slots[slotIndex];
  if (!slot?.hasCard || !slot.card) return;
  const c = slot.card;

  switch (c.id) {
    case 'c:pulse': { // Draw 1, +🜂1
      P.aether += 1;
      drawN(state, pid, 1);
      break;
    }
    case 'c:wisp': { // Free advance other spell — stub: give +🜂1 to simulate tempo
      P.aether += 1;
      break;
    }
    case 'c:greyfire': { // Deal 1 damage to enemy
      opp.vitality = Math.max(0, opp.vitality - 1);
      break;
    }
    case 'c:echo': { // Channel 1
      P.channeled += 1;
      break;
    }
    case 'c:catalyst': { // Channel 2
      P.channeled += 2;
      break;
    }
    case 'c:ashen': { // Channel 1, Draw 1
      P.channeled += 1;
      drawN(state, pid, 1);
      break;
    }
    default:
      // flow spells handled lightly here if needed
      if (c.id.startsWith('f:')) {
        if (c.id === 'f:resChorus') { P.aether += 2; P.channeled += 1; }
        else if (c.id === 'f:obsVault') { P.channeled += 2; P.aether += 1; }
      }
  }

  // glyph trigger: spell resolved
  triggerGlyphs(state, pid, 'SPELL_RESOLVED');

  // move resolved spell to discard (keeps slot visually filled until we clear it)
  P.discard.push(c);
  slot.card = null;
  slot.hasCard = false;
}

/* -------------------------
   Glyph Triggers
   ------------------------- */
function triggerGlyphs(state, pid, event) {
  const P = state.players[pid];
  const g = P?.glyphSlot;
  if (!g?.hasGlyph || !g.card) return;
  const name = String(g.card.name || '').toLowerCase();

  // Glyph of Remnant Light — on spell resolve → +🜂1
  if (event === 'SPELL_RESOLVED' && name.includes('remnant') && name.includes('light')) {
    P.aether += 1;
  }

  // Glyph of Returning Echo — on channel (discard-for-aether) → Draw 1
  if (event === 'CHANNEL' && (name.includes('returning') || name.includes('echo'))) {
    drawN(state, pid, 1);
  }
}

/* -------------------------
   Draw / Turn helpers
   ------------------------- */
function drawUpTo(state, pid, N) {
  const P = state.players[pid];
  const need = Math.max(0, N - P.hand.length);
  if (need) drawN(state, pid, need);
}

function drawN(state, pid, n) {
  const P = state.players[pid];
  for (let k = 0; k < n; k++) {
    if (P.deck.length === 0) {
      if (P.discard.length === 0) break;
      // reshuffle
      P.deck = shuffle(P.discard, state.rng || mulberry32(123));
      P.discard = [];
    }
    P.hand.push(P.deck.shift());
  }
}

function drawNFromDeck(P, n, rng) {
  for (let k = 0; k < n; k++) {
    if (P.deck.length === 0) {
      if (P.discard.length === 0) break;
      P.deck = shuffle(P.discard, rng);
      P.discard = [];
    }
    P.hand.push(P.deck.shift());
  }
}

/* -------------------------
   AI Turn (simple)
   ------------------------- */
function aiTurn(state) {
  const A = state.players.ai;
  // discard hand
  while (A.hand.length) A.discard.push(A.hand.shift());
  A.aether = 0;

  // rudimentary “play first Greyfire Bloom if drawn” demo on next hand:
  drawUpTo(state, 'ai', HAND_SIZE);
  // (Keep it simple: no auto-plays yet)
}
