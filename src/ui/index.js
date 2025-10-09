import { newGame, CARD_TYPES, channelCost } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import { wireHandDrag } from './drag.js';
import { animateCardsToDiscard, animateNewDraws, animateAfBuyToDiscard, spotlightThenDiscard } from './animate.js';

let state = newGame();
const root = document.getElementById('app');

function fanTransform(i, n){ const mid=(n-1)/2, o=i-mid; const rot=o*(10/Math.max(1,n)); const x=o*60; const lift=-Math.abs(o)*1; return `translate(calc(-50% + ${x}px), ${lift}px) rotate(${rot}deg)`; }
function layoutHand(){ const cards=[...document.querySelectorAll('[data-board="YOU"] .hand .card')]; const n=cards.length; cards.forEach((el,i)=>{ const base=fanTransform(i,n); el.setAttribute('data-base',base); if(el.style.position!=='fixed') el.style.transform=base; }); }
function typeBadge(c){ const label=c.type.charAt(0)+c.type.slice(1).toLowerCase(); return `<div class="badge ${label}">${label}</div>`; }

function cardHtml(c, zone, i=0, n=1, slotIndex=null){
  const pipBar=(c.pipsMax>0)?`<div class="pips" data-pips-for="${c.id}">`+Array.from({length:c.pipsMax},(_,k)=>`<span class="pip ${k<c.pips?'full':''}"></span>`).join('')+`</div>`:'';
  const base=zone==='hand'?fanTransform(i,n):''; const style=zone==='hand'?`style="transform:${base}" data-base="${base}"`:'';
  const gain=(zone==='hand'&&c.aetherGain>0)?`<div class="gain-chip" data-gain="${c.aetherGain}" data-card="${c.id}">+${c.aetherGain} ⚡</div>`:'';
  const canAdv=zone==='slot'&&c.type===CARD_TYPES.SPELL, disabled=canAdv&&(state.you.aether < c.aetherCost);
  const adv=canAdv?`<button class="advance-btn" ${disabled?'disabled':''} title="${disabled?`Need ${c.aetherCost} ⚡`:`Spend ${c.aetherCost} ⚡`}" data-adv-card="${c.id}" data-slot-index="${slotIndex}">Advance</button>`:'';
  return `<div class="card" data-card-id="${c.id}" data-zone="${zone}" data-type="${c.type}" ${style}>${typeBadge(c)}<div class="title">${c.name}</div>${pipBar}${gain}${adv}</div>`;
}

function slotsRow(side){ return `<div class="row"><div class="slots">
  ${side.slots.map((c,idx)=>`<div class="slot" data-drop="slot" data-slot-index="${idx}">${c?cardHtml(c,'slot',0,1,idx):'<div class="slot-ghost">Spell Slot</div>'}</div>`).join('')}
  <div class="glyph-slot" data-drop="glyph">${side.glyphSlot?cardHtml(side.glyphSlot,'slot'):'<div class="slot-ghost">Glyph Slot</div>'}</div>
</div><div class="spacer"></div><div class="aether">Aether: ${side.aether}</div></div>`; }

function aetherflowHtml(){ return `<div class="aetherflow">
    <div class="af-title">Aetherflow</div>
    <div class="af-cards">
      ${state.aetherflow.map(c=>`<div class="af-card" data-af-id="${c.id}" title="Channel to buy (sent to Discard)">
        ${typeBadge(c)}<div class="title">${c.name}</div>
        <div class="cost-chip">Channel: ${channelCost(c)} ⚡</div>
      </div>`).join('')}
    </div></div>`; }

function sideHtml(side, who){ const n=side.hand.length; const hand= who==='YOU'?`<div class="hand">${side.hand.map((c,i)=>cardHtml(c,'hand',i,n)).join('')}</div>`:''; return `<section class="board" data-board="${who}">${slotsRow(side)}${hand}</section>`; }

