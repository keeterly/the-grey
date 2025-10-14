// v2.53 engine: updated Base Deck + Aetherflow pool per spec,
// keeping river costs (4,3,3,2,2) as position-based buy prices.

const FLOW_COSTS = [4,3,3,2,2];
const STARTING_VITALITY = 5;

/* Utility */
function mk(id, name, type, {
  playCost = 0, pip = null, effect = "", aetherValue = 0
} = {}) {
  // Keep extra fields for future rules; render uses text + aetherValue today.
  return {
    id, name, type,
    playCost, pip, aetherValue,
    text: [
      playCost ? `Cost Æ${playCost}.` : "",
      pip ? `Pip ${typeof pip === "number" ? pip : pip}.` : "",
      effect
    ].filter(Boolean).join(" ")
  };
}
function dup(card, n){ return Array.from({length:n}, (_,i)=> ({...card, id:`${card.id}#${i+1}`})); }

/* ===== Shared Starting Deck (with quantities) =====
| Name                    | Type    | Cost | Pip | Effect                                       | Aether | Qty |
| Pulse of the Grey       | Spell   | 0    | 1   | On Resolve: Draw 1, Gain 1 Aether            | 0      | 3   |
| Wispform Surge          | Spell   | 0    | 1   | On Resolve: Advance another Spell for free   | 0      | 1   |
| Greyfire Bloom          | Spell   | 1    | 1   | On Resolve: Advance another Spell for free   | 0      | 1   |
| Echoing Reservoir       | Spell   | 0    | 1   | On Resolve: Channel 1                        | 2      | 2   |
| Dormant Catalyst        | Spell   | 0    | 1   | On Resolve: Channel 2                        | 1      | 1   |
| Ashen Focus             | Spell   | 0    | 1   | On Resolve: Channel 1 and Draw 1             | 1      | 1   |
| Surge of Ash            | Instant | 1    | —   | Target Spell advances 1 step free            | 0      | 1   |
| Veil of Dust            | Instant | 1    | —   | Prevent 1 damage or negate a hostile Instant | 0      | 1   |
| Glyph of Remnant Light  | Glyph   | 0    | —   | When a Spell resolves → Gain 1 Aether        | 0      | 1   |
| Glyph of Returning Echo | Glyph   | 0    | —   | When you Channel Aether → Draw 1 card        | 0      | 1   |
*/
function starterDeck() {
  const PULSE = mk("c_pulse","Pulse of the Grey","SPELL",{playCost:0,pip:1,effect:"On resolve: Draw 1, gain Æ1.", aetherValue:0});
  const WISPF = mk("c_wisp","Wispform Surge","SPELL",{playCost:0,pip:1,effect:"On resolve: Advance another spell 1 (free).", aetherValue:0});
  const BLOOM = mk("c_bloom","Greyfire Bloom","SPELL",{playCost:1,pip:1,effect:"On resolve: Advance another spell 1 (free).", aetherValue:0});
  const ECHO  = mk("c_echo","Echoing Reservoir","SPELL",{playCost:0,pip:1,effect:"On resolve: Channel 1.", aetherValue:2});
  const CATAL = mk("c_catal","Dormant Catalyst","SPELL",{playCost:0,pip:1,effect:"On resolve: Channel 2.", aetherValue:1});
  const ASHEN = mk("c_ashen","Ashen Focus","SPELL",{playCost:0,pip:1,effect:"On resolve: Channel 1, draw 1.", aetherValue:1});
  const SURGE = mk("c_surge","Surge of Ash","INSTANT",{playCost:1,effect:"Target spell advances 1 step (free).", aetherValue:0});
  const VEIL  = mk("c_veil","Veil of Dust","INSTANT",{playCost:1,effect:"Prevent 1 damage or negate a hostile instant.", aetherValue:0});
  const GL1   = mk("g_light","Glyph of Remnant Light","GLYPH",{effect:"When a spell resolves: gain Æ1.", aetherValue:0});
  const GL2   = mk("g_echo","Glyph of Returning Echo","GLYPH",{effect:"When you channel Aether: draw 1.", aetherValue:0});

  return [
    ...dup(PULSE,3),
    WISPF,
    BLOOM,
    ...dup(ECHO,2),
    CATAL,
    ASHEN,
    SURGE,
    VEIL,
    GL1,
    GL2,
  ];
}

