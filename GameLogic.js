// v2.53 — stable: river market, shuffles, hardened data, portraits, hearts/gems

const FLOW_COSTS = [4, 3, 3, 2, 2];
const STARTING_VITALITY = 5;
const HAND_SIZE = 5;

/* ---------- utils ---------- */
function rng(seed=Date.now()) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
function shuffle(arr, r = rng()) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- card helpers ---------- */
function C(id, name, type, { cost=0, pip=0, aetherValue=0, text="", role="" }={}) {
  return { id, name, type, cost, pip, aetherValue, text, role };
}

/* ---------- Base deck (shared) ---------- */
function makeBaseDeck() {
  const L = [];
  L.push(C("c_pulse1","Pulse of the Grey","SPELL",{pip:1,text:"On Resolve: Draw 1, gain :GEM:"}));
  L.push(C("c_pulse2","Pulse of the Grey","SPELL",{pip:1,text:"On Resolve: Draw 1, gain :GEM:"}));
  L.push(C("c_pulse3","Pulse of the Grey","SPELL",{pip:1,text:"On Resolve: Draw 1, gain :GEM:"}));

  L.push(C("c_wisp","Wispform Surge","SPELL",{pip:1,text:"On Resolve: Advance another Spell 1 (free)"}));
  L.push(C("c_bloom","Greyfire Bloom","SPELL",{cost:1,pip:1,text:"On Resolve: Advance another Spell 1 (free)"}));

  L.push(C("c_echo1","Echoing Reservoir","SPELL",{pip:1,aetherValue:2,text:"On Resolve: Channel 1"}));
  L.push(C("c_echo2","Echoing Reservoir","SPELL",{pip:1,aetherValue:2,text:"On Resolve: Channel 1"}));
  L.push(C("c_catal","Dormant Catalyst","SPELL",{pip:1,aetherValue:1,text:"On Resolve: Channel 2"}));
  L.push(C("c_ashen","Ashen Focus","SPELL",{pip:1,aetherValue:1,text:"On Resolve: Channel 1 and Draw 1"}));

  L.push(C("i_surge","Surge of Ash","INSTANT",{cost:1,text:"Target Spell advances 1 (free)"}));
  L.push(C("i_veil","Veil of Dust","INSTANT",{cost:1,text:"Prevent 1 damage or negate a hostile Instant"}));

  L.push(C("g_light","Glyph of Remnant Light","GLYPH",{text:"When a Spell resolves → gain :GEM:"}));
  L.push(C("g_echo","Glyph of Returning Echo","GLYPH",{text:"When you Channel → Draw 1"}));
  return L;
}

/* ---------- Aetherflow supply ---------- */
function makeFlowSupply() {
  return [
    C("f_cinders","Surge of Cinders","INSTANT",{cost:2,text:"Deal 2 damage to any target"}),
    C("f_feedback","Pulse Feedback","INSTANT",{cost:3,text:"Advance all Spells you control by 1"}),
    C("f_refract","Refracted Will","INSTANT",{cost:2,text:"Counter an Instant or negate a Glyph trigger"}),
    C("f_impel","Aether Impel","INSTANT",{cost:4,text:"Gain 3 :GEM: this turn"}),
    C("f_cascade","Cascade Insight","INSTANT",{cost:3,text:"Draw 2 cards, then discard 1"}),

    C("f_resonant","Resonant Chorus","SPELL",{pip:1,aetherValue:1,text:"On Resolve: Gain 2 :GEM:, Channel 1"}),
    C("f_ember","Emberline Pulse","SPELL",{cost:1,pip:1,text:"On Resolve: Deal 2 damage and Draw 1"}),
    C("f_memory","Fractured Memory","SPELL",{pip:2,text:"On Resolve: Draw 2 cards"}),
    C("f_vault","Obsidian Vault","SPELL",{pip:1,aetherValue:1,text:"On Resolve: Channel 2, gain :GEM:"}),
    C("f_mirror","Mirror Cascade","SPELL",{cost:1,pip:1,text:"On Resolve: Copy the next Instant you play this turn"}),
    C("f_sanguine","Sanguine Flow","SPELL",{cost:2,pip:1,text:"On Resolve: Lose 1 Vitality, Gain 3 :GEM:"}),

    C("f_gwith","Glyph of Withering Light","GLYPH",{text:"When an opponent plays a Spell → They lose 1 :GEM:"}),
    C("f_gvigil","Glyph of Vigilant Echo","GLYPH",{text:"End of your turn → Channel 1"}),
    C("f_gburied","Glyph of Buried Heat","GLYPH",{text:"When you discard for :GEM: → Gain +1 extra :GEM:"}),
    C("f_gglass","Glyph of Soulglass","GLYPH",{text:"When you buy from Flow → Draw 1"}),
  ];
}