function renderHearts(id, hp){ const el=document.getElementById(id); if(!el) return; const max=5; el.innerHTML=Array.from({length:max},(_,i)=>`<div class="heart ${i<hp?'':'off'}"></div>`).join(''); }
function renderTrance(){ const row=document.getElementById('tranceRow'); const hp=state.you.health; row.innerHTML=state.trance.map(t=>`<div class="trance ${hp<=t.at?'active':''}" title="Activates at ${t.at} HP">${t.label}</div>`).join(''); }

async function render(andAnimateDrawIds=null){
  renderHearts('youHearts', state.you.health); renderHearts('aiHearts', state.ai.health); renderTrance();
  root.innerHTML = `${sideHtml(state.ai,'AI')}${aetherflowHtml()}${sideHtml(state.you,'YOU')}`;
  document.getElementById('deckIcon')?.setAttribute('data-count', state.you.draw.length);
  document.getElementById('discardIcon')?.setAttribute('data-count', state.you.discard.length);
  document.getElementById('aetherWell').textContent = `⚡ ${state.you.aether}`;
  wireHandDrag(root, dispatch);

  document.getElementById('btnEnd').onclick = async ()=>{ await animateCardsToDiscard(); dispatch({type:A.END_TURN}); dispatch({type:A.AI_TURN}); };
  root.querySelectorAll('.gain-chip').forEach(el=> el.onclick = ()=> dispatch({type:A.DISCARD_FOR_AETHER, cardId: el.getAttribute('data-card')}) );
  root.querySelectorAll('.advance-btn').forEach(el=> el.onclick = ()=>{ if(el.hasAttribute('disabled')) return; dispatch({type:A.ADVANCE_PIP, slotIndex:Number(el.getAttribute('data-slot-index'))}); });

  // Channel (buy) from Aetherflow
  root.querySelectorAll('.af-card').forEach(el=>{
    const afId = el.getAttribute('data-af-id');
    el.onclick = async ()=>{
      if (el.__dragging) return;
      const card = state.aetherflow.find(c=>c.id===afId); if (!card) return;
      const cost = channelCost(card);
      if (state.you.aether < cost) { el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'), 250); return; }
      await spotlightThenDiscard(el);
      dispatch({type:A.CHANNEL_AF, afId});
    };
    // Drag to discard -> channel
    let dragging = false; let sx=0, sy=0;
    el.addEventListener('pointerdown',e=>{
      sx=e.clientX; sy=e.clientY; dragging=false; el.__dragging=false;
      const move=(ev)=>{ const dx=ev.clientX-sx, dy=ev.clientY-sy; if(!dragging && (Math.abs(dx)>5||Math.abs(dy)>5)){ dragging=true; el.__dragging=true; el.classList.add('dragging'); el.style.pointerEvents='none'; } if(dragging){ el.style.transform=`translate(${dx}px,${dy}px)`; } };
      const up=async(ev)=>{
        el.removeEventListener('pointermove',move); el.removeEventListener('pointerup',up); el.removeEventListener('pointercancel',up);
        if(dragging){ el.classList.remove('dragging'); el.style.pointerEvents=''; el.style.transform=''; const t=document.elementFromPoint(ev.clientX,ev.clientY); const onDiscard = !!t?.closest('#discardIcon'); const card = state.aetherflow.find(c=>c.id===afId); const cost = channelCost(card); if(onDiscard && state.you.aether >= cost){ await animateAfBuyToDiscard(el); dispatch({type:A.CHANNEL_AF, afId}); } }
      };
      el.addEventListener('pointermove',move,{passive:true});
      el.addEventListener('pointerup',up,{passive:true});
      el.addEventListener('pointercancel',up,{passive:true});
    }, {passive:true});
  });

  layoutHand();
  if (andAnimateDrawIds && andAnimateDrawIds.length){ await animateNewDraws(andAnimateDrawIds); layoutHand(); }
}

function dispatch(action){
  const before = new Set(state.you.hand.map(c=>c.id));
  state = reducer(state, action);
  const after = new Set(state.you.hand.map(c=>c.id));
  const newIds = [...after].filter(id=>!before.has(id));
  render(newIds);
}

render(); dispatch({type:A.START});