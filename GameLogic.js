// Minimal engine for v2.6 UI. Keep these exports stable if you swap to your full engine.

const FLOW_COSTS = [4,3,2,2,2];
const STARTING_VITALITY = 5;

function mkCard(id, name, type, price) {
  return { id, name, type, price };
}

function starterHand() {
  return [
    { id:"h1", name:"Pulse of the Grey", type:"SPELL",   aetherValue:0 },
    { id:"h2", name:"Echoing Reservoir", type:"SPELL",   aetherValue:2 },
    { id:"h3", name:"Dormant Catalyst",  type:"SPELL",   aetherValue:1 },
    { id:"h4", name:"Veil of Dust",      type:"INSTANT", aetherValue:0 },
    { id:"h5", name:"Ashen Focus",       type:"SPELL",   aetherValue:1 },
  ];
}

export function initState(opts = {}) {
  return {
    turn: 1,
    activePlayer: "player",
    flow: [
      mkCard("f1","Resonant Chorus","SPELL",   FLOW_COSTS[0]),
      mkCard("f2","Pulse Feedback","INSTANT",  FLOW_COSTS[1]),
      mkCard("f3","Refracted Will","GLYPH",    FLOW_COSTS[2]),
      mkCard("f4","Cascade Insight","INSTANT", FLOW_COSTS[3]),
      mkCard("f5","Obsidian Vault","SPELL",    FLOW_COSTS[4]),
    ],
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: starterHand(),
        discardCount: 0,
        slots: [
          { hasCard:false, card:null, isGlyph:false },
          { hasCard:false, card:null, isGlyph:false },
          { hasCard:false, card:null, isGlyph:false },
          { hasCard:false, card:null, isGlyph:true  }, // glyph bay
        ],
        weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: [],
        discardCount: 0,
        slots: [
          { hasCard:false, card:null, isGlyph:false },
          { hasCard:false, card:null, isGlyph:false },
          { hasCard:false, card:null, isGlyph:false },
          { hasCard:false, card:null, isGlyph:true  },
        ],
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"" },
      }
    }
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

export function reducer(state, action){
  switch(action.type){
    case "START_TURN":
      state.activePlayer = action.player || "player";
      // River advance etc could happen here in the full engine
      return state;
    case "END_TURN":
      state.activePlayer = state.activePlayer === "player" ? "ai" : "player";
      if (state.activePlayer === "player") state.turn += 1;
      return state;

    case "DISCARD_FOR_AETHER": {
      const P = state.players[action.player];
      const i = P.hand.findIndex(c=>c.id===action.cardId);
      if (i<0) throw new Error("card not in hand");
      const c = P.hand[i];
      P.hand.splice(i,1);
      P.aether += (c.aetherValue||0);
      return state;
    }

    case "BUY_FROM_FLOW": {
      const P = state.players[action.player];
      const card = state.flow[action.flowIndex];
      if (!card) throw new Error("invalid market index");
      const cost = card.price||0;
      if (P.aether + P.channeled < cost) throw new Error("Cannot afford");
      let pay = cost;
      if (P.aether >= pay) P.aether -= pay;
      else { pay -= P.aether; P.aether = 0; P.channeled -= pay; }
      // add to discard in a real engine; here we just replace with a dummy
      state.flow[action.flowIndex] = mkCard("f"+Math.random().toString(36).slice(2,7),"New Draw","INSTANT", 2);
      return state;
    }

    case "PLAY_CARD_TO_SLOT":
      return playCardToSpellSlot(state, action.player, action.cardId, action.slotIndex);

    default: return state;
  }
}

// drag-to-slot: hand SPELL -> player spell slot (0..2)
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
  slot.card = card;
  slot.hasCard = true;
  return state;
}
