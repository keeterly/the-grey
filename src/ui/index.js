import { newGame } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import { wireHandDrag } from './drag.js';
import { runAnimations } from './animate.js';

let state = newGame();

const root = document.getElementById('app');
const $ = s => root.querySelector(s);

function dispatch(action){
  state = reducer(state, action);
  render();
  runAnimations(root, state.animations);
  state.animations = [];
}

function cardHtml(c, zone){
  const pipBar = (c.pipsMax>0)
    ? `<div class="pips" data-pips-for="${c.id}">`+
      Array.from({length:c.pipsMax}, (_,i)=>`<span class="pip ${i < c.pips ? 'full':''}"></span>`).join('')+
      `</div>` : '';
  return `<div class="card" data-card-id="${c.id}" data-zone="${zone}">
    <div class="title">${c.name}</div>
    ${pipBar}
  </div>`;
}

function sideHtml(side, who){
  return `
  <section class="board" data-board="${who}">
    <div class="row">
      <div class="slot" data-drop="slot">${side.slot ? cardHtml(side.slot,'slot') : '<div class="slot-ghost">Spell Slot</div>'}</div>
      <div class="glyph-slot" data-drop="glyph">${side.glyphSlot ? cardHtml(side.glyphSlot,'slot') : '<div class="slot-ghost">Glyph Slot</div>'}</div>
      <div class="aether">Aether: ${side.aether}</div>
    </div>
    ${who==='YOU' ? `<div class="hand">${side.hand.map(c=>cardHtml(c,'hand')).join('')}</div>` : ''}
  </section>`;
}

function render(){
  root.innerHTML = `
    <div class="hud">
      <button id="btnDraw">Draw</button>
      <button id="btnAdvance">Advance</button>
      <button id="btnEnd">End Turn</button>
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
// initial start draws
dispatch({type:A.START});
