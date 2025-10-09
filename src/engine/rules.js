import { CARD_TYPES, cardCost } from './state.js';

export const A = {
  START:'START', DRAW:'DRAW',
  PLAY_TO_SLOT:'PLAY_TO_SLOT', PLAY_TO_GLYPH:'PLAY_TO_GLYPH',
  ADVANCE_PIP:'ADVANCE_PIP', DISCARD_FOR_AETHER:'DISCARD_FOR_AETHER',
  BUY_AF:'BUY_AF',
  END_TURN:'END_TURN', AI_TURN:'AI_TURN',
  // UI only:
  _NOOP:'_NOOP'
};

const drawN=(side,n=1,anims=[],who)=>{
  for(let i=0;i<n;i++){
    if(!side.draw.length){ side.draw = side.discard.splice(0).reverse(); }
    const c=side.draw.pop();
    if(c){ side.hand.push(c); anims.push({type:'DRAW',who,cardId:c.id}); }
  }
};

const discardHand=(side,anims=[],who)=>{
  const ids=side.hand.map(c=>c.id);
  if(ids.length) anims.push({type:'DISCARD_HAND',who,ids});
  side.discard.push(...side.hand);
  side.hand=[];
};

const castIfComplete=(side,card,who,anims)=>{
  anims.push({type:'RESOLVE',who,cardId:card.id});
};

function updateTrance(side){
  // Determine active states based on current health thresholds
  if(side.trances && side.trances.length){
    const t1 = side.trances[0];
    const t2 = side.trances[1];
    side.trance1Active = side.health <= (t1?.at ?? -999);
    side.trance2Active = side.health <= (t2?.at ?? -999);
  }
}

export function reducer(state,action){
  const s=structuredClone(state), you=s.you, ai=s.ai;

  switch(action.type){
    case A.START: {
      you.aether=0; ai.aether=0;
      drawN(you,5,s.animations,'YOU');
      drawN(ai,5,s.animations,'AI');
      updateTrance(you); updateTrance(ai);
      return s;
    }

    case A.DRAW: { drawN(you,1,s.animations,'YOU'); updateTrance(you); return s; }

    case A.DISCARD_FOR_AETHER: {
      const {cardId,who='YOU'}=action, tgt=who==='YOU'?you:ai;
      const i=tgt.hand.findIndex(c=>c.id===cardId); if(i<0) return s;
      const card=tgt.hand.splice(i,1)[0];
      let gain=(card.aetherGain||0);
      // Example trance effect hooks (replace with your actual logic):
      if(tgt.trance1Active){
        // If first trance is about discarding instants, simulate +1 for instants
        if(card.type==='INSTANT') gain += 1;
      }
      tgt.aether+=gain;
      tgt.discard.push(card);
      s.animations.push({type:'PLAY',who,cardId:card.id});
      updateTrance(tgt);
      return s;
    }

    case A.PLAY_TO_SLOT: {
      const {cardId,who='YOU',slotIndex=0}=action; if(who!=='YOU') return s;
      const idx=you.hand.findIndex(c=>c.id===cardId); if(idx<0) return s;
      const card=you.hand.splice(idx,1)[0];
      if(card.type!=='SPELL'){ you.hand.push(card); return s; }
      const prev=you.slots[slotIndex]; if(prev) you.discard.push(prev);
      card.pips=0; you.slots[slotIndex]=card;
      s.animations.push({type:'PLAY',who,cardId:card.id});
      updateTrance(you);
      return s;
    }

    case A.PLAY_TO_GLYPH:{
      const {cardId,who='YOU'}=action; if(who!=='YOU') return s;
      const idx=you.hand.findIndex(c=>c.id===cardId); if(idx<0) return s;
      const card=you.hand.splice(idx,1)[0];
      if(card.type!=='GLYPH'){ you.hand.push(card); return s; }
      if(you.glyphSlot) you.discard.push(you.glyphSlot);
      you.glyphSlot=card;
      s.animations.push({type:'PLAY_GLYPH',who:'YOU',cardId:card.id});
      updateTrance(you);
      return s;
    }

    case A.ADVANCE_PIP:{
      const {slotIndex}=action;
      const card=you.slots[slotIndex];
      if(!card||card.type!=='SPELL') return s;
      let cost = card.aetherCost;
      // Example trance #2: reduce cost by 1 (min 0) when active
      if(you.trance2Active){ cost = Math.max(0, cost-1); }
      if(you.aether<cost) return s;
      you.aether-=cost;
      card.pips=Math.min(card.pips+1,card.pipsMax);
      s.animations.push({type:'ADVANCE',who:'YOU',cardId:card.id});
      if(card.pips===card.pipsMax){
        castIfComplete(you,card,'YOU',s.animations);
        you.discard.push(card); you.slots[slotIndex]=null;
      }
      updateTrance(you);
      return s;
    }

    case A.BUY_AF:{
      const {afId}=action;
      const i=s.aetherflow.findIndex(c=>c.id===afId); if(i<0) return s;
      const card=s.aetherflow[i];
      const cost=cardCost(card);
      if(you.aether < cost) return s;
      you.aether -= cost;
      const playerCard={...card,id:card.id.replace(/^AF\d+-/,'PF')};
      you.discard.push(playerCard);
      s.animations.push({type:'BUY_AF',who:'YOU',cardId:card.id});
      if(s.aetherflowPool.length){ s.aetherflow[i]=s.aetherflowPool.shift(); } else { s.aetherflow.splice(i,1); }
      updateTrance(you);
      return s;
    }

    case A.END_TURN:{
      discardHand(you,s.animations,'YOU');
      s.turn='AI';
      updateTrance(you);
      return s;
    }

    case A.AI_TURN:{
      // Simple AI: buy if can
      const idxAffordable = s.aetherflow.findIndex(c=> ai.aether >= cardCost(c));
      if (idxAffordable>=0){
        const c=s.aetherflow[idxAffordable]; const cost=cardCost(c);
        ai.aether-=cost;
        const aiCard={...c,id:c.id.replace(/^AF\d+-/,'AF_AI')};
        ai.discard.push(aiCard);
        s.animations.push({type:'BUY_AF',who:'AI',cardId:c.id});
        if(s.aetherflowPool.length){ s.aetherflow[idxAffordable]=s.aetherflowPool.shift(); } else { s.aetherflow.splice(idxAffordable,1); }
      }

      const empty=ai.slots.findIndex(x=>!x);
      const si=ai.hand.findIndex(c=>c.type==='SPELL');
      if(empty>=0&&si>=0){
        const sp=ai.hand.splice(si,1)[0];
        sp.pips=0; ai.slots[empty]=sp;
        s.animations.push({type:'PLAY',who:'AI',cardId:sp.id});
      }

      // Burn instants for aether
      for(;;){
        const ii=ai.hand.findIndex(c=>c.type==='INSTANT'); if(ii<0) break;
        const inst=ai.hand.splice(ii,1)[0];
        ai.aether+=inst.aetherGain||0; ai.discard.push(inst);
        s.animations.push({type:'PLAY',who:'AI',cardId:inst.id});
      }

      const ids=ai.hand.map(c=>c.id);
      if(ids.length) s.animations.push({type:'DISCARD_HAND',who:'AI',ids});
      ai.discard.push(...ai.hand); ai.hand=[];

      // back to player; new hand
      s.turn='YOU'; you.aether=0; drawN(you,5,s.animations,'YOU');
      updateTrance(ai); updateTrance(you);
      return s;
    }

    default: return s;
  }
}
