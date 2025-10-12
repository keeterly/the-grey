// Minimal engine for v2.5 UI. Extend/replace freely.

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

export function initState() {
  return {
    turn: 1,
    activePlayer: "player",
    flow: [
      mkCard("f1","Resonant Chorus","SPELL",  FLOW_COSTS[0]),
      mkCard("f2","Pulse Feedback","INSTANT", FLOW_COSTS[1]),
      mkCard("f3","Refracted Will","GLYPH",  FLOW_COSTS[2]),
      mkCard("f4","Cascade Insight","INSTANT",FLOW_COSTS[3]),
      mkCard("f5","Obsidian Vault","SPELL",  FLOW_COSTS[4]),
    ],
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: starterHand(),
        discardCount: 0,
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null, isGlyph:true },
        ],
        weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"./weaver_aria.jpg" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: [],
        discardCount: 0,
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null, isGlyph:true },
        ],
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"./weaver_morr.jpg" },
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

function playCardToSpellSlot(state, playerId, cardId, slotIndex){
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

/* ------- simple reducer the UI uses ------- */
export function reducer(state, action){
  state = JSON.parse(JSON.stringify(state)); // immut-ish clone for demo
  const P = state.players?.[action.player || "player"];

  switch(action.type){
    case "START_TURN": {
      state.activePlayer = action.player || "player";
      // gain nothing special yet
      return state;
    }

    case "END_TURN": {
      // discard all cards in hand
      if (P){
        const n = P.hand.length;
        P.discardCount += n;
        P.hand = [];
        P.aether = 0; // temp aether clears
      }
      state.turn += 1;
      return state;
    }

    case "DISCARD_FOR_AETHER": {
      if (!P) return state;
      const i = P.hand.findIndex(c=>c.id===action.cardId);
      if (i<0) throw new Error("not in hand");
      const c = P.hand[i];
      P.hand.splice(i,1);
      P.discardCount += 1;
      P.aether += (c.aetherValue || 0);
      return state;
    }

    case "BUY_FROM_FLOW": {
      if (!P) return state;
      const idx = action.flowIndex|0;
      const c = state.flow[idx];
      if (!c) throw new Error("no card there");
      // cost check (very loose demo)
      // In your full engine you will also drift the river etc.
      P.discardCount += 1; // simulate going to discard
      // Replace bought card with a dummy placeholder (keeps width)
      state.flow[idx] = {...c, name: c.name+" (Sold)", price:null, type:c.type};
      return state;
    }

    case "PLAY_CARD_TO_SLOT": {
      return playCardToSpellSlot(state, action.player || "player", action.cardId, action.slotIndex|0);
    }

    default: return state;
  }
}
