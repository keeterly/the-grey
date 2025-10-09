export const CARD_TYPES = { INSTANT:'INSTANT', SPELL:'SPELL', GLYPH:'GLYPH' };

export const makeCard = (id, name, type, {pips=0, aetherCost=0, aetherGain=0}={}) => ({
  id, name, type, pipsMax:pips, pips:0, aetherCost, aetherGain
});

// TODO: Replace with your approved base deck list
export const BASE_DECK = [
  makeCard('I1','Aether Pebble','INSTANT',{aetherGain:1}),
  makeCard('I2','Aether Shard','INSTANT',{aetherGain:2}),
  makeCard('I3','Aether Core','INSTANT',{aetherGain:3}),
  makeCard('I4','Aether Jolt','INSTANT',{aetherGain:1}),
  makeCard('S1','Ember Weave','SPELL',{pips:3,aetherCost:1}),
  makeCard('S2','Frost Chain','SPELL',{pips:2,aetherCost:2}),
  makeCard('S3','Void Lattice','SPELL',{pips:4,aetherCost:1}),
  makeCard('S4','Storm Script','SPELL',{pips:3,aetherCost:2}),
  makeCard('G1','Glyph of Echo','GLYPH'),
  makeCard('G2','Glyph of Thorns','GLYPH'),
];

const shuffle=a=>{const b=a.slice(); for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]];} return b;};

export const cardCost = (c)=> c.type==='INSTANT' ? 1 : 2;

// ==== Spellweaver + Trance config ====
// Replace names/descriptions/thresholds with your approved list from the mechanics doc.
const DEFAULT_YOU_WEAVER = 'Spellweaver (You)';
const DEFAULT_AI_WEAVER  = 'Spellweaver (AI)';
const DEFAULT_TRANCES_YOU = [
  { key:'you-t1', name:'Focus of Embers', at:3, description:'Gain +1 Aether when you discard an Instant this turn.' },
  { key:'you-t2', name:'Zenith of Flame', at:1, description:'Your Spells cost 1 ⚡ less to advance this turn.' },
];
const DEFAULT_TRANCES_AI = [
  { key:'ai-t1', name:'Frost Poise', at:3, description:'AI gains +1 Aether when discarding Instants this turn.' },
  { key:'ai-t2', name:'Void Apex',  at:1, description:'AI advances one random Spell for free now.' },
];

export const newSide=(d=BASE_DECK, weaverName, trances)=> ({
  draw:shuffle(d), hand:[], discard:[],
  slots:[null,null,null], glyphSlot:null,
  aether:0, health:5,
  weaverName, trances, trance1Active:false, trance2Active:false
});

export const newGame=()=>{
  const pool = shuffle(BASE_DECK.filter(c=>c.type!=='GLYPH')).map((c,i)=>({...c, id:`AF${i}-${c.id}`}));
  return {
    you:newSide(BASE_DECK, DEFAULT_YOU_WEAVER, DEFAULT_TRANCES_YOU),
    ai:newSide(BASE_DECK, DEFAULT_AI_WEAVER, DEFAULT_TRANCES_AI),
    aetherflowPool: pool, aetherflow: pool.splice(0,5),
    turn:'YOU', animations:[]
  };
};
