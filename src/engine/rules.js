import { CARD_TYPES } from './state.js';

export const A = { START:'START', DRAW:'DRAW', PLAY_TO_SLOT:'PLAY_TO_SLOT', PLAY_TO_GLYPH:'PLAY_TO_GLYPH', ADVANCE_PIP:'ADVANCE_PIP', END_TURN:'END_TURN', AI_TURN:'AI_TURN' };

const drawN=(side,n=1)=>{ for(let i=0;i<n;i++){ if(!side.draw.length){ side.draw = side.discard.splice(0).reverse(); } const c = side.draw.pop(); if(c) side.hand.push(c); } };
const discardHand=side=>{ side.discard.push(...side.hand); side.hand=[]; };
const castIfComplete=(side,card,who,anims)=>{ anims.push({type:'RESOLVE', who, cardId:card.id}); };

export function reducer(state, action){
  const s = structuredClone(state); const you=s.you, ai=s.ai;
  switch(action.type){
    case A.START: { drawN(you,5); drawN(ai,5); return s; }
    case A.DRAW: { drawN(you,1); return s; }
    case A.PLAY_TO_SLOT: {
      const { cardId, who='YOU', slotIndex=0 } = action;
      const tgt = who==='YOU'?you:ai;
      const idx = tgt.hand.findIndex(c=>c.id===cardId);
      if (idx<0) return s;
      const card = tgt.hand.splice(idx,1)[0];
      if (card.type===CARD_TYPES.INSTANT){
        s.animations.push({type:'PLAY', who, cardId:card.id});
        castIfComplete(tgt, card, who, s.animations);
        tgt.discard.push(card);
        return s;
      }
      // place into selected spell slot
      const prev = tgt.slots[slotIndex];
      if (prev) tgt.discard.push(prev);
      card.pips = 0;
      tgt.slots[slotIndex] = card;
      s.animations.push({type:'PLAY', who, cardId:card.id});
      return s;
    }
    case A.PLAY_TO_GLYPH: {
      const { cardId, who='YOU' } = action;
      const tgt = who==='YOU'?you:ai;
      const idx = tgt.hand.findIndex(c=>c.id===cardId);
      if (idx<0) return s;
      const card = tgt.hand.splice(idx,1)[0];
      if (card.type!==CARD_TYPES.GLYPH){ tgt.hand.push(card); return s; }
      if (tgt.glyphSlot) tgt.discard.push(tgt.glyphSlot);
      tgt.glyphSlot = card;
      s.animations.push({type:'PLAY_GLYPH', who, cardId:card.id});
      return s;
    }
    case A.ADVANCE_PIP: {
      const { who='YOU' } = action;
      const tgt = who==='YOU'?you:ai;
      // leftmost playable spell
      const slotIndex = tgt.slots.findIndex(c=>c && c.type===CARD_TYPES.SPELL && c.pips < c.pipsMax && tgt.aether >= c.aetherCost);
      if (slotIndex === -1) return s;
      const card = tgt.slots[slotIndex];
      tgt.aether -= card.aetherCost;
      card.pips = Math.min(card.pips+1, card.pipsMax);
      s.animations.push({type:'ADVANCE', who, cardId:card.id});
      if (card.pips === card.pipsMax){
        castIfComplete(tgt, card, who, s.animations);
        tgt.discard.push(card);
        tgt.slots[slotIndex] = null;
      }
      return s;
    }
    case A.END_TURN: { discardHand(you); you.aether += 1; s.turn='AI'; return s; }
    case A.AI_TURN: {
      const t = ai;
      // play glyph if none
      if (!t.glyphSlot){
        const gi = t.hand.findIndex(c=>c.type===CARD_TYPES.GLYPH);
        if (gi>=0){ const g=t.hand.splice(gi,1)[0]; if (t.glyphSlot) t.discard.push(t.glyphSlot); t.glyphSlot=g; s.animations.push({type:'PLAY_GLYPH', who:'AI', cardId:g.id}); }
      }
      // play a spell into first empty slot
      const emptyIndex = t.slots.findIndex(x=>!x);
      const si = t.hand.findIndex(c=>c.type===CARD_TYPES.SPELL);
      if (emptyIndex>=0 && si>=0){ const sp=t.hand.splice(si,1)[0]; sp.pips=0; t.slots[emptyIndex]=sp; s.animations.push({type:'PLAY', who:'AI', cardId:sp.id}); }
      // play an instant
      const ii = t.hand.findIndex(c=>c.type===CARD_TYPES.INSTANT);
      if (ii>=0){ const inst=t.hand.splice(ii,1)[0]; s.animations.push({type:'PLAY', who:'AI', cardId:inst.id}); castIfComplete(t,inst,'AI',s.animations); t.discard.push(inst); }
      // aether accrues and try to advance multiple times
      t.aether += 1;
      for (let k=0;k<5;k++){
        const idx = t.slots.findIndex(c=>c && c.type===CARD_TYPES.SPELL && c.pips < c.pipsMax && t.aether >= c.aetherCost);
        if (idx===-1) break;
        const card = t.slots[idx];
        t.aether -= card.aetherCost;
        card.pips = Math.min(card.pips+1, card.pipsMax);
        s.animations.push({type:'ADVANCE', who:'AI', cardId:card.id});
        if (card.pips === card.pipsMax){ castIfComplete(t,card,'AI',s.animations); t.discard.push(card); t.slots[idx]=null; }
      }
      discardHand(t);
      s.turn='YOU';
      if (!you.hand.length) drawN(you,5);
      return s;
    }
    default: return s;
  }
}