/* ===== Aetherflow Pool (river draws repeat these) =====
| Name                     | Type    | Cost | Pip             | Effect                                                   | Aether |
| Surge of Cinders         | Instant | 2    | —               | Deal 2 damage to any target                              | 0      |
| Pulse Feedback           | Instant | 3    | —               | Advance all Spells you control by 1                      | 0      |
| Refracted Will           | Instant | 2    | —               | Counter an Instant or negate a Glyph trigger             | 0      |
| Aether Impel             | Instant | 4    | —               | Gain 3 Aether this turn                                  | 0      |
| Cascade Insight          | Instant | 3    | —               | Draw 2 cards, then discard 1                             | 0      |
| Resonant Chorus          | Spell   | 0    | 1 (1 per step)  | On resolve: Gain 2 Aether and Channel 1                  | +1     |
| Emberline Pulse          | Spell   | 1    | 1               | On resolve: Deal 2 damage and draw 1                     | 0      |
| Fractured Memory         | Spell   | 0    | 2 (1 each)      | On resolve: Draw 2 cards                                 | 0      |
| Obsidian Vault           | Spell   | 0    | 1 (2)           | On resolve: Channel 2 and gain 1 Aether                  | +1     |
| Mirror Cascade           | Spell   | 1    | 1 (2)           | On resolve: Copy the next Instant you play this turn     | 0      |
| Sanguine Flow            | Spell   | 2    | 1               | On resolve: Lose 1 Vitality, gain 3 Aether               | 0      |
| Glyph of Withering Light | Glyph   | 0    | —               | When an opponent plays a Spell → They lose 1 Aether      | 0      |
| Glyph of Vigilant Echo   | Glyph   | 0    | —               | At end of your turn → Channel 1                          | 0      |
| Glyph of Buried Heat     | Glyph   | 0    | —               | When you discard a card for Aether → Gain 1 extra Aether | 0      |
| Glyph of Soulglass       | Glyph   | 0    | —               | When you buy a card from Aether Flow → Draw 1 card       | 0      |
*/
function marketPool() {
  return [
    mk("m_cinders","Surge of Cinders","INSTANT",{playCost:2, effect:"Deal 2 damage to any target.", aetherValue:0}),
    mk("m_feedback","Pulse Feedback","INSTANT",{playCost:3, effect:"Advance all spells you control by 1.", aetherValue:0}),
    mk("m_refract","Refracted Will","INSTANT",{playCost:2, effect:"Counter an instant or negate a glyph trigger.", aetherValue:0}),
    mk("m_impel","Aether Impel","INSTANT",{playCost:4, effect:"Gain Æ3 this turn.", aetherValue:0}),
    mk("m_cascade","Cascade Insight","INSTANT",{playCost:3, effect:"Draw 2 cards, then discard 1.", aetherValue:0}),

    mk("m_resonant","Resonant Chorus","SPELL",{playCost:0, pip:"1/step", effect:"On resolve: Gain Æ2 and Channel 1.", aetherValue:1}),
    mk("m_ember","Emberline Pulse","SPELL",{playCost:1, pip:1, effect:"On resolve: Deal 2 damage and draw 1.", aetherValue:0}),
    mk("m_fracture","Fractured Memory","SPELL",{playCost:0, pip:"2 (1 each)", effect:"On resolve: Draw 2 cards.", aetherValue:0}),
    mk("m_vault","Obsidian Vault","SPELL",{playCost:0, pip:"1 (2)", effect:"On resolve: Channel 2 and gain Æ1.", aetherValue:1}),
    mk("m_mirror","Mirror Cascade","SPELL",{playCost:1, pip:"1 (2)", effect:"On resolve: Copy the next instant you play this turn.", aetherValue:0}),
    mk("m_sanguine","Sanguine Flow","SPELL",{playCost:2, pip:1, effect:"On resolve: Lose 1 Vitality, gain Æ3.", aetherValue:0}),

    mk("g_wither","Glyph of Withering Light","GLYPH",{effect:"When an opponent plays a spell: they lose Æ1.", aetherValue:0}),
    mk("g_vigil","Glyph of Vigilant Echo","GLYPH",{effect:"End of your turn: Channel 1.", aetherValue:0}),
    mk("g_buried","Glyph of Buried Heat","GLYPH",{effect:"When you discard a card for Æ: gain +1 extra Æ.", aetherValue:0}),
    mk("g_soul","Glyph of Soulglass","GLYPH",{effect:"When you buy from Aether Flow: draw 1.", aetherValue:0}),
  ];
}

/* ===== State Init ===== */
export function initState() {
  // Build starting deck from quantities
  const deck = starterDeck();
  // Simple: first 5 to hand, rest counted
  const hand = deck.slice(0,5);
  const remaining = deck.slice(5);

  // Build a looping market deck from pool
  const pool = marketPool();
  const flowDeck = [];
  // Repeat the pool to make a long supply
  for (let i=0;i<80;i++) {
    const b = pool[i % pool.length];
    flowDeck.push({...b, id:`${b.id}_${i}`});
  }

  return {
    turn: 1,
    activePlayer: "player",
    flowSlots: [null,null,null,null,null],
    flowDeck,
    lastFlowDrop: null,
    lastBoughtCard: null,
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
        hand: [], // hidden
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

/* ===== River flow helpers (unchanged) ===== */
const slotCost = i => FLOW_COSTS[i] ?? 0;
function drawFlow(state){ return state.flowDeck.shift() || null; }
export function startTurn(state){
  if (!state.flowSlots[0]) state.flowSlots[0] = drawFlow(state);
  state.lastFlowDrop = null;
  return state;
}
export function endTurn(state){
  state.lastFlowDrop = state.flowSlots[4] || null;
  for (let i=state.flowSlots.length-1; i>=1; i--){
    state.flowSlots[i] = state.flowSlots[i-1];
  }
  state.flowSlots[0] = null;
  state.turn += 1;
  return state;
}

/* ===== Minimal hand/draw for demo (unchanged) ===== */
export function drawNewHand(state, n=5){
  // Pull from starter definition so updated cards appear in draw animation
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

/* ===== Actions (unchanged) ===== */
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
  state.lastBoughtCard = { ...card };

  for (let i=flowIndex; i>0; i--){
    state.flowSlots[i] = state.flowSlots[i-1];
  }
  state.flowSlots[0] = null;
  return state;
}
