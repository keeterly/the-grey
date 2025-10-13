// GameLogic.js — v2.51 UI Patch
// Minimal engine stubs to support UI demo. Integrate with your real engine as needed.

const FLOW_COSTS = [4, 3, 3, 2, 2]; // river costs, left->right
const STARTING_VITALITY = 5;

function sampleCardPool(){
  // A tiny pool for demo. Replace with your real card set.
  return [
    { id:"s1", name:"Spark",   type:"SPELL", text:"Advance 1 AE: Deal 1.", aetherValue:1 },
    { id:"s2", name:"Ember",   type:"SPELL", text:"Advance 1 AE: Heal 1.", aetherValue:1 },
    { id:"g1", name:"Sigil",   type:"GLYPH", text:"Ongoing: +1 Æ each buy.", aetherValue:0 },
    { id:"s3", name:"Pulse",   type:"SPELL", text:"Advance 2 AE: Stun.", aetherValue:2 },
    { id:"s4", name:"Wave",    type:"SPELL", text:"Advance 3 AE: Draw 2.", aetherValue:2 },
    { id:"s5", name:"Flicker", type:"SPELL", text:"Advance 1 AE: +1 Æ.", aetherValue:1 },
  ];
}

function generateFlow(){
  const pool = sampleCardPool();
  // pick first 5 just for demo; price from FLOW_COSTS
  return Array.from({length:5}, (_,i)=>{
    const c = pool[(i)%pool.length];
    return { ...c, price: FLOW_COSTS[i] };
  });
}

function initState(){
  return {
    turn: 1,
    active: "player",
    player: { aether: 0, vitality: STARTING_VITALITY, trance: 0, hand: [], slots:[null,null,null,null] },
    ai:     { aether: 0, vitality: STARTING_VITALITY, trance: 0, slots:[null,null,null,null] },
    flow: generateFlow(),
    discard: [],
    deck: [],
  };
}

// Engine stub: buy from flow -> move to discard
function buyFromFlow(state, who, index){
  if (index < 0 || index >= state.flow.length) throw new Error("Invalid pick");
  const buyer = state[who];
  const card = state.flow[index];
  const cost = card.price || 0;
  if ((buyer.aether|0) < cost) throw new Error("Not enough Æ");
  buyer.aether -= cost;
  state.discard.push(card);
  // Replace bought card with a new one (same cost position)
  const pool = sampleCardPool();
  const fresh = { ...pool[Math.floor(Math.random()*pool.length)], price: FLOW_COSTS[index] };
  state.flow[index] = fresh;
  return state;
}

// Export to global (non-module setup)
window.GameLogic = {
  FLOW_COSTS,
  STARTING_VITALITY,
  initState,
  buyFromFlow,
};
