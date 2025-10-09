export const CARD_TYPES = { INSTANT:'INSTANT', SPELL:'SPELL', GLYPH:'GLYPH' };
export const makeCard = (id, name, type, {pips=0, aetherCost=0}={}) => ({
  id, name, type, pipsMax: pips, pips: 0, aetherCost,
});
export const BASE_DECK = [
  makeCard('I1','Flash Sigil', CARD_TYPES.INSTANT),
  makeCard('I2','Quick Ward', CARD_TYPES.INSTANT),
  makeCard('I3','Rune Burst', CARD_TYPES.INSTANT),
  makeCard('I4','Aether Jolt', CARD_TYPES.INSTANT),
  makeCard('S1','Ember Weave', CARD_TYPES.SPELL, {pips:3,aetherCost:1}),
  makeCard('S2','Frost Chain', CARD_TYPES.SPELL, {pips:2,aetherCost:2}),
  makeCard('S3','Void Lattice', CARD_TYPES.SPELL, {pips:4,aetherCost:1}),
  makeCard('S4','Storm Script', CARD_TYPES.SPELL, {pips:3,aetherCost:2}),
  makeCard('G1','Glyph of Echo', CARD_TYPES.GLYPH),
  makeCard('G2','Glyph of Thorns', CARD_TYPES.GLYPH),
];
const shuffle=a=>{const b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
export const newSide=(seedDeck=BASE_DECK)=>({draw:shuffle(seedDeck),hand:[],discard:[],slot:null,glyphSlot:null,aether:0});
export const newGame=()=>({you:newSide(),ai:newSide(),turn:'YOU',animations:[]});