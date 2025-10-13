// GameLogic.js — v2.5 (glyph-enabled minimal engine)

/** ---------- Helpers ---------- **/

const FLOW_COSTS = [4, 3, 2, 2, 2];
const STARTING_VITALITY = 5;

// quick “draw” placeholder so UI can show a card when something says “draw 1”
function mkPlaceholderDrawCard(nextId) {
  return {
    id: nextId,
    name: "Apprentice Bolt",
    type: "SPELL",
    cost: 0,
    aetherValue: 0,
    text: "A basic spark of will.",
  };
}

// Starter hand (you can swap these to your revised names later)
function starterHand() {
  return [
    { id: "h1", name: "Pulse of the Grey", type: "SPELL", aetherValue: 0, text: "Draw 1. Gain 🜂1." },
    { id: "h2", name: "Echoing Reservoir", type: "SPELL", aetherValue: 2, text: "Channel 1." },
    { id: "h3", name: "Dormant Catalyst", type: "SPELL", aetherValue: 1, text: "Channel 2." },
    { id: "h4", name: "Veil of Dust", type: "INSTANT", aetherValue: 0, text: "Prevent 1 or counter an Instant." },
    { id: "h5", name: "Ashen Focus", type: "SPELL", aetherValue: 1, text: "Channel 1. Draw 1." },
  ];
}

function mkCard(id, name, type, price = 0) {
  return { id, name, type, price, aetherValue: 0 };
}

/** ---------- Public API ---------- **/

export function initState() {
  return {
    turn: 1,
    activePlayer: "player",
    // simple id counter for draw-placeholder cards
    __nextId: 1000,

    // flow row
    flow: [
      mkCard("f1", "Resonant Chorus", "SPELL", FLOW_COSTS[0]),
      mkCard("f2", "Pulse Feedback", "INSTANT", FLOW_COSTS[1]),
      mkCard("f3", "Refracted Will", "GLYPH", FLOW_COSTS[2]),
      mkCard("f4", "Cascade Insight", "INSTANT", FLOW_COSTS[3]),
      mkCard("f5", "Obsidian Vault", "SPELL", FLOW_COSTS[4]),
    ],

    players: {
      player: mkPlayer("aria"),
      ai: mkPlayer("morr"),
    },
  };
}

function mkPlayer(who) {
  const portraits = {
    aria: "weaver_aria.jpg",
    morr: "weaver_morr.jpg",
  };
  const names = {
    aria: "Aria, Runesurge Adept",
    morr: "Morr, Gravecurrent Binder",
  };

  return {
    vitality: STARTING_VITALITY,

    aether: 0,          // 🜂  (temp; resets EOT)
    channeled: 0,       // ◇  (persists)
    deckCount: 10,      // abstracted deck size
    discardCount: 0,    // abstracted discard size

    hand: starterHand(),

    // three SPELL bays
    slots: [
      { hasCard: false, card: null },
      { hasCard: false, card: null },
      { hasCard: false, card: null },
    ],

    // one GLYPH bay
    glyphSlot: { hasGlyph: false, card: null },

    weaver: { id: who, name: names[who], stage: 0, portrait: portraits[who] },
  };
}

export function serializePublic(state) {
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: state.players.player,
    ai: state.players.ai,
  };
}

/** ---------- Reducer & Rules ---------- **/

