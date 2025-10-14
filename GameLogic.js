/* ================================
   GameLogic.js  — v2.53-compatible
   Exports:
     - initState(opts)
     - serializePublic(state)
     - playCardToSpellSlot(state, who, cardId, slotIndex)
     - setGlyphFromHand(state, who, cardId)
     - buyFromFlow(state, who, flowIndex)
   ================================ */

/* ---------- utils ---------- */
const uid = (() => { let n = 0; return () => `c_${(++n).toString(36)}_${Date.now().toString(36)}`; })();
const clone = x => JSON.parse(JSON.stringify(x));
const randInt = (a,b)=> a+Math.floor(Math.random()*(b-a+1));
function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* ---------- SVG gem inline helper (for rules text replacement) ---------- */
function replaceAEWithGem(text){
  if (!text) return "";
  // Replace instances of " Æ" or "AE" in the rules text with a gem marker (renderer draws the actual SVG)
  return text.replace(/Æ|AE/g, "◆"); // renderer shows an inline gem icon; we keep a marker here
}

/* ---------- Deck definitions (LATEST) ---------- */
/** Base Deck — Shared Starting Deck */
const BASE_DECK_LIST = [
  { name:"Pulse of the Grey",  type:"SPELL",   cost:0, pip:1, aetherValue:0, qty:3,
    text:"On Resolve: Draw 1, Gain 1 ◆" },
  { name:"Wispform Surge",     type:"SPELL",   cost:0, pip:1, aetherValue:0, qty:1,
    text:"On Resolve: Advance another Spell 1 (free)" },
  { name:"Greyfire Bloom",     type:"SPELL",   cost:1, pip:1, aetherValue:0, qty:1,
    text:"On Resolve: Advance another Spell 1 (free)" },
  { name:"Echoing Reservoir",  type:"SPELL",   cost:0, pip:1, aetherValue:2, qty:2,
    text:"On Resolve: Channel 1" },
  { name:"Dormant Catalyst",   type:"SPELL",   cost:0, pip:1, aetherValue:1, qty:1,
    text:"On Resolve: Channel 2" },
  { name:"Ashen Focus",        type:"SPELL",   cost:0, pip:1, aetherValue:1, qty:1,
    text:"On Resolve: Channel 1 and Draw 1" },
  { name:"Surge of Ash",       type:"INSTANT", cost:1, pip:0, aetherValue:0, qty:1,
    text:"Target Spell advances 1 step free" },
  { name:"Veil of Dust",       type:"INSTANT", cost:1, pip:0, aetherValue:0, qty:1,
    text:"Prevent 1 damage or negate a hostile Instant" },
  { name:"Glyph of Remnant Light",  type:"GLYPH", cost:0, pip:0, aetherValue:0, qty:1,
    text:"When a Spell resolves → Gain 1 ◆" },
  { name:"Glyph of Returning Echo", type:"GLYPH", cost:0, pip:0, aetherValue:0, qty:1,
    text:"When you Channel Aether → Draw 1 card" },
];

/** Aetherflow (market) */
const FLOW_DECK_LIST = [
  { name:"Surge of Cinders", type:"INSTANT", cost:2, pip:0, aetherValue:0, qty:1,
    text:"Deal 2 damage to any target" },
  { name:"Pulse Feedback",   type:"INSTANT", cost:3, pip:0, aetherValue:0, qty:1,
    text:"Advance all Spells you control by 1" },
  { name:"Refracted Will",   type:"INSTANT", cost:2, pip:0, aetherValue:0, qty:1,
    text:"Counter an Instant or negate a Glyph trigger" },
  { name:"Aether Impel",     type:"INSTANT", cost:4, pip:0, aetherValue:0, qty:1,
    text:"Gain 3 ◆ this turn" },
  { name:"Cascade Insight",  type:"INSTANT", cost:3, pip:0, aetherValue:0, qty:1,
    text:"Draw 2 cards, then discard 1" },
  { name:"Resonant Chorus",  type:"SPELL",   cost:0, pip:1, aetherValue:1, qty:1,
    text:"On Resolve: Gain 2 ◆ and Channel 1" },
  { name:"Emberline Pulse",  type:"SPELL",   cost:1, pip:1, aetherValue:0, qty:1,
    text:"On Resolve: Deal 2 damage and Draw 1" },
  { name:"Fractured Memory", type:"SPELL",   cost:0, pip:2, aetherValue:0, qty:1,
    text:"On Resolve: Draw 2 cards" },
  { name:"Obsidian Vault",   type:"SPELL",   cost:0, pip:1, aetherValue:1, qty:1,
    text:"On Resolve: Channel 2 and Gain 1 ◆" },
  { name:"Mirror Cascade",   type:"SPELL",   cost:1, pip:1, aetherValue:0, qty:1,
    text:"On Resolve: Copy the next Instant you play this turn" },
  { name:"Sanguine Flow",    type:"SPELL",   cost:2, pip:1, aetherValue:0, qty:1,
    text:"On Resolve: Lose 1 Vitality, Gain 3 ◆" },
  { name:"Glyph of Withering Light", type:"GLYPH", cost:0, pip:0, aetherValue:0, qty:1,
    text:"When an opponent plays a Spell → They lose 1 ◆" },
  { name:"Glyph of Vigilant Echo",  type:"GLYPH", cost:0, pip:0, aetherValue:0, qty:1,
    text:"At end of your turn → Channel 1" },
  { name:"Glyph of Buried Heat",    type:"GLYPH", cost:0, pip:0, aetherValue:0, qty:1,
    text:"When you discard a card for ◆ → Gain 1 extra ◆" },
  { name:"Glyph of Soulglass",      type:"GLYPH", cost:0, pip:0, aetherValue:0, qty:1,
    text:"When you buy a card from Aether Flow → Draw 1 card" },
];

