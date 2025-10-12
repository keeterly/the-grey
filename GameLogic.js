// Minimal engine for v2.5 UI with turn, draw, discard, and simple river buying

const FLOW_COSTS = [4,3,2,2,2];
const HAND_SIZE = 5;
const STARTING_VITALITY = 5;

function mkCard(id, name, type, price) {
  return { id, name, type, price };
}
function mkSpell(id, name, aetherValue = 0) {
  return { id, name, type: "SPELL", aetherValue };
}

function starterHand() {
  return [
    mkSpell("h1","Pulse of the Grey",0),
    mkSpell("h2","Echoing Reservoir",2),
    mkSpell("h3","Dormant Catalyst",1),
    { id:"h4", name:"Veil of Dust", type:"INSTANT", aetherValue:0 },
    mkSpell("h5","Ashen Focus",1),
  ];
}

export function initState() {
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
          { hasCard:false, card:null }, { hasCard:false, card:null }, { hasCard:false, card:null }
        ],
        weaver: { id:"aria", name:"Aria, Runesurge Adept",
          portrait:"./weaver_aria.jpg" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: [],
        discardCount: 0,
        slots: [
          { hasCard:false, card:null }, { hasCard:false, card:null }, { hasCard:false, card:null }
        ],
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder",
          portrait:"./weaver_morr.jpg" },
      }
    }
  };
}

export function serializePublic(state) {
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: state.players.player,
    ai: state.players.ai,
  };
}

/* ---------- helpers ---------- */
let uid = 1000;
function nextId(){ return "c"+(uid++); }

function drawN(state, playerId, n){
  const P = state.players[playerId];
  for (let i=0;i<n;i++){
    if (P.deckCount <= 0 && P.discardCount > 0){
      // reshuffle
      P.deckCount = P.discardCount;
      P.discardCount = 0;
    }
    if (P.deckCount <= 0) break;
    P.deckCount--;
    P.hand.push(mkSpell(nextId(),"Apprentice Bolt",0));
  }
  return state;
}

/* drag-to-slot: hand SPELL -> player spell slot */
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

/* ---------- reducer ---------- */
export function reducer(state, action){
  const S = state;

  switch(action.type){
    case "PLAY_CARD_TO_SLOT":
      return playCardToSpellSlot(S, "player", action.cardId, action.slotIndex);

    case "DISCARD_FOR_AETHER": {
      const P = S.players.player;
      const i = P.hand.findIndex(c=>c.id===action.cardId);
      if (i<0) throw new Error("card not in hand");
      const c = P.hand[i];
      P.hand.splice(i,1);
      P.aether += (c.aetherValue||0);
      P.discardCount++;
      return S;
    }

    case "BUY_FROM_FLOW": {
      const P = S.players.player;
      const card = S.flow[action.flowIndex];
      if (!card) throw new Error("no card there");
      const cost = card.price || 0;
      if (P.aether < cost) throw new Error("not enough Æ");
      P.aether -= cost;
      // Add purchased card to discard
      P.discardCount++;
      // River drift: simple rotate (keep same list for now)
      return S;
    }

    case "START_TURN": {
      S.activePlayer = "player";
      return S;
    }

    case "END_TURN": {
      // Discard player's hand
      const P = S.players.player;
      P.discardCount += P.hand.length;
      P.hand = [];
      // simple AI turn: AI discards nothing, gains 1 Æ (flavor)
      S.players.ai.aether = (S.players.ai.aether||0) + 1;
      // new player hand
      drawN(S, "player", HAND_SIZE);
      S.turn += 1;
      S.activePlayer = "player";
      return S;
    }

    default: return S;
  }
}