export function reducer(state, action) {
  switch (action.type) {
    case "START_TURN": {
      state.activePlayer = action.player || "player";
      // (could draw here if you like)
      return state;
    }

    case "END_TURN": {
      const P = state.players.player;
      // discard entire hand at EOT
      state.players.player.discardCount += P.hand.length;
      P.hand = [];
      // lose temporary aether
      P.aether = 0;

      // very light AI “turn”
      aiTakesTurn(state);

      // player draws a fresh 5 (placeholder)
      drawN(state, "player", 5);
      state.turn += 1;
      state.activePlayer = "player";
      return state;
    }

    // buy from flow into discard using 🜂 and/or ◇
    case "BUY_FROM_FLOW": {
      const P = state.players[action.player];
      const c = state.flow[action.flowIndex];
      if (!P || !c) throw new Error("Invalid flow purchase");

      const cost = c.price || 0;
      let payFromTemp = Math.min(P.aether, cost);
      let remaining = cost - payFromTemp;

      if (remaining > 0) {
        if (P.channeled < remaining) throw new Error("Not enough aether");
        P.channeled -= remaining;
      }
      P.aether -= payFromTemp;

      // goes to discard
      P.discardCount += 1;

      // replace purchased flow card with a blank “spent” shell (optional)
      state.flow[action.flowIndex] = { ...c, id: c.id + "_spent", name: c.name, type: c.type, price: c.price };
      return state;
    }

    // Discard card from hand to gain its aetherValue (CHANNEL)
    case "DISCARD_FOR_AETHER": {
      const P = state.players[action.player];
      const i = P.hand.findIndex((h) => h.id === action.cardId);
      if (i < 0) throw new Error("Card not in hand");

      const card = P.hand[i];
      P.hand.splice(i, 1);
      P.discardCount += 1;

      const add = Number(card.aetherValue || 0);
      if (add > 0) {
        P.aether += add;
        triggerGlyphs(state, action.player, "CHANNEL");
      }
      return state;
    }

    // Place SPELL card into spell bay
    case "PLAY_CARD_TO_SLOT": {
      const P = state.players[action.player];
      const slotIndex = action.slotIndex;
      if (slotIndex < 0 || slotIndex > 2) throw new Error("Spell slot 0..2");

      const slot = P.slots[slotIndex];
      if (slot.hasCard) throw new Error("Slot occupied");

      const i = P.hand.findIndex((h) => h.id === action.cardId);
      if (i < 0) throw new Error("Card not in hand");
      const card = P.hand[i];
      if (card.type !== "SPELL") throw new Error("Only SPELL to spell slot");

      P.hand.splice(i, 1);
      slot.card = card;
      slot.hasCard = true;

      // Treat “resolve” immediately for now so glyphs can hook
      triggerGlyphs(state, action.player, "SPELL_RESOLVED");
      return state;
    }

    // Place GLYPH card into glyph bay
    case "SET_GLYPH_FROM_HAND": {
      const P = state.players[action.player];
      if (P.glyphSlot.hasGlyph) throw new Error("Glyph slot already set");

      const i = P.hand.findIndex((h) => h.id === action.cardId);
      if (i < 0) throw new Error("Card not in hand");
      const card = P.hand[i];
      if (card.type !== "GLYPH") throw new Error("Only GLYPH can be set");

      P.hand.splice(i, 1);
      P.glyphSlot.card = card;
      P.glyphSlot.hasGlyph = true;
      return state;
    }

    default:
      return state;
  }
}

/** ---------- Triggers (Glyphs) ---------- **/

function triggerGlyphs(state, playerId, event) {
  const P = state.players[playerId];
  const g = P?.glyphSlot;
  if (!g?.hasGlyph || !g.card) return;

  const name = String(g.card.name || "").toLowerCase();

  // Glyph of Remnant Light — when a spell resolves → gain 🜂1
  if (event === "SPELL_RESOLVED" && name.includes("remnant") && name.includes("light")) {
    P.aether += 1;
  }

  // Glyph of Returning Echo — when you channel (discard for aether) → draw 1
  if (event === "CHANNEL" && (name.includes("returning") || name.includes("echo"))) {
    drawN(state, playerId, 1);
  }
}

/** ---------- Tiny “AI turn” stub & draw ---------- **/

function aiTakesTurn(state) {
  const A = state.players.ai;
  // AI does nothing but “discard hand, draw 5”
  A.discardCount += A.hand.length;
  A.hand = [];
  A.aether = 0;
  drawN(state, "ai", 5);
}

function drawN(state, playerId, n) {
  const P = state.players[playerId];
  for (let k = 0; k < n; k++) {
    if (P.deckCount > 0) {
      P.deckCount -= 1;
      const id = "d" + state.__nextId++;
      P.hand.push(mkPlaceholderDrawCard(id));
    } else if (P.discardCount > 0) {
      // reshuffle (abstract): move discard into deck, then draw one
      P.deckCount += P.discardCount;
      P.discardCount = 0;
      P.deckCount -= 1;
      const id = "d" + state.__nextId++;
      P.hand.push(mkPlaceholderDrawCard(id));
    } else {
      // nothing to draw
      break;
    }
  }
}
