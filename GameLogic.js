// v2.53 baseline logic — decks, flow, actions, simple turn engine.

export const FLOW_COSTS = [4,3,3,2,2];
export const STARTING_VITALITY = 5;

/* ---------- Helpers ---------- */
const rand = (n)=> Math.floor(Math.random()*n);
export const shuffle = (arr)=> {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){ const j=rand(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
};
const mk = (id,name,type,{cost=0,pip=0,text="",aetherValue=0}={}) =>
  ({ id,name,type,cost,pip,text,aetherValue });

/* ---------- Base Deck (shared) ---------- */
export function makeBaseDeck(){
  const D = [];
  D.push(...Array.from({length:3},(_,k)=> mk(`bd_pulse_${k+1}`,"Pulse of the Grey","SPELL",{pip:1, text:"On Resolve: Draw 1, gain :GEM:", aetherValue:0})));
  D.push( mk("bd_wisp","Wispform Surge","SPELL",{pip:1, text:"On Resolve: Advance another Spell 1 (free)", aetherValue:0}) );
  D.push( mk("bd_bloom","Greyfire Bloom","SPELL",{cost:1,pip:1, text:"On Resolve: Advance another Spell 1 (free)", aetherValue:0}) );
  D.push(...Array.from({length:2},(_,k)=> mk(`bd_echo_${k+1}`,"Echoing Reservoir","SPELL",{pip:1, text:"On Resolve: Channel 1", aetherValue:2})));
  D.push( mk("bd_dorm","Dormant Catalyst","SPELL",{pip:1, text:"On Resolve: Channel 2", aetherValue:1}) );
  D.push( mk("bd_ash","Ashen Focus","SPELL",{pip:1, text:"On Resolve: Channel 1 and Draw 1", aetherValue:1}) );
  D.push( mk("bd_surge","Surge of Ash","INSTANT",{cost:1, text:"Target Spell advances 1 step (free)"}));
  D.push( mk("bd_veil","Veil of Dust","INSTANT",{cost:1, text:"Prevent 1 damage or negate a hostile Instant"}));
  D.push( mk("bd_glyph_light","Glyph of Remnant Light","GLYPH",{text:"When a Spell resolves → gain :GEM:"}));
  D.push( mk("bd_glyph_echo","Glyph of Returning Echo","GLYPH",{text:"When you Channel Aether → Draw 1"}));
  return D;
}

/* ---------- Aetherflow (market) deck ---------- */
export function makeFlowDeck(){
  return [
    mk("af_cinders","Surge of Cinders","INSTANT",{cost:2, text:"Deal 2 damage to any target"}),
    mk("af_feedback","Pulse Feedback","INSTANT",{cost:3, text:"Advance all Spells you control by 1"}),
    mk("af_refract","Refracted Will","INSTANT",{cost:2, text:"Counter an Instant or negate a Glyph trigger"}),
    mk("af_impel","Aether Impel","INSTANT",{cost:4, text:"Gain 3 :GEM: this turn"}),
    mk("af_cascade","Cascade Insight","INSTANT",{cost:3, text:"Draw 2 cards, then discard 1"}),
    mk("af_resonant","Resonant Chorus","SPELL",{pip:1, text:"On Resolve: Gain 2 :GEM: and Channel 1", aetherValue:1}),
    mk("af_ember","Emberline Pulse","SPELL",{cost:1,pip:1, text:"On Resolve: Deal 2 damage and Draw 1"}),
    mk("af_memory","Fractured Memory","SPELL",{pip:2, text:"On Resolve: Draw 2 cards"}),
    mk("af_vault","Obsidian Vault","SPELL",{pip:1, text:"On Resolve: Channel 2 and gain :GEM:", aetherValue:1}),
    mk("af_mirror","Mirror Cascade","SPELL",{cost:1,pip:1, text:"On Resolve: Copy the next Instant you play this turn"}),
    mk("af_sanguine","Sanguine Flow","SPELL",{cost:2,pip:1, text:"On Resolve: Lose 1 Vitality, Gain 3 :GEM:"}),
    mk("af_gwither","Glyph of Withering Light","GLYPH",{text:"When an opponent plays a Spell → They lose 1 :GEM:"}),
    mk("af_gvigil","Glyph of Vigilant Echo","GLYPH",{text:"At end of your turn → Channel 1"}),
    mk("af_gburied","Glyph of Buried Heat","GLYPH",{text:"When you discard for Aether → Gain +1 :GEM:"}),
    mk("af_gglass","Glyph of Soulglass","GLYPH",{text:"When you buy from Aether Flow → Draw 1"}),
  ];
}

/* ---------- Initial state ---------- */
export function initState(){
  const playerDeck = shuffle(makeBaseDeck());
  const aiDeck     = shuffle(makeBaseDeck());
  const flowPile   = shuffle(makeFlowDeck());

  const hand = playerDeck.splice(0,5);

  return {
    turn: 1,
    active: "player",
    flowPile,             // draw source for the river
    flowSlots: [null,null,null,null,null], // revealed cards
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0, trance: 0,
        deck: playerDeck, discard: [],
        hand,
        discardCount: 0,
        slots: [ {hasCard:false},{hasCard:false},{hasCard:false},{isGlyph:true,hasCard:false} ],
        weaver: { name:"Player", portrait:"./weaver_aria.jpg" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0, trance: 0,
        deck: aiDeck, discard: [],
        hand: [], // hidden
        discardCount: 0,
        slots: [ {hasCard:false},{hasCard:false},{hasCard:false},{isGlyph:true,hasCard:false} ],
        weaver: { name:"Opponent", portrait:"./weaver_morr.jpg" },
      }
    }
  };
}

