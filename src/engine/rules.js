// /src/engine/rules.js
import { FLOW_PRICES, HAND_DRAW } from './cards.js';
import { shuffle } from './rng.js';
import { WEAVERS } from './weavers.js';
import { initialState, makeFlowDeck } from './state.js';

export function reduce(S, action){
  const L = (m)=>S._log.push(m);
  switch(action.type){
    case 'INIT': return S;
    case 'RESET': return initialState({ playerWeaver: action.playerWeaver, aiWeaver: action.aiWeaver });

    case 'START_TURN': {
      S.turn += (action.first?0:1);
      while(S.hand.length < HAND_DRAW) drawCard(S);
      if(S.youFrozen>0){ S.youFrozen=0; L('Your Stasis ends.'); }
      return S;
    }

    case 'END_TURN': {
      S.slots.forEach(s=>{ if(s) s.advUsed=false; });
      slideFlow(S);
      if(S.hand.length){ S.disc.push(...S.hand); S.hand.length=0; L("End Turn: auto-discard hand."); }
      return S;
    }

    case 'DRAW': { drawCard(S); return S; }

    case 'PLAY_FROM_HAND': {
      const { index, slot=null } = action;
      const c=S.hand[index]; if(!c) return S;

      if(c.t==='Spell'){
        let s=(slot!=null?slot:S.slots.findIndex(x=>!x)); if(s<0){ L("No empty slot."); return S; }
        S.slots[s]={c,ph:1,advUsed:false}; S.hand.splice(index,1); L(`Play ${c.n} → Slot ${s+1}.`);
      }else if(c.t==='Glyph'){
        S.glyphs.push(c); S.hand.splice(index,1); L(`Set glyph: ${c.n}.`);
      }else{
        S.ae+=(c.v||0); S.disc.push(c); S.hand.splice(index,1); L(`Cast ${c.n}: +${c.v||0}⚡.`);
        if(S.trance.you.weaver==='Stormbinder') gainTrance(S,'you','onChannel',1);
      }
      return S;
    }

    case 'CHANNEL_FROM_HAND': {
      const { index } = action; const c=S.hand[index]; if(!c) return S;
      S.ae+=(c.v||0); S.disc.push(c); S.hand.splice(index,1); L(`Channel ${c.n}: +${c.v||0}⚡.`);
      if(S.trance.you.weaver==='Stormbinder') gainTrance(S,'you','onChannel',1);
      return S;
    }

    case 'ADVANCE': {
      if(S.youFrozen>0){ L("You are frozen and cannot Advance this turn."); return S; }
      const i=action.slot; const s=S.slots[i]; if(!s) return S;

      const cost = (S.freeAdvYou>0)?0:1;
      if(S.ae<cost){ L(`Need ${cost}⚡ to advance.`); return S; }
      S.ae-=cost; if(cost===0) S.freeAdvYou=Math.max(0,S.freeAdvYou-1);

      s.ph++; s.advUsed=true;
      if(s.ph>=(s.c.p||1)) resolveCard(S,'you',i);
      return S;
    }

    // ---- Simple AI phases split into discrete actions ----
    case 'AI_DRAW': { aiDraw(S); return S; }

    case 'AI_PLAY_SPELL': {
      const idx=S.ai.hand.findIndex(x=>x.t==='Spell');
      if(idx>-1){
        const c=S.ai.hand.splice(idx,1)[0];
        const s=S.ai.slots.findIndex(x=>!x);
        if(s>-1){ S.ai.slots[s]={c,ph:1,advUsed:false}; L("AI plays "+c.n); }
      }
      return S;
    }

    case 'AI_CHANNEL': {
      const idx=S.ai.hand.findIndex(x=>x.t==='Instant');
      if(idx>-1){
        const r=S.ai.hand.splice(idx,1)[0];
        S.ai.ae=(S.ai.ae||0)+(r.v||0); S.ai.disc.push(r);
        L("AI channels "+r.n+" (+ "+(r.v||0)+"⚡)");
        if(S.trance.ai.weaver==='Stormbinder') gainTrance(S,'ai','onChannel',1);
      }
      return S;
    }

    case 'AI_ADVANCE': {
      if(S.aiFrozen>0){ S.aiFrozen=0; L('AI is frozen and skips advancing.'); return S; }
      const sIdx=S.ai.slots.findIndex(s=>s && !s.advUsed && (S.ai.ae>0 || S.freeAdvAi>0));
      if(sIdx>-1){
        const cost=(S.freeAdvAi>0)?0:1;
        if((S.ai.ae||0)>=cost){
          S.ai.ae-=cost; if(cost===0) S.freeAdvAi=Math.max(0,S.freeAdvAi-1);
          S.ai.slots[sIdx].ph++; S.ai.slots[sIdx].advUsed=true; L("AI advances.");
          if(S.ai.slots[sIdx].ph>=(S.ai.slots[sIdx].c.p||1)){
            resolveCard(S,'ai',sIdx);
          }
        }
      }
      return S;
    }

    case 'AI_BUY': {
      const i=action.index; const c=S.flowRow[i]; if(!c) return S;
      const cost=FLOW_PRICES[i]; if((S.ai.ae||0)<cost) return S;
      S.ai.ae -= cost; S.ai.disc.push(c); S.flowRow[i]=null; L("AI buys "+c.n);
      return S;
    }

    case 'AI_SPEND_TRANCE': {
      const T=S.trance.ai; const W=WEAVERS[T.weaver]; if(!W) return S;
      if(T.cur<T.cap) return S;
      if(T.weaver==='Stormbinder'){
        let can=false; for(let i=0;i<5;i++){ const cost=FLOW_PRICES[i]; if(S.flowRow[i] && cost<=((S.ai.ae||0)+2)) {can=true;break;} }
        W.spend[can?0:1].fn(S,'ai'); T.cur=0;
      } else { W.spend[0].fn(S,'ai'); T.cur=0; }
      return S;
    }

    case 'BUY_FLOW': {
      const i=action.index; const c=S.flowRow[i]; if(!c){L("Empty slot."); return S;}
      const cost=FLOW_PRICES[i]; if(S.ae<cost){L("Not enough ⚡."); return S;}
      S.ae-=cost; S.disc.push(c); S.flowRow[i]=null; L(`Bought ${c.n} for ${cost}⚡.`);
      ensureMarket(S); return S;
    }

    case 'ENSURE_MARKET': { ensureMarket(S); return S; }

    case 'SPEND_TRANCE': {
      const who=action.who; const idx=action.option||0;
      const T=who==='you'?S.trance.you:S.trance.ai; const W=WEAVERS[T.weaver]; if(!W) return S;
      if(T.cur<T.cap) return S;
      W.spend[idx]?.fn(S,who); T.cur=0; return S;
    }

    default: return S;
  }
}

