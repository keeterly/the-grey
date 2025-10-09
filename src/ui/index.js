import { newGame, CARD_TYPES, cardCost } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import { wireHandDrag } from './drag.js';
import { stageNewDraws, animateCardsToDiscard, animateNewDraws, animateAfBuyToDiscard, spotlightThenDiscard } from './animate.js';

let state = newGame();
const root = document.getElementById('app');

// ---- Helpers ----
function fanTransform(i, n){ const mid=(n-1)/2, o=i-mid; const rot=o*(10/Math.max(1,n)); const x=o*60; const lift=-Math.abs(o)*1; return `translate(calc(-50% + ${x}px), ${lift}px) rotate(${rot}deg)`; }
function layoutHand(){ const cards=[...document.querySelectorAll('[data-board="YOU"] .hand .card')]; const n=cards.length; cards.forEach((el,i)=>{ const base=fanTransform(i,n); el.setAttribute('data-base',base); if(el.style.position!=='fixed') el.style.transform=base; }); }
function typeBadge(c){ const label=c.type.charAt(0)+c.type.slice(1).toLowerCase(); return `<div class="badge ${label}">${label}</div>`; }
function heartsHtml(hp, id){ const max=5; return `<div class="hearts" id="${id}">${Array.from({length:max},(_,i)=>`<div class="heart ${i<hp?'':'off'}"></div>`).join('')}</div>`; }
function tranceChips(side, who){
  return `<div class="trances">
    ${side.trances.map((t,idx)=>{
      const active = (idx===0? side.trance1Active : side.trance2Active) ? 'active' : '';
      const key = `${who}-tr-${idx}`;
      return `<div class="trance-chip ${active}" data-trance="${key}" data-who="${who}" data-tr-index="${idx}" title="Activates at ${t.at} HP">${t.name}</div>`;
    }).join('')}
  </div>`;
}