/* ---------- initial state ---------- */
export function initState(seed = Date.now()) {
  const r = rng(seed);
  const supply = shuffle(makeFlowSupply(), r);
  const playerDeck = shuffle(makeBaseDeck(), r);
  const aiDeck = shuffle(makeBaseDeck(), r);

  const drawN = (deck, n) => deck.splice(0, n);

  const player = {
    vitality: STARTING_VITALITY,
    aether: 0, channeled: 0,
    deck: playerDeck,
    hand: drawN(playerDeck, HAND_SIZE),
    discard: [],
    slots: [
      { hasCard:false, card:null }, { hasCard:false, card:null }, { hasCard:false, card:null },
      { isGlyph:true, hasCard:false, card:null },
    ],
    weaver: { id:"aria", name:"Player", portrait:"./weaver_aria_Portrait.jpg" },
    trance: { level: 0 },
  };

  const ai = {
    vitality: STARTING_VITALITY,
    aether: 0, channeled: 0,
    deck: aiDeck,
    hand: [], // hidden
    discard: [],
    slots: [
      { hasCard:false, card:null }, { hasCard:false, card:null }, { hasCard:false, card:null },
      { isGlyph:true, hasCard:false, card:null },
    ],
    weaver: { id:"morr", name:"Opponent", portrait:"./weaver_morr_Portrait.jpg" },
    trance: { level: 0 },
  };

  // river: 5 “slots”, initially empty; reveal 1 on first startTurn call
  const flow = new Array(5).fill(null);
  return {
    seed, turn: 1, activePlayer: "player",
    flow, flowSupply: supply,
    players: { player, ai }
  };
}

/* ---------- serialization ---------- */
export function serializePublic(state) {
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    flowCosts: FLOW_COSTS,
    player: state.players?.player,
    ai: state.players?.ai,
  };
}

/* ---------- turn / river ---------- */
export function startTurn(state) {
  // reveal one card into first empty flow slot
  for (let i = 0; i < state.flow.length; i++) {
    if (state.flow[i] == null) {
      state.flow[i] = state.flowSupply.shift() || null;
      break;
    }
  }
  return state;
}

export function endTurn(state) {
  // river shifts right (toward cheaper) and makes room at [0]
  for (let i = state.flow.length - 1; i > 0; i--) state.flow[i] = state.flow[i-1];
  state.flow[0] = null;

  // next player
  state.activePlayer = (state.activePlayer === "player") ? "ai" : "player";
  state.turn += (state.activePlayer === "player") ? 1 : 0;

  return state;
}

/* ---------- actions ---------- */

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

// Discard for Aether
export function discardForAether(state, playerId, cardId){
  const P = state.players[playerId];
  const i = P.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new Error("card not in hand");
  const card = P.hand[i];
  const gain = Math.max(0, card.aetherValue || 0);
  P.hand.splice(i,1);
  P.discard.push(card);
  P.aether += gain;
  return { state, gain };
}

// Market buy → pay cost; move to discard; slot becomes empty
export function buyFromFlow(state, playerId, flowIndex){
  const P = state.players[playerId];
  const card = state.flow?.[flowIndex] || null;
  const cost = FLOW_COSTS[flowIndex] || 0;
  if (!card) throw new Error("no card at flow index");
  if ((P.aether|0) < cost) throw new Error("not enough Aether");

  P.aether -= cost;
  P.discard.push(card);
  state.flow[flowIndex] = null; // will refill at next startTurn()
  return { state, bought: card, cost };
}
