export const STARTER = [
  {n:'Apprentice Bolt',t:'Spell',txt:'Deal 1.',p:1,artKey:'apprentice-bolt'},
  {n:'Apprentice Bolt',t:'Spell',txt:'Deal 1.',p:1,artKey:'apprentice-bolt'},
  {n:'Apprentice Bolt',t:'Spell',txt:'Deal 1.',p:1,artKey:'apprentice-bolt'},
  {n:'Kindle',t:'Spell',txt:'On resolve: +1⚡.',p:2,eff:'gain1',artKey:'kindle'},
  {n:'Glacial Ward',t:'Glyph',txt:'Prevent 1 next hit.',eff:'g_barrier',artKey:'glacial-ward'},
  {n:'Mirror Ward',t:'Glyph',txt:'Reflect next damage (sim).',eff:'g_mirror',artKey:'mirror-ward'},
  {n:'Ward Sigil',t:'Glyph',txt:'Prevent 1 (sim).',eff:'g_barrier',artKey:'ward-sigil'},
  {n:'Meditate',t:'Instant',txt:'↺ +1⚡ (or play +1⚡).',v:1,artKey:'meditate'}
];

const ECON_CARDS = [
  {n:'Aether Pebble',t:'Instant',txt:'↺ +1⚡ (or play +1⚡).',v:1,artKey:'aether-pebble'},
  {n:'Aether Shard',t:'Instant',txt:'↺ +2⚡ (or play +2⚡).',v:2,artKey:'aether-shard'},
  {n:'Aether Core',t:'Instant',txt:'↺ +3⚡ (or play +3⚡).',v:3,artKey:'aether-core'}
];

const OFFENSE_CARDS = [
  {n:'Spark Javelin',t:'Spell',txt:'Deal 2.',p:1,v:1,artKey:'spark-javelin'},
  {n:'Flame Lash',t:'Spell',txt:'Deal 2 then 3.',p:2,v:0,artKey:'flame-lash'},
  {n:'Ember',t:'Spell',txt:'Deal 2.',p:1,v:0,artKey:'ember'},
  {n:'Frost Bolt',t:'Spell',txt:'Deal 1; slow next hit (sim).',p:2,v:0,artKey:'frost-bolt'},
  {n:'Siphon Hex',t:'Spell',txt:'Drain 1⚡ from foe.',p:2,v:1,eff:'drain1',artKey:'siphon-hex'},
  {n:'Stonewall',t:'Spell',txt:'+1 advance tax (foe).',p:2,v:0,eff:'tax',artKey:'stonewall'}
];

export const FLOW_POOL = [...ECON_CARDS, ...OFFENSE_CARDS];
export const FLOW_PRICES = [4,3,2,2,2];
export const HAND_DRAW = 5;