/* Price track for river */
const FLOW_PRICES = [4,3,3,2,2];

/* ---------- factories ---------- */
function expandList(list){
  const out = [];
  list.forEach(row=>{
    const qty = Math.max(1, Number(row.qty||1));
    for (let i=0;i<qty;i++){
      out.push({
        id: uid(),
        name: row.name,
        type: row.type.toUpperCase(),
        price: row.cost ?? 0,
        pip: Number(row.pip||0),
        aetherValue: Number(row.aetherValue||0),
        text: replaceAEWithGem(row.text||""),
      });
    }
  });
  return out;
}

/* “empty” flow card for UI spacing (still shows a price label) */
function emptyFlowCard(price){
  return { id: uid(), name:"Empty", type:"", price, pip:0, aetherValue:0, text:"", _empty:true };
}

/* ---------- state shape ----------

state = {
  turn: { player: "player" | "ai", turnCount: number },
  players: {
    player: { aether, health, weaver, deck, hand, discard, slots:[3 spell + 1 glyph] },
    ai:     { ...same }
  },
  flow: [5 cards],          // river from left (expensive) -> right (cheap)
  flowDeck: [remaining],    // draw source for river (shuffled)
}

----------------------------------- */

function makeWeaver(isPlayer){
  return {
    name: isPlayer ? "Player" : "Opponent",
    portrait: isPlayer ? "./weaver_aria.jpg" : "./weaver_morr.jpg",
  };
}

function makePlayer(isPlayer){
  const deck = shuffle(expandList(BASE_DECK_LIST));
  const hand = [];
  const discard = [];
  const slots = [
    { hasCard:false, card:null }, // spell 0
    { hasCard:false, card:null }, // spell 1
    { hasCard:false, card:null }, // spell 2
    { isGlyph:true, hasCard:false, card:null }, // glyph
  ];
  return {
    aether: 0,
    health: 5,
    weaver: makeWeaver(isPlayer),
    deck, hand, discard, slots
  };
}

/* ---------- init & helpers ---------- */
export function initState(opts={}){
  const st = {
    turn: { player: "player", turnCount: 1 },
    players: {
      player: makePlayer(true),
      ai: makePlayer(false)
    },
    flowDeck: shuffle(expandList(FLOW_DECK_LIST)),
    flow: [], // filled below
  };

  // Draw opening hand (5)
  drawCards(st, "player", 5);
  drawCards(st, "ai", 5);

  // Flow starts with 1 card revealed at leftmost price, others “empty”
  const first = drawFlowCard(st);
  st.flow = [
    first ?? emptyFlowCard(FLOW_PRICES[0]),
    emptyFlowCard(FLOW_PRICES[1]),
    emptyFlowCard(FLOW_PRICES[2]),
    emptyFlowCard(FLOW_PRICES[3]),
    emptyFlowCard(FLOW_PRICES[4]),
  ];

  return st;
}

/* Draw n cards from deck to hand; shuffle discard when deck is empty */
function drawCards(state, who, n=1){
  const P = state.players[who];
  for(let i=0;i<n;i++){
    if (!P.deck.length){
      if (P.discard.length){
        P.deck = shuffle(P.discard.splice(0));
      }else{
        break;
      }
    }
    const card = P.deck.pop();
    P.hand.push(card);
  }
}

/* Flow draws */
function drawFlowCard(state){
  return state.flowDeck.length ? state.flowDeck.pop() : null;
}

/* Advance the river one step right (end of turn), then add a new card at left price */
function advanceRiver(state){
  // shift right; rightmost drops off
  for (let i=state.flow.length-1; i>0; i--){
    state.flow[i] = state.flow[i-1];
  }
  // top-deck to leftmost, else empty
  const newCard = drawFlowCard(state) ?? emptyFlowCard(FLOW_PRICES[0]);
  state.flow[0] = newCard;
  // Reapply prices
  state.flow.forEach((c, i)=> c.price = FLOW_PRICES[i]);
  return state;
}

