import { CARD_TYPES } from './state.js';
export const A = { START:'START', DRAW:'DRAW', PLAY_TO_SLOT:'PLAY_TO_SLOT', PLAY_TO_GLYPH:'PLAY_TO_GLYPH', ADVANCE_PIP:'ADVANCE_PIP', DISCARD_FOR_AETHER:'DISCARD_FOR_AETHER', END_TURN:'END_TURN', AI_TURN:'AI_TURN' };
const drawN=(side,n=1,anims=[],who)=>{ for(let i=0;i<n;i++){ if(!side.draw.length){ side.draw = side.discard.splice(0).reverse(); } const c=side.draw.pop(); if(c){ side.hand.push(c); anims.push({type:'DRAW',who,cardId:c.id}); } } };
const discardHand=(side,anims=[],who)=>{ const ids=side.hand.map(c=>c.id); if(ids.length) anims.push({type:'DISCARD_HAND',who,ids}); side.discard.push(...side.hand); side.hand=[]; };
const castIfComplete=(side,card,who,anims)=>{ anims.push({type:'RESOLVE',who,cardId:card.id}); };
export function reducer(state,action){ const s=structuredClone(state), you=s.you, ai=s.ai;
  switch(action.type){
    case A.START: { you.aether=0; ai.aether=0; drawN(you,5,s.animations,'YOU'); drawN(ai,5,s.animations,'AI'); return s; }
    case A.DRAW: { drawN(you,1,s.animations,'YOU'); return s; }
    case A.DISCARD_FOR_AETHER: { const {cardId,who='YOU'}=action, tgt=who==='YOU'?you:ai; const i=tgt.hand.findIndex(c=>c.id===cardId); if(i<0) return s; const card=tgt.hand.splice(i,1)[0]; tgt.aether+=(card.aetherGain||0); tgt.discard.push(card); s.animations.push({type:'PLAY',who,cardId:card.id}); return s; }
    case A.PLAY_TO_SLOT: { const {cardId,who='YOU',slotIndex=0}=action; if(who!=='YOU') return s; const idx=you.hand.findIndex(c=>c.id===cardId); if(idx<0) return s; const card=you.hand.splice(idx,1)[0]; if(card.type!==CARD_TYPES.SPELL){ you.hand.push(card); return s; } const prev=you.slots[slotIndex]; if(prev) you.discard.push(prev); card.pips=0; you.slots[slotIndex]=card; s.animations.push({type:'PLAY',who,cardId:card.id}); return s; }
    case A.PLAY_TO_GLYPH:{ const {cardId,who='YOU'}=action; if(who!=='YOU') return s; const idx=you.hand.findIndex(c=>c.id===cardId); if(idx<0) return s; const card=you.hand.splice(idx,1)[0]; if(card.type!==CARD_TYPES.GLYPH){ you.hand.push(card); return s; } if(you.glyphSlot) you.discard.push(you.glyphSlot); you.glyphSlot=card; s.animations.push({type:'PLAY_GLYPH',who:'YOU',cardId:card.id}); return s; }
    case A.ADVANCE_PIP:{ const {slotIndex}=action; const card=you.slots[slotIndex]; if(!card||card.type!==CARD_TYPES.SPELL) return s; if(you.aether<card.aetherCost) return s; you.aether-=card.aetherCost; card.pips=Math.min(card.pips+1,card.pipsMax); s.animations.push({type:'ADVANCE',who:'YOU',cardId:card.id}); if(card.pips===card.pipsMax){ castIfComplete(you,card,'YOU',s.animations); you.discard.push(card); you.slots[slotIndex]=null; } return s; }
    case A.END_TURN:{ discardHand(you,s.animations,'YOU'); s.turn='AI'; return s; }
    case A.AI_TURN:{ if(!ai.glyphSlot){ const gi=ai.hand.findIndex(c=>c.type===CARD_TYPES.GLYPH); if(gi>=0){ const g=ai.hand.splice(gi,1)[0]; if(ai.glyphSlot) ai.discard.push(ai.glyphSlot); ai.glyphSlot=g; s.animations.push({type:'PLAY_GLYPH',who:'AI',cardId:g.id}); } }
      const empty=ai.slots.findIndex(x=>!x); const si=ai.hand.findIndex(c=>c.type===CARD_TYPES.SPELL); if(empty>=0&&si>=0){ const sp=ai.hand.splice(si,1)[0]; sp.pips=0; ai.slots[empty]=sp; s.animations.push({type:'PLAY',who:'AI',cardId:sp.id}); }
      for(;;){ const ii=ai.hand.findIndex(c=>c.type==='INSTANT'); if(ii<0) break; const inst=ai.hand.splice(ii,1)[0]; ai.aether+=inst.aetherGain||0; ai.discard.push(inst); s.animations.push({type:'PLAY',who:'AI',cardId:inst.id}); }
      const idxAdvance=ai.slots.findIndex(c=>c && c.type==='SPELL' && c.pips<c.pipsMax && ai.aether>=c.aetherCost);
      if(idxAdvance>=0){ const c=ai.slots[idxAdvance]; ai.aether-=c.aetherCost; c.pips++; s.animations.push({type:'ADVANCE',who:'AI',cardId:c.id}); if(c.pips===c.pipsMax){ ai.discard.push(c); ai.slots[idxAdvance]=null; } }
      const ids=ai.hand.map(c=>c.id); if(ids.length) s.animations.push({type:'DISCARD_HAND',who:'AI',ids}); ai.discard.push(...ai.hand); ai.hand=[];
      s.turn='YOU'; you.aether=0; drawN(you,5,s.animations,'YOU'); return s; }
    default: return s;
  }}