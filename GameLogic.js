// Minimal engine for v2.5 UI with basic draw/discard/end-turn loop.

const FLOW_COSTS = [4,3,2,2,2];
const STARTING_VITALITY = 5;
const HAND_SIZE = 5;

function mkCard(id, name, type, price, aetherValue=0) {
  return { id, name, type, price, aetherValue, cost: price };
}

function starterDeck() {
  // super simple 10-card deck
  return [
    mkCard("d1","Apprentice Bolt","SPELL", 0, 0),
    mkCard("d2","Apprentice Bolt","SPELL", 0, 0),
    mkCard("d3","Apprentice Bolt","SPELL", 0, 0),
    mkCard("d4","Apprentice Bolt","SPELL", 0, 0),
    mkCard("d5","Apprentice Bolt","SPELL", 0, 0),
    mkCard("d6","Ashen Focus","SPELL", 1, 1),
    mkCard("d7","Dormant Catalyst","SPELL", 1, 1),
    mkCard("d8","Echoing Reservoir","SPELL", 2, 2),
    mkCard("d9","Veil of Dust","INSTANT", 0, 0),
    mkCard("d10","Pulse of the Grey","SPELL", 0, 0),
  ];
}
function starterHand() {
  // draw handled by initState; this fallback is unused
  return [];
}

export function initState(opts = {}) {
  const deck = starterDeck();
  const player = {
    vitality: STARTING_VITALITY,
    aether: 0, channeled: 0,
    deck, discard: [], hand: [],
    slots: [
      { hasCard:false, card:null },
      { hasCard:false, card:null },
      { hasCard:false, card:null },
      glyph: { hasCard:false, card:null, isGlyph:true }
    ],
    weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"./weaver_aria.jpg" },
  };
  drawUpTo(player, HAND_SIZE);

  const ai = {
    vitality: STARTING_VITALITY,
    aether: 0, channeled: 0,
    deck: starterDeck(), discard: [], hand: [],
    slots: [
      { hasCard:false, card:null },
      { hasCard:false, card:null },
      { hasCard:false, card:null },
      glyph: { hasCard:false, card:null, isGlyph:true }
    ],
    weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"./weaver_morr.jpg" },
  };

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
    players: { player, ai }
  };
}

function draw(p, n=1){
  for (let i=0;i<n;i++){
    if (!p.deck.length){
      if (!p.discard.length) break;
      // shuffle discard into deck
      p.deck = shuffle(p.discard);
      p.discard = [];
    }
    p.hand.push(p.deck.shift());
  }
}
function drawUpTo(p, size){
  const need = Math.max(0, size - p.hand.length);
  draw(p, need);
}
function shuffle(a){
  const arr = a.slice();
  for (let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

export function serializePublic(state) {
  const P = state.players.player;
  const A = state.players.ai;
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: {
      ...P,
      deckCount: P.deck.length,
      discardCount: P.discard.length,
    },
    ai: {
      ...A,
      deckCount: A.deck.length,
      discardCount: A.discard.length,
    },
  };
}

/* -------- Actions -------- */
export function reducer(state, action){
  const S = structuredClone(state);
  switch(action.type){
    case "START_TURN":
      S.activePlayer = action.player || "player";
      return S;

    case "DISCARD_FOR_AETHER":{
      const P = S.players[action.player];
      const i = P.hand.findIndex(c=>c.id===action.cardId);
      if (i<0) throw new Error("not in hand");
      const [c] = P.hand.splice(i,1);
      P.aether += c.aetherValue ?? 0;
      P.discard.push(c);
      return S;
    }

    case "PLAY_CARD_TO_SLOT":{
      const P = S.players[action.player];
      if (action.slotIndex<0 || action.slotIndex>2) throw new Error("slot 0..2");
      const slot = P.slots[action.slotIndex];
      if (slot.hasCard) throw new Error("slot occupied");
      const i = P.hand.findIndex(c=>c.id===action.cardId);
      if (i < 0) throw new Error("card not in hand");
      const card = P.hand[i];
      if (card.type !== "SPELL") throw new Error("only SPELL can be played to spell slots");
      P.hand.splice(i,1);
      slot.card = card;
      slot.hasCard = true;
      return S;
    }

    case "BUY_FROM_FLOW":{
      const P = S.players[action.player];
      const c = S.flow[action.flowIndex];
      if (!c) throw new Error("no card");
      const cost = c.price ?? c.cost ?? 0;
      if ((P.aether|0) < cost) throw new Error("not enough Æ");
      P.aether -= cost;
      // bought cards go to discard (deck-builder feel)
      P.discard.push({...c, id:`b-${Date.now()}-${Math.random().toString(16).slice(2)}`});
      return S;
    }

    case "END_TURN":{
      // player discards hand, draws new; very simple AI turn (mirror)
      const P = S.players.player;
      // move hand to discard
      while (P.hand.length) P.discard.push(P.hand.pop());
      drawUpTo(P, HAND_SIZE);

      // AI stub: discard and draw
      const A = S.players.ai;
      while (A.hand.length) A.discard.push(A.hand.pop());
      drawUpTo(A, HAND_SIZE);

      S.turn += 1;
      S.activePlayer = "player";
      return S;
    }

    default:
      return S;
  }
}
