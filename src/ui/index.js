import { newGame } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import { wireHandDrag } from './drag.js';
import { runAnimations } from './animate.js';

let state = newGame();

const root = document.getElementById('app');
const $ = s => root.querySelector(s);

/* ------- Fan math (MTG Arena vibe) ------- */
function fanTransform(i, n){
  const mid = (n-1)/2;
  const offset = i - mid;
  const spread = Math.min(16, 9 + n*0.9);   // how far each card rotates
  const rot = offset * (spread / Math.max(1, n));
  const lift = -Math.abs(offset) * 2;       // slight dip towards edges
  const x = offset * 24;                    // horizontal spacing
  return `translate(calc(-50% + ${x}px), ${lift}px) rotate(${rot}deg)`;
}

/* ------- Rendering ------- */
function dispatch(action){
  state = reducer(state, action);
  render();
  runAnimations(root, state.animations);
  state.animations = [];
}

function cardHtml(c, zone, i=0, n=1){
  const pipBar = (c.pipsMax>0)
    ? `<div class="pips" data-pips-for="${c.id}">
        ${Array.from({length:c.pipsMax}, (_,k)=>`<span class="pip ${k < c.pips ? 'full':''}"></span>`).join('')}
      </div>`
    : '';
  const fan = zone === 'hand' ? `style="transform:${fanTransform(i,n)}"` : '';
  return `<div class="card" data-card-id="${c.id}" data-zone="${zone}" data-type="${c.type}" ${fan}>
    <div class="title">${c.name}</div>
    ${pipBar}
  </div>`;
}

function sideHtml(side, who){
  const n = side.hand.length;
  const handHtml = who==='YOU'
    ? `<div class="hand">
        ${side.hand.map((c,i)=>cardHtml(c,'hand',i,n)).join('')}
      </div>`
    : '';
  return `
  <section class="board" data-board="${who}">
    <div class="row">
      <div class="slot" data-drop="slot">${side.slot ? cardHtml(side.slot,'slot') : '<div class="slot-ghost">Spell Slot</div>'}</div>
      <div class="glyph-slot" data-drop="glyph">${side.glyphSlot ? cardHtml(side.glyphSlot,'slot') : '<div class="slot-ghost">Glyph Slot</div>'}</div>
      <div class="spacer"></div>
      <div class="aether">Aether: ${side.aether}</div>
    </div>
    ${handHtml}
  </section>`;
}

function render(){
  root.innerHTML = `
    <div class="hud">
      <div class="icon badge" title="Deck" data-count="${state.you.draw.length}">⟲</div>
      <div class="icon badge" title="Discard" data-count="${state.you.discard.length}">⌫</div>
      <button id="btnDraw">Draw</button>
      <button id="btnAdvance">Advance</button>
      <button id="btnEnd">End Turn</button>
      <div class="spacer"></div>
      <div class="aetherGem" title="Your Aether">${state.you.aether}</div>
    </div>
    <div class="boards">
      ${sideHtml(state.ai,'AI')}
      ${sideHtml(state.you,'YOU')}
    </div>
  `;
  wireHandDrag(root, dispatch);
  $('#btnDraw').onclick = ()=> dispatch({type:A.DRAW});
  $('#btnAdvance').onclick = ()=> dispatch({type:A.ADVANCE_PIP});
  $('#btnEnd').onclick = ()=>{ dispatch({type:A.END_TURN}); dispatch({type:A.AI_TURN}); };
}

render();
dispatch({type:A.START});
