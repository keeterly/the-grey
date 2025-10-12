// Minimal engine for v2.5 UI (data only)

const FLOW_COSTS = [4,3,2,2,2];
const STARTING_VITALITY = 5;

function mkCard(id, name, type, price) {
  return { id, name, type, price };
}

function starterHand() {
  return [
    { id:"h1", name:"Pulse of the Grey", type:"SPELL",   aetherValue:0 },
    { id:"h2", name:"Echoing Reservoir", type:"SPELL",   aetherValue:2 },
    { id:"h3", name:"Dormant Catalyst",  type:"SPELL",   aetherValue:1 },
    { id:"h4", name:"Veil of Dust",      type:"INSTANT", aetherValue:0 },
    { id:"h5", name:"Ashen Focus",       type:"SPELL",   aetherValue:1 },
  ];
}

export function initState() {
  return {
    turn: 1,
    activePlayer: "player",
    flow: [
      mkCard("f1","Resonant Chorus","SPELL",   FLOW_COSTS[0]),
      mkCard("f2","Pulse Feedback","INSTANT",  FLOW_COSTS[1]),
      mkCard("f3","Refracted Will","GLYPH",    FLOW_COSTS[2]),
      mkCard("f4","Cascade Insight","INSTANT", FLOW_COSTS[3]),
      mkCard("f5","Obsidian Vault","SPELL",    FLOW_COSTS[4]),
    ],
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: starterHand(),
        discard: [],
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
        ],
        glyph: { hasCard:false, card:null },
        weaver: { id:"aria", name:"Aria, Runesurge Adept", stage:0, portrait:"" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0, channeled: 0,
        deckCount: 10,
        hand: [],
        discard: [],
        slots: [
          { hasCard:false, card:null },
          { hasCard:false, card:null },
          { hasCard:false, card:null },
        ],
        glyph: { hasCard:false, card:null },
        weaver: { id:"morr", name:"Morr, Gravecurrent Binder", stage:0, portrait:"" },
      }
    }
  };
}

export function serializePublic(state) {
  const P = state.players.player;
  const AI = state.players.ai;
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    flow: state.flow,
    player: {
      aether: P.aether, channeled: P.channeled, vitality: P.vitality,
      hand: P.hand,
      slots: [...P.slots, {isGlyph:true, ...P.glyph}],
      weaver: P.weaver
    },
    ai: {
      aether: AI.aether, channeled: AI.channeled, vitality: AI.vitality,
      slots: [...AI.slots, {isGlyph:true, ...AI.glyph}],
      weaver: AI.weaver
    }
  };
}

function playCardToSpellSlot(state, playerId, cardId, slotIndex){
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

function discardForAether(state, playerId, cardId){
  const P = state.players[playerId];
  const i = P.hand.findIndex(c => c.id === cardId);
  if (i < 0) throw new Error("card not in hand");
  const card = P.hand.splice(i,1)[0];
  P.aether += (card.aetherValue || 0);
  P.discard.push(card);
  return state;
}

function buyFromFlow(state, playerId, flowIndex){
  const P = state.players[playerId];
  const card = state.flow[flowIndex];
  if (!card) throw new Error("no card in that flow slot");
  const cost = card.price || 0;
  if (P.aether + P.channeled < cost) throw new Error("not enough Æ to buy");

  let pay = cost;
  const spentCh = Math.min(P.channeled, pay);
  P.channeled -= spentCh; pay -= spentCh;
  P.aether -= pay;

  P.discard.push({...card, id:`b_${card.id}_${Date.now()}`});
  return state;
}

function startTurn(state){ return state; }
function endTurn(state){ state.turn += 1; state.activePlayer = (state.activePlayer === 'player') ? 'ai' : 'player'; return state; }

export function reducer(state, action){
  const S = JSON.parse(JSON.stringify(state));
  switch(action.type){
    case 'PLAY_CARD_TO_SLOT': return playCardToSpellSlot(S, action.player, action.cardId, action.slotIndex);
    case 'DISCARD_FOR_AETHER': return discardForAether(S, action.player, action.cardId);
    case 'BUY_FROM_FLOW': return buyFromFlow(S, action.player, action.flowIndex);
    case 'START_TURN': return startTurn(S);
    case 'END_TURN': return endTurn(S);
    default: return state;
  }
}
