// v2.5 engine: starter deck with real text, play SPELL to slot, set GLYPH.
// Market buy is a visual stub.

export const FLOW_COSTS = [4,3,3,2,2];
const STARTING_VITALITY = 5;

function mkMarketCard(id, name, type, cost, text="") {
  return { id, name, type, price: cost, aetherValue:0, text };
}

function starterDeck() {
  return [
    { id:"c_pulse", name:"Pulse of the Grey", type:"SPELL", aetherValue:0, text:"Advance 1 (Æ1). On resolve: Draw 1, gain Æ1." },
    { id:"c_wisp",  name:"Wispform Surge",   type:"SPELL", aetherValue:0, text:"Advance 1 (Æ1). On resolve: Advance another spell 1." },
    { id:"c_bloom", name:"Greyfire Bloom",   type:"SPELL", aetherValue:0, text:"Cost Æ1. Advance 1 (Æ1). On resolve: Deal 1 damage." },
    { id:"c_echo",  name:"Echoing Reservoir",type:"SPELL", aetherValue:2, text:"Advance 1 (Æ2). On resolve: Channel 1." },
    { id:"c_catal", name:"Dormant Catalyst", type:"SPELL", aetherValue:1, text:"Advance 1 (Æ1). On resolve: Channel 2." },
    { id:"c_ashen", name:"Ashen Focus",      type:"SPELL", aetherValue:1, text:"Advance 1 (Æ2). On resolve: Channel 1, draw 1." },
    { id:"c_surge", name:"Surge of Ash",     type:"INSTANT", aetherValue:0, text:"Cost Æ1. Advance a spell you control by 1 (free)." },
    { id:"c_veil",  name:"Veil of Dust",     type:"INSTANT", aetherValue:0, text:"Cost Æ1. Prevent 1 or cancel an instant." },
    { id:"g_light", name:"Glyph of Remnant Light", type:"GLYPH", aetherValue:0, text:"When a spell resolves: gain Æ1." },
    { id:"g_echo",  name:"Glyph of Returning Echo", type:"GLYPH", aetherValue:0, text:"When you channel Aether: draw 1." },
  ];
}

export function initState() {
  const deck = starterDeck();
  const hand = deck.slice(0,5);
  const remaining = deck.slice(5);

  return {
    turn: 1,
    activePlayer: "player",
    flow: [
      mkMarketCard("f1","Resonant Chorus","SPELL",  FLOW_COSTS[0], "Market spell."),
      mkMarketCard("f2","Pulse Feedback","INSTANT", FLOW_COSTS[1], "Tactical instant."),
      mkMarketCard("f3","Refracted Will","GLYPH",   FLOW_COSTS[2], "Set a glyph."),
      mkMarketCard("f4","Cascade Insight","INSTANT",FLOW_COSTS[3], "Instant."),
      mkMarketCard("f5","Obsidian Vault","SPELL",   FLOW_COSTS[4], "Spell."),
    ],
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: remaining.length,
        hand, discardCount: 0,
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
        deckCount: 10,
        hand: starterDeck().slice(0,0),
        discardCount: 0,
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
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: state.players?.player,
    ai: state.players?.ai,
  };
}

/* ----- Actions ----- */
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

export function buyFromFlow(state, playerId, flowIndex){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  const card = state.flow?.[flowIndex];
  if (!card) throw new Error("no card at flow index");
  P.discardCount += 1;
  return state;
}
