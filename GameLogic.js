// v2.51 — River Flow market
// - Start of game: reveal 1 card in Aetherflow
// - Start turn: reveal new card into slot 0 (if empty)
// - End turn: slide all flow cards to the right by 1 (last drops)
// - Costs are by slot index: [4,3,3,2,2]

const FLOW_COSTS = [4,3,3,2,2];
const STARTING_VITALITY = 5;

// Simple card factory for market cards
function mkMarketCard(id, name, type, text="") {
  return { id, name, type, aetherValue: 0, text };
}

// A tiny pool for the Aetherflow deck (demo)
// You can replace this later with a proper randomized supply.
function buildFlowDeck() {
  const proto = [
    mkMarketCard("m_res_chorus","Resonant Chorus","SPELL","Market spell."),
    mkMarketCard("m_pulse_fb","Pulse Feedback","INSTANT","Tactical instant."),
    mkMarketCard("m_refract","Refracted Will","GLYPH","Set a glyph."),
    mkMarketCard("m_cascade","Cascade Insight","INSTANT","Instant."),
    mkMarketCard("m_vault","Obsidian Vault","SPELL","Spell."),
  ];
  // Make ~20 cards by cycling names/types
  const out = [];
  for (let i=0;i<20;i++){
    const b = proto[i % proto.length];
    out.push(mkMarketCard(`${b.id}_${i+1}`, b.name, b.type, b.text));
  }
  return out;
}

/* ----- Starter Base Set (for both players) ----- */
function starterDeck() {
  return [
    // Spells of Utility (x3)
    { id:"c_pulse", name:"Pulse of the Grey", type:"SPELL", aetherValue:0, text:"Advance 1 (Æ1). On resolve: Draw 1, gain Æ1." },
    { id:"c_wisp",  name:"Wispform Surge",   type:"SPELL", aetherValue:0, text:"Advance 1 (Æ1). On resolve: Advance another spell 1." },
    { id:"c_bloom", name:"Greyfire Bloom",   type:"SPELL", aetherValue:0, text:"Cost Æ1. Advance 1 (Æ1). On resolve: Deal 1 damage." },

    // Channelers (x3)
    { id:"c_echo",  name:"Echoing Reservoir",type:"SPELL", aetherValue:2, text:"Advance 1 (Æ2). On resolve: Channel 1." },
    { id:"c_catal", name:"Dormant Catalyst", type:"SPELL", aetherValue:1, text:"Advance 1 (Æ1). On resolve: Channel 2." },
    { id:"c_ashen", name:"Ashen Focus",      type:"SPELL", aetherValue:1, text:"Advance 1 (Æ2). On resolve: Channel 1, draw 1." },

    // Instants (x2)
    { id:"c_surge", name:"Surge of Ash",     type:"INSTANT", aetherValue:0, text:"Cost Æ1. Advance a spell you control by 1 (free)." },
    { id:"c_veil",  name:"Veil of Dust",     type:"INSTANT", aetherValue:0, text:"Cost Æ1. Prevent 1 or cancel an instant." },

    // Glyphs (x2)
    { id:"g_light", name:"Glyph of Remnant Light",  type:"GLYPH", aetherValue:0, text:"When a spell resolves: gain Æ1." },
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

    // River market
    flowSlots: [null, null, null, null, null], // left→right
    flowDeck: buildFlowDeck(),                 // face-down river supply

    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: remaining.length,
        hand,
        discardCount: 0,
        slots: [
          { hasCard:false, card:null }, // spell
          { hasCard:false, card:null }, // spell
          { hasCard:false, card:null }, // spell
          { isGlyph:true, hasCard:false, card:null }, // glyph
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
    flowSlots: state.flowSlots,
    flowDeckCount: state.flowDeck?.length ?? 0,
    player: state.players?.player,
    ai: state.players?.ai,
  };
}

/* ----- Flow helpers ----- */
function slotCost(index){ return FLOW_COSTS[index] ?? 0; }

/* ----- Actions: board play ----- */
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

/* ----- Actions: Flow buy (uses slot cost) ----- */
export function buyFromFlow(state, playerId, flowIndex){
  const P = state.players[playerId];
  if (!P) throw new Error("bad player");
  if (flowIndex < 0 || flowIndex > 4) throw new Error("flow index 0..4");

  const card = state.flowSlots?.[flowIndex];
  if (!card) throw new Error("No card in that slot");

  const price = slotCost(flowIndex);
  if ((P.aether || 0) < price) throw new Error("Not enough Æ");

  P.aether -= price;
  if (P.aether < 0) P.aether = 0;
  P.discardCount += 1;

  // Remove purchased card; leave a hole until next start-turn reveal
  state.flowSlots[flowIndex] = null;
  return state;
}

/* ----- Turn flow ----- */
export function startTurn(state){
  // Reveal one card into slot 0 if empty
  if (!state.flowSlots[0] && state.flowDeck.length > 0){
    state.flowSlots[0] = state.flowDeck.shift();
  }
  return state;
}

export function endTurn(state){
  // Slide right by one (4 drops)
  for (let i=4;i>=1;i--){
    state.flowSlots[i] = state.flowSlots[i-1] || null;
  }
  state.flowSlots[0] = null;

  // Advance turn counter and (optionally) active player
  state.turn += 1;
  state.activePlayer = "player"; // single-player demo
  return state;
}