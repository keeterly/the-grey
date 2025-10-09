import { CARD_TYPES } from './state.js';

export const A = {
  START:'START', DRAW:'DRAW',
  PLAY_TO_SLOT:'PLAY_TO_SLOT', PLAY_TO_GLYPH:'PLAY_TO_GLYPH',
  ADVANCE_PIP:'ADVANCE_PIP', DISCARD_FOR_AETHER:'DISCARD_FOR_AETHER',
  END_TURN:'END_TURN', AI_TURN:'AI_TURN'
};

const drawN=(side,n=1, anims=[], who)=>{
  for(let i=0;i<n;i++){
    if(!side.draw.length){ side.draw = side.discard.splice(0).reverse(); }
    const c = side.draw.pop();
    if(c){ side.hand.push(c); anims.push({type:'DRAW', who, cardId:c.id}); }
  }
};
const discardHand=(side,anims=[],who)=>{
  const ids = side.hand.map(c=>c.id);
  if (ids.length) anims.push({type:'DISCARD_HAND', who, ids});
  side.discard.push(...side.hand); side.hand=[];
};
const castIfComplete=(side,card,who,anims)=>{ anims.push({type:'RESOLVE', who, cardId:card.id}); };

export function reducer(state, action){
  const s = structuredClone(state); const you=s.you, ai=s.ai;
  switch(action.type){
    case A.START: { drawN(you,5,s.animations,'YOU'); drawN(ai,5,s.animations,'AI'); return s; }
    case A.DRAW: { drawN(you,1,s.animations,'YOU'); return s; }
    case A.DISCARD_FOR_AETHER: {
      const {cardId, who='YOU'} = action; const tgt=who==='YOU'?you:ai;
      const i=tgt.hand.findIndex(c=>c.id===cardId); if(i<0) return s;
      const card=tgt.hand.splice(i,1)[0]; const gain=card.aetherGain||0;
      tgt.aether += gain; tgt.discard.push(card);
      s.animations.push({type:'PLAY', who, cardId:card.id});
      return s;
    }
    case A.PLAY_TO_SLOT: {
      const {cardId, who='YOU', slotIndex=0} = action; const tgt=who==='YOU'?you:ai;
      const idx=tgt.hand.findIndex(c=>c.id===cardId); if(idx<0) return s;
      const card=tgt.hand.splice(idx,1)[0];
      if(card.type===CARD_TYPES.INSTANT){ s.animations.push({type:'PLAY', who, cardId:card.id}); castIfComplete(tgt,card,who,s.animations); tgt.discard.push(card); return s; }
      const prev=tgt.slots[slotIndex]; if(prev) tgt.discard.push(prev);
      card.pips=0; tgt.slots[slotIndex]=card; s.animations.push({type:'PLAY', who, cardId:card.id}); return s;
    }
    case A.PLAY_TO_GLYPH: {
      const {cardId, who='YOU'} = action; const tgt=who==='YOU'?you:ai;
      const idx=tgt.hand.findIndex(c=>c.id===cardId); if(idx<0) return s;
      const card=tgt.hand.splice(idx,1)[0]; if(card.type!=='GLYPH'){ tgt.hand.push(card); return s; }
      if(tgt.glyphSlot) tgt.discard.push(tgt.glyphSlot); tgt.glyphSlot=card; s.animations.push({type:'PLAY_GLYPH', who, cardId:card.id}); return s;
    }
    case A.ADVANCE_PIP: {
      const {who='YOU', slotIndex} = action; const tgt=who==='YOU'?you:ai;
      const card=tgt.slots[slotIndex]; if(!card||card.type!=='SPELL') return s;
      if(tgt.aether < card.aetherCost) return s;
      tgt.aether -= card.aetherCost; card.pips=Math.min(card.pips+1, card.pipsMax);
      s.animations.push({type:'ADVANCE', who, cardId:card.id});
      if(card.pips===card.pipsMax){ castIfComplete(tgt,card,who,s.animations); tgt.discard.push(card); tgt.slots[slotIndex]=null; }
      return s;
    }
    case A.END_TURN: { discardHand(you,s.animations,'YOU'); s.turn='AI'; return s; }
    case A.AI_TURN: {
      const t=ai;
      if(!t.glyphSlot){ const gi=t.hand.findIndex(c=>c.type==='GLYPH'); if(gi>=0){ const g=t.hand.splice(gi,1)[0]; if(t.glyphSlot) t.discard.push(t.glyphSlot); t.glyphSlot=g; s.animations.push({type:'PLAY_GLYPH', who:'AI', cardId:g.id}); } }
      const empty=t.slots.findIndex(x=>!x); const si=t.hand.findIndex(c=>c.type==='SPELL'); if(empty>=0&&si>=0){ const sp=t.hand.splice(si,1)[0]; sp.pips=0; t.slots[empty]=sp; s.animations.push({type:'PLAY', who:'AI', cardId:sp.id}); }
      const ii=t.hand.findIndex(c=>c.type==='INSTANT'); if(ii>=0){ const inst=t.hand.splice(ii,1)[0]; t.aether += inst.aetherGain||0; t.discard.push(inst); s.animations.push({type:'PLAY', who:'AI', cardId:inst.id}); }
      for(let k=0;k<5;k++){ const idx=t.slots.findIndex(c=>c && c.type==='SPELL' && c.pips<c.pipsMax && t.aether>=c.aetherCost); if(idx===-1) break;
        const card=t.slots[idx]; t.aether -= card.aetherCost; card.pips++; s.animations.push({type:'ADVANCE', who:'AI', cardId:card.id});
        if(card.pips===card.pipsMax){ castIfComplete(t,card,'AI',s.animations); t.discard.push(card); t.slots[idx]=null; } }
      discardHand(t,s.animations,'AI'); s.turn='YOU'; drawN(you,5,s.animations,'YOU'); return s;
    }
    default: return s;
  }
}