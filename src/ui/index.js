import { newGame, CARD_TYPES } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import { wireHandDrag } from './drag.js';
import { runAnimations } from './animate.js';

let state = newGame();
const root = document.getElementById('app');

function fanTransform(i, n){
  const mid=(n-1)/2, offset=i-mid;
  const rot = offset * (10 / Math.max(1,n));
  const lift = -Math.abs(offset) * 1;
  const x = offset * 44; // wide spread
  return { base: `translate(calc(-50% + ${x}px), ${lift}px) rotate(${rot}deg)`, rot: `${rot}deg` };
}

function dispatch(action){ state=reducer(state,action); render(); runAnimations(root,state.animations); state.animations=[]; }

function typeBadge(c){ const label=c.type.charAt(0)+c.type.slice(1).toLowerCase(); return `<div class="badge ${label}">${label}</div>`; }

function cardHtml(c, zone, i=0, n=1, slotIndex=null){
  const pipBar = (c.pipsMax>0)?`<div class="pips" data-pips-for="${c.id}">`+Array.from({length:c.pipsMax},(_,k)=>`<span class="pip ${k<c.pips?'full':''}"></span>`).join('')+`</div>`:'';
  const ft = zone==='hand' ? fanTransform(i,n) : {base:'',rot:'0deg'};
  const baseStyle = zone==='hand' ? `style="transform: var(--base, ${ft.base}); --rot:${ft.rot}; --dx:0px; --dy:0px;" data-base="${ft.base}"` : '';
  const gain = (zone==='hand' && c.aetherGain>0) ? `<div class="gain-chip" data-gain="${c.aetherGain}" data-card="${c.id}">+${c.aetherGain} ⚡</div>` : '';
  const advanceBtn = (zone==='slot' && c.type===CARD_TYPES.SPELL) ? `<div class="advance-btn" data-adv-card="${c.id}" data-slot-index="${slotIndex}">Advance</div>` : '';
  return `<div class="card" data-card-id="${c.id}" data-zone="${zone}" data-type="${c.type}" ${baseStyle}>
    ${typeBadge(c)}<div class="title">${c.name}</div>${pipBar}${gain}${advanceBtn}</div>`;
}

function slotsRow(side){
  return `<div class="row"><div class="slots">
    ${side.slots.map((c,idx)=>`<div class="slot" data-drop="slot" data-slot-index="${idx}">${c?cardHtml(c,'slot',0,1,idx): '<div class="slot-ghost">Spell Slot</div>'}</div>`).join('')}
    <div class="glyph-slot" data-drop="glyph">${side.glyphSlot?cardHtml(side.glyphSlot,'slot'): '<div class="slot-ghost">Glyph Slot</div>'}</div>
  </div><div class="spacer"></div><div class="aether">Aether: ${side.aether}</div></div>`;
}

function sideHtml(side, who){
  const n = side.hand.length;
  const handHtml = who==='YOU' ? `<div class="hand">${side.hand.map((c,i)=>cardHtml(c,'hand',i,n)).join('')}</div>` : '';
  return `<section class="board" data-board="${who}">${slotsRow(side)}${handHtml}</section>`;
}

function snapshotHand(){
  const out = [];
  document.querySelectorAll('[data-board="YOU"] .hand [data-card-id]').forEach(el=>{
    const r = el.getBoundingClientRect();
    out.push({ id:el.dataset.cardId, x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height });
  });
  window.__lastHandSnapshot = out;
}

function render(){
  root.innerHTML = `${sideHtml(state.ai,'AI')}${sideHtml(state.you,'YOU')}`;

  // Footer HUD numbers
  const deckIcon = document.getElementById('deckIcon');
  const discardIcon = document.getElementById('discardIcon');
  const aetherWell = document.getElementById('aetherWell');
  if (deckIcon) deckIcon.setAttribute('data-count', state.you.draw.length);
  if (discardIcon) discardIcon.setAttribute('data-count', state.you.discard.length);
  if (aetherWell) aetherWell.textContent = `⚡ ${state.you.aether}`;

  // Wire UI
  wireHandDrag(root, dispatch);
  const endBtn = document.getElementById('btnEnd');
  if (endBtn) endBtn.onclick = ()=>{ snapshotHand(); dispatch({type:A.END_TURN}); dispatch({type:A.AI_TURN}); };

  // Per-card actions
  root.querySelectorAll('.gain-chip').forEach(el=> el.onclick = ()=> dispatch({type:A.DISCARD_FOR_AETHER, cardId: el.getAttribute('data-card')}) );
  root.querySelectorAll('.advance-btn').forEach(el=> el.onclick = ()=> dispatch({type:A.ADVANCE_PIP, slotIndex: Number(el.getAttribute('data-slot-index'))}) );
}

render(); dispatch({type:A.START});