// GameLogic.js (root) — minimal working engine for v2.5 UI
// Keep it simple so the board renders while you wire the real logic.

const FLOW_COSTS = [4,3,2,2,2];
const STARTING_VITALITY = 5;

function mkCard(id, name, type, price) {
  return { id, name, type, price };
}

function starterHand() {
  // just 5 placeholders so the fan renders
  return [
    { id:"h1", name:"Pulse of the Grey", type:"SPELL", aetherValue:0 },
    { id:"h2", name:"Echoing Reservoir", type:"SPELL", aetherValue:2 },
    { id:"h3", name:"Dormant Catalyst", type:"SPELL", aetherValue:1 },
    { id:"h4", name:"Veil of Dust", type:"INSTANT", aetherValue:0 },
    { id:"h5", name:"Ashen Focus", type:"SPELL", aetherValue:1 },
  ];
}

export function initState(opts = {}) {
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
          { hasCard:false }, { hasCard:false }, { hasCard:false }, // 3 spell bays
          // glyph visual handled by UI; engine still reports 3 spell slots for now
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
          { hasCard:false }, { hasCard:false }, { hasCard:false },
        ],
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"" },
      }
    }
  };
}

export function serializePublic(state) {
  // The UI expects: { turn, activePlayer, flow[], player{}, ai{} }
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: state.players.player,
    ai: state.players.ai,
  };
}
