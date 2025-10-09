export const CARD_TYPES = { INSTANT:'INSTANT', SPELL:'SPELL', GLYPH:'GLYPH' };
export const makeCard = (id, name, type, {pips=0, aetherCost=0, aetherGain=0}={}) => ({ id, name, type, pipsMax: pips, pips: 0, aetherCost, aetherGain, });
export const BASE_DECK = [
  makeCard('I1','Aether Pebble', 'INSTANT', {aetherGain:1}),
  makeCard('I2','Aether Shard',  'INSTANT', {aetherGain:2}),
  makeCard('I3','Aether Core',   'INSTANT', {aetherGain:3}),
  makeCard('I4','Aether Jolt',   'INSTANT', {aetherGain:1}),
  makeCard('S1','Ember Weave',   'SPELL', {pips:3, aetherCost:1}),
  makeCard('S2','Frost Chain',   'SPELL', {pips:2, aetherCost:2}),
  makeCard('S3','Void Lattice',  'SPELL', {pips:4, aetherCost:1}),
  makeCard('S4','Storm Script',  'SPELL', {pips:3, aetherCost:2}),
  makeCard('G1','Glyph of Echo', 'GLYPH'),
  makeCard('G2','Glyph of Thorns','GLYPH'),
];
const shuffle = arr => { const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
export const newSide = (d=BASE_DECK)=>({ draw: shuffle(d), hand:[], discard:[], slots:[null,null,null], glyphSlot:null, aether:0 });
export const newGame = () => ({ you:newSide(), ai:newSide(), turn:'YOU', animations:[] });