/* Refill gaps (after buying) by sliding left -> right, then pull a new one at left */
function refillAfterPurchase(state){
  // collapse empties by moving everything toward the rightmost end
  for (let i=0;i<state.flow.length-1;i++){
    if (state.flow[i]._empty){
      // bubble a real card from right if any
      for (let j=i;j<state.flow.length-1;j++){
        [state.flow[j], state.flow[j+1]] = [state.flow[j+1], state.flow[j]];
      }
    }
  }
  // put a new card on left (position 0)
  const newCard = drawFlowCard(state) ?? emptyFlowCard(FLOW_PRICES[0]);
  // shift right to make space
  for (let k=state.flow.length-1; k>0; k--){
    state.flow[k] = state.flow[k-1];
  }
  state.flow[0] = newCard;
  // normalize prices
  state.flow.forEach((c, i)=> c.price = FLOW_PRICES[i]);
}

/* ---------- Game actions ---------- */
export function playCardToSpellSlot(state, who, cardId, slotIndex){
  const S = clone(state);
  const P = S.players[who];
  if (slotIndex<0 || slotIndex>2) throw new Error("Choose a spell slot.");
  const slot = P.slots[slotIndex];
  if (slot.hasCard) throw new Error("Slot occupied.");

  const handIdx = P.hand.findIndex(c=> c.id===cardId);
  if (handIdx<0) throw new Error("Card not in hand.");
  const card = P.hand[handIdx];
  if (card.type !== "SPELL") throw new Error("Only Spells go to Spell slots.");

  // (Optionally check costs, pip, etc.)
  P.hand.splice(handIdx,1);
  slot.hasCard = true;
  slot.card = card;
  return S;
}

export function setGlyphFromHand(state, who, cardId){
  const S = clone(state);
  const P = S.players[who];
  const slot = P.slots[3]; // glyph
  if (slot.hasCard) throw new Error("Glyph slot occupied.");
  const idx = P.hand.findIndex(c=> c.id===cardId);
  if (idx<0) throw new Error("Card not in hand.");
  const card = P.hand[idx];
  if (card.type !== "GLYPH") throw new Error("Only Glyphs can be placed here.");

  P.hand.splice(idx,1);
  slot.hasCard = true;
  slot.card = card;
  return S;
}

export function buyFromFlow(state, who, flowIndex){
  const S = clone(state);
  const P = S.players[who];
  const card = S.flow[flowIndex];
  if (!card || card._empty) throw new Error("Nothing to buy here.");
  const price = Number(card.price||0);
  if (P.aether < price) throw new Error("Not enough Aether.");
  P.aether -= price;

  // Bought card goes to discard
  P.discard.push(card);

  // leave an empty placeholder at that slot so refill can slide
  S.flow[flowIndex] = emptyFlowCard(FLOW_PRICES[flowIndex]);
  refillAfterPurchase(S);
  return S;
}

/* ---------- Turn helpers (hook these to UI as needed) ---------- */
function startTurn(state){
  // River reveals one new card at left at the start of your turn
  // (Your baseline was “start with 1 revealed, then end of turn it moves down”.
  // Keeping it simple: we advance river at END of turn.)
  drawCards(state, "player", 1);
}

function endTurn(state){
  // discard player hand (visual handled in UI; we really move to discard here)
  const P = state.players.player;
  while (P.hand.length) P.discard.push(P.hand.pop());
  // river advances
  advanceRiver(state);
  // simple AI stub: draw 1, discard 1
  const A = state.players.ai;
  drawCards(state, "ai", 1);
  if (A.hand.length) A.discard.push(A.hand.pop());
  // back to player, draw 1
  drawCards(state, "player", 1);
  state.turn.turnCount += 1;
}

/* ---------- serialization for renderer ---------- */
export function serializePublic(state){
  const S = state; // not cloning here; renderer doesn’t mutate
  return {
    player: {
      aether: S.players.player.aether,
      health: S.players.player.health,
      weaver: clone(S.players.player.weaver),
      hand:   clone(S.players.player.hand),
      slots:  clone(S.players.player.slots),
    },
    ai: {
      aether: S.players.ai.aether,
      health: S.players.ai.health,
      weaver: clone(S.players.ai.weaver),
      handCount: S.players.ai.hand.length,
      slots:  clone(S.players.ai.slots),
    },
    flow: clone(S.flow),
    turn: clone(S.turn),
  };
}

/* ---------- expose minimal control (optional) ---------- */
export const __dev = {
  drawCards, advanceRiver, endTurn, startTurn
};