/* ---------- Turn/Flow mechanics ---------- */
export function startOfTurn(state){
  // Reveal a new flow card into slot 0 (left)
  if (state.flowSlots[0] == null && state.flowPile.length){
    state.flowSlots[0] = state.flowPile.shift();
  }
  // Draw to 5 (simple)
  const P = state.players.player;
  while (P.hand.length < 5 && P.deck.length){
    P.hand.push(P.deck.shift());
  }
  return state;
}
export function endOfTurn(state){
  // Discard entire hand (visualized higher layer)
  const P = state.players.player;
  while (P.hand.length){ P.discard.push(P.hand.pop()); P.discardCount++; }

  // Slide the river: 0→1→2→3→4 ; 4 falls to void
  for (let i=FLOW_COSTS.length-1;i>0;i--){
    state.flowSlots[i] = state.flowSlots[i-1];
  }
  state.flowSlots[0] = null;

  // pass to AI (stub), back to player
  state.active = "ai";
  state.active = "player";
  state.turn += 1;
  return state;
}

/* ---------- Actions ---------- */
export function buyFromFlow(state, playerId, idx){
  const card = state.flowSlots[idx];
  const cost = FLOW_COSTS[idx] || 0;
  const P = state.players[playerId];
  if (!card) throw new Error("Empty slot.");
  if (P.aether < cost) throw new Error("Not enough Aether.");
  P.aether -= cost;
  P.discard.push(card); P.discardCount++;
  state.flowSlots[idx] = null; // will slide at end of turn; or keep empty until then
  return state;
}

export function playCardToSpellSlot(state, playerId, cardId, slotIndex){
  const P = state.players[playerId];
  if (slotIndex<0 || slotIndex>2) throw new Error("Use a spell slot.");
  const slot = P.slots[slotIndex];
  if (slot.hasCard) throw new Error("Slot occupied.");

  const i = P.hand.findIndex(c=>c.id===cardId);
  if (i<0) throw new Error("Card not found.");
  const card = P.hand[i];
  if (card.type!=="SPELL") throw new Error("Only SPELL goes here.");

  P.hand.splice(i,1);
  slot.card = card; slot.hasCard = true;
  return state;
}
export function setGlyphFromHand(state, playerId, cardId){
  const P = state.players[playerId];
  const slot = P.slots[3];
  if (slot.hasCard) throw new Error("Glyph slot occupied.");
  const i = P.hand.findIndex(c=>c.id===cardId);
  if (i<0) throw new Error("Card not found.");
  const card = P.hand[i];
  if (card.type!=="GLYPH") throw new Error("Only GLYPH goes here.");
  P.hand.splice(i,1);
  slot.card = card; slot.hasCard = true;
  return state;
}
export function discardForAether(state, playerId, cardId){
  const P = state.players[playerId];
  const i = P.hand.findIndex(c=>c.id===cardId);
  if (i<0) throw new Error("Card not found.");
  const card = P.hand[i];
  const gain = Math.max(0, card.aetherValue||0);
  P.hand.splice(i,1);
  P.discard.push(card); P.discardCount++; P.aether += gain;
  return state;
}

/* ---------- public snapshot ---------- */
export function snapshot(state){
  return {
    turn: state.turn,
    active: state.active,
    flowSlots: state.flowSlots,
    flowCosts: FLOW_COSTS,
    players: {
      player: {
        ...state.players.player,
        deckCount: state.players.player.deck.length,
      },
      ai: {
        ...state.players.ai,
        deckCount: state.players.ai.deck.length,
      }
    }
  };
}
