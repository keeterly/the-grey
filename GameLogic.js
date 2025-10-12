// Minimal engine for v2.5 UI. Safe, predictable actions the UI calls.

const FLOW_COSTS = [4,3,2,2,2];
const STARTING_VITALITY = 5;
const HAND_SIZE = 5;

function mkCard(id, name, type, price=0, aetherValue=0) {
  return { id, name, type, price, aetherValue };
}

function starterHand() {
  return [
    mkCard("h1","Pulse of the Grey","SPELL", 0, 0),
    mkCard("h2","Echoing Reservoir","SPELL", 0, 2),
    mkCard("h3","Dormant Catalyst","SPELL", 0, 1),
    mkCard("h4","Veil of Dust","INSTANT", 0, 0),
    mkCard("h5","Ashen Focus","SPELL", 0, 1),
  ];
}

function starterDeck(){
  // simple filler deck so draw works
  const cards = [];
  for(let i=0;i<12;i++) cards.push(mkCard("d"+i, "Apprentice Bolt", "SPELL", 0, 0));
  return cards;
}

export function initState(opts = {}) {
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
        deck: starterDeck(),
        hand: starterHand(),
        discard: [],
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null, isGlyph:true }, // glyph bay
        ],
        weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deck: starterDeck(),
        hand: [],
        discard: [],
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null, isGlyph:true },
        ],
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"" },
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

/* helpers */
function drawUpTo(player, n){
  while(player.hand.length < n){
    if (player.deck.length === 0){
      if (player.discard.length === 0) break;
      // reshuffle (simple)
      player.deck = player.discard.splice(0);
    }
    player.hand.push(player.deck.shift());
  }
}
function findCardInHand(player, id){
  const i = player.hand.findIndex(c => c.id === id);
  if (i < 0) throw new Error("card not in hand");
  return i;
}

/* reducer */
export function reducer(state, action){
  const S = state;
  const P = S.players[action.player || "player"];

  switch(action.type){

    case "START_TURN":{
      S.activePlayer = "player";
      // could add start-of-turn effects here
      return S;
    }

    case "END_TURN":{
      // discard hand
      while(P.hand.length) P.discard.push(P.hand.pop());
      // dummy AI turn (no-op)…
      // draw new hand
      drawUpTo(P, HAND_SIZE);
      S.turn += 1;
      return S;
    }

    case "DISCARD_FOR_AETHER":{
      const i = findCardInHand(P, action.cardId);
      const card = P.hand.splice(i,1)[0];
      P.aether += (card.aetherValue || 0);
      P.discard.push(card);
      return S;
    }

    case "PLAY_CARD_TO_SLOT":{
      const slotIndex = action.slotIndex|0;
      if (slotIndex < 0 || slotIndex > 2) throw new Error("spell slot index 0..2");
      const slot = P.slots[slotIndex];
      if (slot.hasCard) throw new Error("slot occupied");

      const i = findCardInHand(P, action.cardId);
      const card = P.hand[i];
      if (card.type !== "SPELL") throw new Error("only SPELL can be played to spell slots");

      P.hand.splice(i,1);
      slot.card = card;
      slot.hasCard = true;
      return S;
    }

    case "BUY_FROM_FLOW":{
      const idx = action.flowIndex|0;
      const flowCard = S.flow[idx];
      if (!flowCard) throw new Error("no card there");
      const cost = flowCard.price|0;
      if ((P.aether|0) < cost) throw new Error("not enough Æther");
      P.aether -= cost;
      // put into discard (deck-builder feel)
      P.discard.push({...flowCard, price:0});
      return S;
    }

    default: return S;
  }
}