export function drawCard(S) {
  if (!S.deck) S.deck = [];
  if (!S.disc) S.disc = [];
  if (!S.hand) S.hand = [];

  if (S.deck.length === 0) {
    if (S.disc.length === 0) {
      S._log.push("No cards to draw.");
      return;
    }
    // reshuffle discard into deck
    S.deck = shuffle(S.disc);
    S.disc = [];
    S._log.push("You reshuffle.");
  }

  // draw only if deck has a card left
  const card = S.deck.pop();
  if (card) S.hand.push(card);
}



export function aiDraw(S){
  if(S.ai.deck.length===0){
    if(S.ai.disc.length>0){
      S.ai.deck=shuffle(S.ai.disc); S.ai.disc=[]; S._log.push("AI reshuffles.");
    } else return;
  }
  S.ai.hand.push(S.ai.deck.pop());
}

function ensureMarket(S){ for(let i=0;i<5;i++){ if(!S.flowRow[i]) S.flowRow[i]=drawFlow(S); } }
function drawFlow(S){ if(S.flowDeck.length===0) S.flowDeck=makeFlowDeck(); return S.flowDeck.pop()||null; }
function slideFlow(S){ S.flowRow.pop(); S.flowRow.unshift(drawFlow(S)); }

function resolveCard(S,who,slotIndex){
  const slot = who==='you'?S.slots[slotIndex]:S.ai.slots[slotIndex];
  if(!slot) return;
  const c=slot.c;

  // Effects (sim examples)
  switch(c.eff){
    case 'gain1': if(who==='you'){S.ae+=1; S._log.push(`${c.n} resolves: +1⚡.`);} else {S.ai.ae+=1; S._log.push(`AI gains +1⚡.`);} break;
    case 'drain1': if(who==='you'){S.ai.ae=Math.max(0,S.ai.ae-1); S._log.push(`${c.n}: drain 1⚡ (AI).`);} else {S.ae=Math.max(0,S.ae-1); S._log.push(`AI drains 1⚡.`);} break;
    case 'tax': S._log.push(`${c.n}: tax (sim).`); break;
    default:
      if(c.t==='Spell'){
        if(c.n==='Flame Lash'){ S._log.push((who==='you'?'You':'AI')+" Flame Lash deals 5 total (sim)."); tranceOnDamage(S,who); }
        else if(c.n==='Ember'){ S._log.push((who==='you'?'You':'AI')+" Ember deals 2 (sim)."); tranceOnDamage(S,who); }
        else if(c.n==='Spark Javelin'){ S._log.push((who==='you'?'You':'AI')+" Spark Javelin deals 2 (sim)."); tranceOnDamage(S,who); }
        else if(c.n==='Frost Bolt'){ S._log.push((who==='you'?'You':'AI')+" Frost Bolt slows (sim)."); tranceOnFrost(S,who); }
        else { S._log.push(`${c.n} resolves.`); }
      }
  }

  // Move to discard and clear
  if(who==='you'){ S.disc.push(c); S.slots[slotIndex]=null; }
  else { S.ai.disc.push(c); S.ai.slots[slotIndex]=null; }

  // FX ping for UI (resolve glow)
  S._fx = { ping: (S._fx?.ping||0)+1, type:'resolve', who, slot: slotIndex };
}

function tranceOnDamage(S,who){
  const weaver = (who==='you'?S.trance.you.weaver:S.trance.ai.weaver);
  if(weaver==='Emberwright') gainTrance(S,who,'onDamage',1);
}
function tranceOnFrost(S,who){
  const weaver = (who==='you'?S.trance.you.weaver:S.trance.ai.weaver);
  if(weaver==='Frostseer') gainTrance(S,who,'onFrost',1);
}

export function gainTrance(S,who,kind,amt=1){
  const W=who==='you'?WEAVERS[S.trance.you.weaver]:WEAVERS[S.trance.ai.weaver];
  if(!W) return;
  const add = (W.gains && W.gains[kind]) ? (amt||1) : 0;
  if(add<=0) return;
  const T = who==='you'?S.trance.you:S.trance.ai;
  if(T.cur>= (T.cap||6)) return;
  T.cur = Math.min(T.cap||6, T.cur+add);
  if(T.cur===T.cap) S._log.push(`${who==='you'?'You':'AI'} Trance is READY.`);
}