function sideHeader(side, who){
  const hpId = who==='YOU' ? 'youHearts' : 'aiHearts';
  return `<div class="row head">
    <div class="weaver">
      <div class="name">${side.weaverName||who}</div>
      ${tranceChips(side, who)}
    </div>
    ${heartsHtml(side.health, hpId)}
  </div>`;
}

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
</div><div class="spacer"></div></div>`; }

function aetherflowHtml(){ return `<div class="aetherflow">
    <div class="af-title">Aetherflow</div>
    <div class="af-cards">
      ${state.aetherflow.map(c=>{ const afford = state.you.aether >= cardCost(c) ? 'afford' : ''; return `<div class="af-card ${afford}" data-af-id="${c.id}" title="Buy (sent to Discard)">
        ${typeBadge(c)}<div class="title">${c.name}</div>
        <div class="cost-chip">⚡ ${cardCost(c)}</div>
      </div>`;}).join('')}
    </div></div>`; }

function sideHtml(side, who){
  const n=side.hand.length;
  const hand= who==='YOU'?`<div class="hand">${side.hand.map((c,i)=>cardHtml(c,'hand',i,n)).join('')}</div>`:'';
  return `<section class="board" data-board="${who}">
    ${sideHeader(side, who)}
    ${slotsRow(side)}
    ${hand}
  </section>`;
}

// ---- Modal stuff ----
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
modalClose.onclick = ()=> modal.classList.remove('show');
modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('show'); });

function showListModal(title, items){
  modalTitle.textContent = title;
  modalBody.innerHTML = `<div class="list">${items.map(i=>`<div class="cell">${i}</div>`).join('')}</div>`;
  modal.classList.add('show');
}

function showTranceModal(who, idx){
  const side = (who==='YOU') ? state.you : state.ai;
  const t = side.trances[idx];
  if(!t) return;
  modalTitle.textContent = `${side.weaverName} — ${t.name}`;
  modalBody.innerHTML = `<div>${t.description||'No description set.'}</div><div style="margin-top:8px;color:#6b5f50;font-size:12px">Activates at ${t.at} HP</div>`;
  modal.classList.add('show');
}

// ---- Render ----
function pulseHeartsIfNeeded(){
  const youHearts = document.getElementById('youHearts');
  const aiHearts = document.getElementById('aiHearts');
  // Decide pulses based on active flags
  if(state.you.trance2Active){ youHearts?.classList.add('pulse-major'); }
  else if(state.you.trance1Active){ youHearts?.classList.add('pulse-minor'); }
  if(state.ai.trance2Active){ aiHearts?.classList.add('pulse-major'); }
  else if(state.ai.trance1Active){ aiHearts?.classList.add('pulse-minor'); }
  // Clear after animation ends so future transitions can retrigger
  ['animationend','webkitAnimationEnd'].forEach(evt=>{
    youHearts?.addEventListener(evt, ()=>{ youHearts.classList.remove('pulse-minor','pulse-major'); }, {once:true});
    aiHearts?.addEventListener(evt, ()=>{ aiHearts.classList.remove('pulse-minor','pulse-major'); }, {once:true});
  });
}

async function render(andAnimateDrawIds=null){
  root.innerHTML = `${sideHtml(state.ai,'AI')}${aetherflowHtml()}${sideHtml(state.you,'YOU')}`;

  // HUD counters + click to peek
  const deckIcon = document.getElementById('deckIcon');
  const discardIcon = document.getElementById('discardIcon');
  deckIcon?.setAttribute('data-count', state.you.draw.length);
  discardIcon?.setAttribute('data-count', state.you.discard.length);
  document.getElementById('aetherWell').setAttribute('data-count', state.you.aether);

  deckIcon.onclick = ()=> showListModal('Your Deck (top shown last)', state.you.draw.map(c=>`${c.name} — ${c.type}`));
  discardIcon.onclick = ()=> showListModal('Your Discard', state.you.discard.map(c=>`${c.name} — ${c.type}`));

  // Wire chip clicks (trance details)
  root.querySelectorAll('.trance-chip').forEach(el=>{
    el.addEventListener('click', ()=>{
      const who = el.getAttribute('data-who');
      const idx = Number(el.getAttribute('data-tr-index'));
      showTranceModal(who, idx);
    });
  });

  wireHandDrag(root, dispatch);

  document.getElementById('btnEnd').onclick = async ()=>{
    await animateCardsToDiscard();
    dispatch({type:A.END_TURN});
    dispatch({type:A.AI_TURN});
  };

  // Click to gain aether from instants
  root.querySelectorAll('.gain-chip').forEach(el=> el.onclick = ()=> dispatch({type:A.DISCARD_FOR_AETHER, cardId: el.getAttribute('data-card')}) );

  // Advance buttons
  root.querySelectorAll('.advance-btn').forEach(el=> el.onclick = ()=>{
    if(el.hasAttribute('disabled')) return;
    dispatch({type:A.ADVANCE_PIP, slotIndex:Number(el.getAttribute('data-slot-index'))});
  });

  // Aetherflow interactivity
  root.querySelectorAll('.af-card').forEach(el=>{
    const afId = el.getAttribute('data-af-id');
    el.onclick = async ()=>{
      if (el.__dragging) return;
      const card = state.aetherflow.find(c=>c.id===afId); if (!card) return;
      const cost = cardCost(card);
      if (state.you.aether < cost) { el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'), 250); return; }
      await spotlightThenDiscard(el);
      dispatch({type:A.BUY_AF, afId});
    };
    // Drag to discard -> buy
    let dragging = false; let sx=0, sy=0;
    el.addEventListener('pointerdown',e=>{
      sx=e.clientX; sy=e.clientY; dragging=false; el.__dragging=false;
      const move=(ev)=>{ const dx=ev.clientX-sx, dy=ev.clientY-sy; if(!dragging && (Math.abs(dx)>5||Math.abs(dy)>5)){ dragging=true; el.__dragging=true; el.classList.add('dragging'); el.style.pointerEvents='none'; } if(dragging){ ev.preventDefault(); el.style.transform=`translate3d(${dx}px,${dy}px,0)`; } };
      const up=async(ev)=>{
        el.removeEventListener('pointermove',move); el.removeEventListener('pointerup',up); el.removeEventListener('pointercancel',up);
        if(dragging){ el.classList.remove('dragging'); el.style.pointerEvents=''; el.style.transform=''; const t=document.elementFromPoint(ev.clientX,ev.clientY); const onDiscard = !!t?.closest('#discardIcon'); const card = state.aetherflow.find(c=>c.id===afId); const cost = cardCost(card); if(onDiscard && state.you.aether >= cost){ await animateAfBuyToDiscard(el); dispatch({type:A.BUY_AF, afId}); } }
      };
      el.addEventListener('pointermove',move,{passive:false});
      el.addEventListener('pointerup',up,{passive:false});
      el.addEventListener('pointercancel',up,{passive:false});
    }, {passive:false});
  });

  // Stage new draws BEFORE first paint, then animate
  if (andAnimateDrawIds && andAnimateDrawIds.length){ stageNewDraws(andAnimateDrawIds); }
  layoutHand();
  if (andAnimateDrawIds && andAnimateDrawIds.length){ await animateNewDraws(andAnimateDrawIds); layoutHand(); }

  // pulse hearts when (re)rendering
  pulseHeartsIfNeeded();
}

function dispatch(action){
  const before = new Set(state.you.hand.map(c=>c.id));
  state = reducer(state, action);
  const after = new Set(state.you.hand.map(c=>c.id));
  const newIds = [...after].filter(id=>!before.has(id));
  render(newIds);
}

render();
dispatch({type:A.START});