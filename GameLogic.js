// v2.52 engine: river flow + buy/shift + lastDrop marker + draw/discard hooks

const FLOW_COSTS = [4,3,3,2,2];
const STARTING_VITALITY = 5;

function mkMarketCard(id, name, type, text="") {
  return { id, name, type, aetherValue:0, text };
}

/* ----- Market pool (simple looped deck) ----- */
function marketPool() {
  const base = [
    mkMarketCard("m_resonant","Resonant Chorus","SPELL","Market spell."),
    mkMarketCard("m_pulse","Pulse Feedback","INSTANT","Tactical instant."),
    mkMarketCard("m_refract","Refracted Will","GLYPH","Set a glyph."),
    mkMarketCard("m_cascade","Cascade Insight","INSTANT","Instant."),
    mkMarketCard("m_vault","Obsidian Vault","SPELL","Spell."),
  ];
  return base;
}

/* ----- Starter Base Set (for both players) ----- */
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

  const pool = marketPool();
  const flowDeck = [];
  for (let i=0;i<60;i++) {
    const b = pool[i % pool.length];
    flowDeck.push({...b, id:`${b.id}_${i}`});
  }

  return {
    turn: 1,
    activePlayer: "player",
    flowSlots: [null,null,null,null,null],
    flowDeck,
    lastFlowDrop: null,   // for animation (the one that fell off the right)
    lastBoughtCard: null, // for spotlight animation
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
    lastFlowDrop: state.lastFlowDrop,
    lastBoughtCard: state.lastBoughtCard,
    player: state.players?.player,
    ai: state.players?.ai,
  };
}

/* ----- Flow helpers ----- */
const slotCost = i => FLOW_COSTS[i] ?? 0;
function drawFlow(state){
  return state.flowDeck.shift() || null;
}
export function startTurn(state){
  // reveal exactly 1 card into slot 0 if empty
  if (!state.flowSlots[0]){
    state.flowSlots[0] = drawFlow(state);
  }
  state.lastFlowDrop = null;
  return state;
}
export function endTurn(state){
  // capture the card that will fall off the right
  state.lastFlowDrop = state.flowSlots[4] || null;
  for (let i=state.flowSlots.length-1; i>=1; i--){
    state.flowSlots[i] = state.flowSlots[i-1];
  }
  state.flowSlots[0] = null;
  state.turn += 1;
  return state;
}

/* ----- Draw/Discard (very light stub for demo) ----- */
export function drawNewHand(state, n=5){
  // demo draw: loop over starter set names
  const src = starterDeck();
  state.players.player.hand = src.slice(0,n).map((c,idx)=> ({...c, id:`draw_${state.turn}_${idx}_${c.id}`}));
  return state;
}
export function discardHand(state){
  const P = state.players.player;
  P.discardCount += P.hand.length;
  P.hand = [];
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
  const cost = slotCost(flowIndex);
  if ((P.aether|0) < cost) throw new Error("Not enough Æ");

  P.aether = (P.aether|0) - cost;
  P.discardCount += 1;

  // hold for spotlight animation on UI
  state.lastBoughtCard = { ...card };

  // remove purchased card and slide left side toward cheap end
  for (let i=flowIndex; i>0; i--){
    state.flowSlots[i] = state.flowSlots[i-1];
  }
  state.flowSlots[0] = null;
  return state;
}
