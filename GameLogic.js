// Clean GameLogic.js (browser-safe, no structuredClone, no spread bugs)

const FLOW_COSTS = [4, 3, 2, 2, 2];
const STARTING_VITALITY = 5;
const HAND_SIZE = 5;

function mkCard(id, name, type, price, aetherValue = 0) {
  return { id, name, type, price, aetherValue, cost: price };
}

function starterDeck() {
  return [
    mkCard("d1", "Apprentice Bolt", "SPELL", 0, 0),
    mkCard("d2", "Apprentice Bolt", "SPELL", 0, 0),
    mkCard("d3", "Apprentice Bolt", "SPELL", 0, 0),
    mkCard("d4", "Apprentice Bolt", "SPELL", 0, 0),
    mkCard("d5", "Apprentice Bolt", "SPELL", 0, 0),
    mkCard("d6", "Ashen Focus", "SPELL", 1, 1),
    mkCard("d7", "Dormant Catalyst", "SPELL", 1, 1),
    mkCard("d8", "Echoing Reservoir", "SPELL", 2, 2),
    mkCard("d9", "Veil of Dust", "INSTANT", 0, 0),
    mkCard("d10", "Pulse of the Grey", "SPELL", 0, 0),
  ];
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function draw(p, n = 1) {
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) {
      if (!p.discard.length) break;
      p.deck = shuffle(p.discard);
      p.discard = [];
    }
    const card = p.deck.shift();
    if (card) p.hand.push(card);
  }
}

function drawUpTo(p, size) {
  const need = Math.max(0, size - p.hand.length);
  draw(p, need);
}

export function initState() {
  const deck = starterDeck();
  const player = {
    vitality: STARTING_VITALITY,
    aether: 0,
    channeled: 0,
    deck: deck,
    discard: [],
    hand: [],
    slots: [
      { hasCard: false, card: null },
      { hasCard: false, card: null },
      { hasCard: false, card: null },
    ],
    glyph: { hasCard: false, card: null, isGlyph: true },
    weaver: { id: "aria", name: "Aria, Runesurge Adept", stage: 0, portrait: "./weaver_aria.jpg" },
  };
  drawUpTo(player, HAND_SIZE);

  const ai = {
    vitality: STARTING_VITALITY,
    aether: 0,
    channeled: 0,
    deck: starterDeck(),
    discard: [],
    hand: [],
    slots: [
      { hasCard: false, card: null },
      { hasCard: false, card: null },
      { hasCard: false, card: null },
    ],
    glyph: { hasCard: false, card: null, isGlyph: true },
    weaver: { id: "morr", name: "Morr, Gravecurrent Binder", stage: 0, portrait: "./weaver_morr.jpg" },
  };

  return {
    turn: 1,
    activePlayer: "player",
    flow: [
      mkCard("f1", "Resonant Chorus", "SPELL", FLOW_COSTS[0]),
      mkCard("f2", "Pulse Feedback", "INSTANT", FLOW_COSTS[1]),
      mkCard("f3", "Refracted Will", "GLYPH", FLOW_COSTS[2]),
      mkCard("f4", "Cascade Insight", "INSTANT", FLOW_COSTS[3]),
      mkCard("f5", "Obsidian Vault", "SPELL", FLOW_COSTS[4]),
    ],
    players: { player, ai },
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
      discardCount: P.discard.length,
      hand: P.hand,
      slots: P.slots,
      glyph: P.glyph,
      weaver: P.weaver,
    },
    ai: {
      vitality: A.vitality,
      aether: A.aether,
      channeled: A.channeled,
      deckCount: A.deck.length,
      discardCount: A.discard.length,
      slots: A.slots,
      glyph: A.glyph,
      weaver: A.weaver,
    },
  };
}

export function reducer(state, action) {
  // Deep copy without structuredClone
  const S = JSON.parse(JSON.stringify(state));

  switch (action.type) {
    case "START_TURN": {
      S.activePlayer = action.player || "player";
      return S;
    }

    case "DISCARD_FOR_AETHER": {
      const P = S.players[action.player];
      const i = P.hand.findIndex((c) => c.id === action.cardId);
      if (i < 0) throw new Error("Card not found in hand");
      const [c] = P.hand.splice(i, 1);
      P.aether += c.aetherValue || 0;
      P.discard.push(c);
      return S;
    }

    case "PLAY_CARD_TO_SLOT": {
      const P = S.players[action.player];
      const slotIndex = action.slotIndex;
      if (slotIndex < 0 || slotIndex > 2) throw new Error("Invalid slot index");
      const slot = P.slots[slotIndex];
      if (slot.hasCard) throw new Error("Slot occupied");
      const i = P.hand.findIndex((c) => c.id === action.cardId);
      if (i < 0) throw new Error("Card not found in hand");
      const card = P.hand.splice(i, 1)[0];
      if (card.type !== "SPELL") throw new Error("Only SPELL cards can be played");
      slot.card = card;
      slot.hasCard = true;
      return S;
    }

    case "BUY_FROM_FLOW": {
      const P = S.players[action.player];
      const idx = action.flowIndex;
      const c = S.flow[idx];
      if (!c) throw new Error("No card in flow");
      const cost = c.price ?? c.cost ?? 0;
      if (P.aether < cost) throw new Error("Not enough Æther");
      P.aether -= cost;
      const bought = { ...c, id: "b" + Date.now() };
      P.discard.push(bought);
      return S;
    }

    case "END_TURN": {
      const P = S.players.player;
      while (P.hand.length) P.discard.push(P.hand.pop());
      drawUpTo(P, HAND_SIZE);

      const A = S.players.ai;
      while (A.hand.length) A.discard.push(A.hand.pop());
      drawUpTo(A, HAND_SIZE);

      S.turn++;
      S.activePlayer = "player";
      return S;
    }

    default:
      return S;
  }
}
