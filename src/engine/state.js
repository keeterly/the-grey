export const CARD_TYPES = { INSTANT:'INSTANT', SPELL:'SPELL', GLYPH:'GLYPH' };
export const makeCard = (id, name, type, {pips=0, aetherCost=0, aetherGain=0}={}) => ({ id, name, type, pipsMax:pips, pips:0, aetherCost, aetherGain });
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
const pickN=(arr,n)=>{const a=shuffle(arr).slice(0,n); return a.map((c,i)=>({...c, id:`AF${i}-${c.id}`}));};

export const newSide=(d=BASE_DECK)=>({draw:shuffle(d),hand:[],discard:[],slots:[null,null,null],glyphSlot:null,aether:0,health:5});
export const newGame=()=>({you:newSide(),ai:newSide(),aetherflow: pickN(BASE_DECK.filter(c=>c.type!=='GLYPH'),5), trance:[{label:'Calm',at:4},{label:'Focus',at:3},{label:'Trance',at:2},{label:'Zenith',at:1}],turn:'YOU',animations:[]});