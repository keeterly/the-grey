// v2.51 engine: river market, play SPELL/GLYPH, simple buy with Æ cost

const FLOW_COSTS = [4,3,3,2,2];
const STARTING_VITALITY = 5;

function mkMarketCard(id, name, type, cost, text="") {
  return { id, name, type, price: cost, aetherValue:0, text };
}

/* ----- Starter Base Set (for both players) ----- */
function starterDeck() {
  return [
    { id:"c_pulse", name:"Pulse of the Grey", type:"SPELL",   aetherValue:0, text:"Advance 1 (Æ1). On resolve: Draw 1, gain Æ1." },
    { id:"c_wisp",  name:"Wispform Surge",   type:"SPELL",   aetherValue:0, text:"Advance 1 (Æ1). On resolve: Advance another spell 1." },
    { id:"c_bloom", name:"Greyfire Bloom",   type:"SPELL",   aetherValue:0, text:"Cost Æ1. Advance 1 (Æ1). On resolve: Deal 1 damage." },
    { id:"c_echo",  name:"Echoing Reservoir",type:"SPELL",   aetherValue:2, text:"Advance 1 (Æ2). On resolve: Channel 1." },
    { id:"c_catal", name:"Dormant Catalyst", type:"SPELL",   aetherValue:1, text:"Advance 1 (Æ1). On resolve: Channel 2." },
    { id:"c_ashen", name:"Ashen Focus",      type:"SPELL",   aetherValue:1, text:"Advance 1 (Æ2). On resolve: Channel 1, draw 1." },
    { id:"c_surge", name:"Surge of Ash",     type:"INSTANT", aetherValue:0, text:"Cost Æ1. Advance a spell you control by 1 (free)." },
    { id:"c_veil",  name:"Veil of Dust",     type:"INSTANT", aetherValue:0, text:"Cost Æ1. Prevent 1 or cancel an instant." },
    { id:"g_light", name:"Glyph of Remnant Light", type:"GLYPH", aetherValue:0, text:"When a spell resolves: gain Æ1." },
    { id:"g_echo",  name:"Glyph of Returning Echo", type:"GLYPH", aetherValue:0, text:"When you channel Aether: draw 1." },
  ];
}

/* ----- Market seed (any set of 20+ is fine for demo) ----- */
function seedMarketDeck(){
  const pool = [
    mkMarketCard("m1","Resonant Chorus","SPELL",4,"Market spell."),
    mkMarketCard("m2","Pulse Feedback","INSTANT",3,"Tactical instant."),
    mkMarketCard("m3","Refracted Will","GLYPH",3,"Set a glyph."),
    mkMarketCard("m4","Cascade Insight","INSTANT",2,"Instant."),
    mkMarketCard("m5","Obsidian Vault","SPELL",2,"Spell."),
    mkMarketCard("m6","Cinder Bloom","SPELL",4,"Deal 1."),
    mkMarketCard("m7","Fray Echo","SPELL",3,"Channel 1."),
    mkMarketCard("m8","Shifting Dust","INSTANT",2,"Prevent 1."),
    mkMarketCard("m9","Glass Rune","GLYPH",2,"Draw when glyph set."),
    mkMarketCard("m10","Sable Pulse","SPELL",3,"Advance a spell 1."),
  ];
  // simple repeat
  return [...pool, ...pool.map((c,i)=>({...c,id:c.id+"_b"+i}))];
}

export function initState() {
  const deck = starterDeck();
  const hand = deck.slice(0,5);
  const remaining = deck.slice(5);

  return {
    turn: 1,
    activePlayer: "player",
    // River market
    flowSlots: [null,null,null,null,null],
    flowDeck: seedMarketDeck(),
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: remaining.length,
        hand: hand,
        discardCount: 0,
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
        hand: [],
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
    flowSlots: state.flowSlots,
    player: state.players?.player,
    ai: state.players?.ai,
  };
}

/* ----- River helpers ----- */
export function startTurn(state){
  // Reveal exactly 1 card into slot[0] if empty
  if (!state.flowSlots[0] && state.flowDeck.length){
    state.flowSlots[0] = state.flowDeck.shift();
  }
  return state;
}

export function endTurn(state){
  // Shift the river right by one (slot[4] drops)
  for (let i=4; i>=1; i--){
    state.flowSlots[i] = state.flowSlots[i-1] || null;
  }
  state.flowSlots[0] = null;

  state.turn += 1;
  state.activePlayer = (state.activePlayer==="player")?"player":"player"; // single player demo
  return state;
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
  const card = state.flowSlots?.[flowIndex];
  if (!card) throw new Error("no card at flow index");

  const cost = [4,3,3,2,2][flowIndex] || 0;
  if ((P.aether|0) < cost) throw new Error("Not enough Æ");
  P.aether -= cost;

  // remove card & go to discard (count only, for now)
  state.flowSlots[flowIndex] = null;
  P.discardCount += 1;
  return state;
}
