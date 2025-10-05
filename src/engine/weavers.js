import { uid } from './rng.js';

export const WEAVERS = {
  Emberwright:{
    cap:6,
    hint:'Gain: first time you deal damage each turn (+1). Spend: Ignite (next Advance 0 Æ) • Kindle (draw 1, auto-discard oldest if needed).',
    gains:{ onDamage:1 },
    spend:[
      {n:'Ignite (0 Æ Advance)', fn:(S,who)=>{ if(who==='you') S.freeAdvYou++; else S.freeAdvAi++; S._log.push(`${who==='you'?'You':'AI'} ignite: next Advance costs 0 Æ.`);} },
      {n:'Kindle (draw 1)', fn:(S,who)=>{ if(who==='you'){ drawCard(S); if(S.hand.length>5){ S.disc.push(S.hand.shift()); S._log.push('Kindle: drew 1, auto-discard oldest.'); } } else { aiDraw(S); S._log.push('AI kindles (draws).'); } } }
    ]
  },
  Frostseer:{
    cap:6,
    hint:'Gain: when you slow/freeze or prevent damage (+1). Spend: Stasis (freeze foe Advances 1 turn) • Ward (Barrier glyph).',
    gains:{ onFrost:1 },
    spend:[
      {n:'Stasis (freeze foe)', fn:(S,who)=>{ if(who==='you'){ S.aiFrozen=1; S._log.push('You cast Stasis: AI cannot Advance next turn.'); } else { S.youFrozen=1; S._log.push('AI casts Stasis: you cannot Advance next turn.'); } } },
      {n:'Ward (barrier)', fn:(S,who)=>{ const g={n:'Barrier',t:'Glyph',txt:'Prevent 1 next hit.',eff:'g_barrier',id:uid(),artKey:'glacial-ward'}; if(who==='you'){ S.glyphs.push(g); S._log.push('You gain Barrier.'); } else { S.ai.glyphs.push(g); S._log.push('AI gains Barrier.'); } } }
    ]
  },
  Stormbinder:{
    cap:6,
    hint:'Gain: when you channel Æ (+1). Spend: Overcharge (+2 Æ) • Pulse (deal 1, drain 1 Æ).',
    gains:{ onChannel:1 },
    spend:[
      {n:'Overcharge (+2 Æ)', fn:(S,who)=>{ if(who==='you'){ S.ae+=2; } else { S.ai.ae+=2; } S._log.push(`${who==='you'?'You':'AI'} overcharge: +2 Æ.`); } },
      {n:'Pulse (1 dmg, drain 1)', fn:(S,who)=>{ if(who==='you'){ S.ai.hp--; S.ai.ae=Math.max(0,S.ai.ae-1); S._log.push('Pulse: AI -1 HP, drain 1 Æ.'); } else { S.hp--; S.ae=Math.max(0,S.ae-1); S._log.push('AI Pulse: you -1 HP, drain 1 Æ.'); } } }
    ]
  }
};

// forward declares the simple helpers used in spend above
function drawCard(S){
  if(S.deck.length===0){
    if(S.disc.length===0){ S._log.push("No cards to draw."); return; }
    S.deck = shuffle(S.disc); S.disc = []; S._log.push("You reshuffle.");
  }
  S.hand.push(S.deck.pop());
}
function aiDraw(S){
  if(S.ai.deck.length===0){
    if(S.ai.disc.length===0) return;
    S.ai.deck = shuffle(S.ai.disc); S.ai.disc = []; S._log.push("AI reshuffles.");
  }
  S.ai.hand.push(S.ai.deck.pop());
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]} return a; }
