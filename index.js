/* === Minimal, stable game runtime – v2.53 compatible ===
 * - Portrait HUD (hearts, trance I/II, aether gem)
 * - River market (costs 4,3,3,2,2) with spotlight + purchase-to-discard
 * - Start turn: refill river + draw animation
 * - End turn: discard hand animation, advance river
 * - Drag/drop: slots pulse only for valid types; discard gains aether
 * - Hold to preview (press/hold or longtouch)
 */

///////////////////////
// DOM references
///////////////////////
const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>[...root.querySelectorAll(sel)];

const board = $('#board');
const flowRow = $('#flow-row');                 // UL/row with 5 flow slots
const playerSlotsRow = $('#player-slots');      // spell/glyph slots row
const aiSlotsRow = $('#ai-slots');
const handEl = $('.hand');                      // hand container

// Portrait HUD buckets
const playerPortrait = $('.row.player .portrait');
const aiPortrait = $('.row.ai .portrait');

///////////////////////
// Assets (inline svg)
///////////////////////
const gemSVG = `<svg viewBox="0 0 24 24" class="gem" aria-hidden="true"><path d="M12 2l4.5 4.5L12 22 7.5 6.5 12 2z"/></svg>`;
const heartSVG = `<svg viewBox="0 0 24 24" class="heart-svg" aria-hidden="true"><path fill="#e8a2a2" d="M12.1 8.64l-.1.1-.1-.1C10.14 6.9 7.4 6.36 5.6 8.17c-1.78 1.78-1.23 4.6.5 6.32L12 20.4l5.9-5.9c1.73-1.72 2.28-4.54.5-6.32-1.8-1.81-4.54-1.27-6.3.46z"/></svg>`;

///////////////////////
// Game state (lite)
///////////////////////
const COSTS = [4,3,3,2,2];

const STARTING_DECK = [
  {name:'Pulse of the Grey', type:'SPELL', pip:1, cost:0, text:'On Resolve: Draw 1, gain ', aetherValue:0},
  {name:'Wispform Surge', type:'SPELL', pip:1, cost:0, text:'On Resolve: Advance another Spell 1 (free)', aetherValue:0},
  {name:'Greyfire Bloom', type:'SPELL', pip:1, cost:1, text:'On Resolve: Advance another Spell 1 (free)', aetherValue:0},
  {name:'Echoing Reservoir', type:'SPELL', pip:1, cost:0, text:'On Resolve: Channel 1', aetherValue:2},
  {name:'Echoing Reservoir', type:'SPELL', pip:1, cost:0, text:'On Resolve: Channel 1', aetherValue:2},
  {name:'Dormant Catalyst', type:'SPELL', pip:1, cost:0, text:'On Resolve: Channel 2', aetherValue:1},
  {name:'Ashen Focus', type:'SPELL', pip:1, cost:0, text:'On Resolve: Channel 1 and Draw 1', aetherValue:1},
  {name:'Surge of Ash', type:'INSTANT', pip:0, cost:1, text:'Target Spell advances 1 step (free)', aetherValue:0},
  {name:'Veil of Dust', type:'INSTANT', pip:0, cost:1, text:'Prevent 1 damage or negate a hostile Instant', aetherValue:0},
  {name:'Glyph of Remnant Light', type:'GLYPH', pip:0, cost:0, text:'When a Spell resolves → Gain 1 ', aetherValue:0},
  {name:'Glyph of Returning Echo', type:'GLYPH', pip:0, cost:0, text:'When you Channel → Draw 1 card', aetherValue:0},
];

const FLOW_POOL = [
  {name:'Surge of Cinders', type:'INSTANT', pip:0, cost:2, text:'Deal 2 damage to any target', aetherValue:0},
  {name:'Pulse Feedback', type:'INSTANT', pip:0, cost:3, text:'Advance all Spells you control by 1', aetherValue:0},
  {name:'Refracted Will', type:'INSTANT', pip:0, cost:2, text:'Counter an Instant or negate a Glyph trigger', aetherValue:0},
  {name:'Aether Impel', type:'INSTANT', pip:0, cost:4, text:'Gain 3 this turn', aetherValue:0},
  {name:'Cascade Insight', type:'INSTANT', pip:0, cost:3, text:'Draw 2 cards, then discard 1', aetherValue:0},
  {name:'Resonant Chorus', type:'SPELL', pip:1, cost:0, text:'On Resolve: Gain 2 and Channel 1', aetherValue:1},
  {name:'Emberline Pulse', type:'SPELL', pip:1, cost:1, text:'On Resolve: Deal 2 damage and Draw 1', aetherValue:0},
  {name:'Fractured Memory', type:'SPELL', pip:2, cost:0, text:'On Resolve: Draw 2 cards', aetherValue:0},
  {name:'Obsidian Vault', type:'SPELL', pip:1, cost:0, text:'On Resolve: Channel 2 and Gain 1 ', aetherValue:1},
  {name:'Mirror Cascade', type:'SPELL', pip:1, cost:1, text:'On Resolve: Copy the next Instant you play this turn', aetherValue:0},
  {name:'Sanguine Flow', type:'SPELL', pip:1, cost:2, text:'On Resolve: Lose 1 Vitality, Gain 3 ', aetherValue:0},
  {name:'Glyph of Withering Light', type:'GLYPH', pip:0, cost:0, text:'When opponent plays a Spell → They lose 1 ', aetherValue:0},
  {name:'Glyph of Vigilant Echo', type:'GLYPH', pip:0, cost:0, text:'End of your turn → Channel 1', aetherValue:0},
  {name:'Glyph of Buried Heat', type:'GLYPH', pip:0, cost:0, text:'When you discard for → Gain 1 extra ', aetherValue:0},
  {name:'Glyph of Soulglass', type:'GLYPH', pip:0, cost:0, text:'When you buy from Aether Flow → Draw 1 card', aetherValue:0},
];

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }

const state = {
  turn: 1,
  player:{
    hp:5, aether:0, trance:1,
    deck:[], hand:[], discard:[],
  },
  ai:{ hp:5, aether:0, trance:1, deck:[], hand:[], discard:[] },
  flow:[null,null,null,null,null], // left→right costs 4,3,3,2,2
};

///////////////////////
// Render helpers
///////////////////////
function renderPortraitBars(){
  // Player
  const contP = $('.row.player .portrait');
  if(contP){
    contP.innerHTML = `
      <img src="weaver_aria.jpg" alt="Player">
      <div class="hearts">${'●'.repeat(state.player.hp).split('').map(()=>`<span class="heart">${heartSVG}</span>`).join('')}</div>
      <div class="aether-display" id="HUD_P">
        ${gemSVG}<span class="val">${state.player.aether}</span>
      </div>
      <div class="trance-stack">
        <div class="trance-badge"><span class="trance-diamond"></span> I</div>
        <div class="trance-badge" style="opacity:.5;"><span class="trance-diamond"></span> II</div>
      </div>
    `;
  }
  // AI
  const contA = $('.row.ai .portrait');
  if(contA){
    contA.innerHTML = `
      <img src="weaver_morr.jpg" alt="Opponent" style="transform:scaleX(-1)">
      <div class="hearts" style="justify-content:flex-end">${'●'.repeat(state.ai.hp).split('').map(()=>`<span class="heart">${heartSVG}</span>`).join('')}</div>
      <div class="aether-display" id="HUD_A">
        ${gemSVG}<span class="val">${state.ai.aether}</span>
      </div>
      <div class="trance-stack" style="align-items:flex-end">
        <div class="trance-badge"><span class="trance-diamond"></span> I</div>
        <div class="trance-badge" style="opacity:.5;"><span class="trance-diamond"></span> II</div>
      </div>
    `;
  }
}

function setAether(playerSide, val, flash=true){
  state[playerSide].aether = val;
  const hud = playerSide==='player' ? $('#HUD_P') : $('#HUD_A');
  if(hud){ hud.querySelector('.val').textContent = val; if(flash){ hud.classList.remove('flash'); void hud.offsetWidth; hud.classList.add('flash'); } }
}

function makeCardEl(card, {inHand=false}={}){
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = inHand;
  el.dataset.type = card.type;
  el.dataset.name = card.name;

  // pip track
  const pips = (card.pip||0);
  const pipRow = `<div class="pip-track">${Array.from({length:pips}).map(()=>'<span class="pip filled"></span>').join('')}</div>`;

  // aether chip (bottom-left), scaled when in-hand so it’s prominent
  const chip = card.aetherValue>0
   ? `<div class="aether-chip ${inHand?'scale-25x':''}">${gemSVG}<span class="val">${card.aetherValue}</span></div>`
   : '';

  el.innerHTML = `
    <div class="title">${card.name}</div>
    <div class="type">${card.type}</div>
    <div class="rule-sep"></div>
    ${pipRow}
    <div class="textbox">${card.text.replaceAll('Æ', '').replaceAll(' aether',' ').replaceAll(' this',' ') }${card.text.includes('Gain')||card.text.includes('Channel')?` ${gemSVG}`:''}</div>
    <div class="cost">${card.cost?`— Cost ${card.cost}`:''}</div>
    ${chip}
  `;

  if(inHand){
    // drag
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragend', onDragEnd);
    // long press → peek
    enablePeek(el);
  }

  return el;
}

///////////////////////
// Flow (river market)
///////////////////////
function refillFlowStartOfTurn(){
  // Shift down existing to align costs (rightmost cheapest)
  // End-of-turn shift happens elsewhere; here only fill from leftmost empty
  for(let i=0;i<state.flow.length;i++){
    if(!state.flow[i]){
      // pull random card from pool
      const card = {...FLOW_POOL[Math.floor(Math.random()*FLOW_POOL.length)]};
      state.flow[i] = card;
    }
  }
  renderFlow();
}

function advanceFlowEndOfTurn(){
  // Move each card one step right; rightmost falls off
  for(let i=state.flow.length-1;i>=1;i--){
    state.flow[i] = state.flow[i-1];
  }
  state.flow[0] = null;
}

function renderFlow(){
  if(!flowRow) return;
  flowRow.innerHTML = '';
  state.flow.forEach((card, idx)=>{
    const li = document.createElement('li');
    li.className = 'flow-card';
    li.dataset.idx = idx;

    const slot = document.createElement('div');
    slot.className = 'slot';

    if(card){
      const c = makeCardEl(card, {inHand:false});
      c.style.pointerEvents = 'none';
      slot.appendChild(c);

      const price = document.createElement('div');
      price.className = 'price-label';
      price.innerHTML = `${gemSVG}<span>${COSTS[idx]} to buy</span>`;
      li.appendChild(slot);
      li.appendChild(price);

      li.addEventListener('click', ()=>tryBuyFromFlow(idx));
    }else{
      slot.innerHTML = `<div style="opacity:.6">Empty</div>`;
      li.appendChild(slot);

      const price = document.createElement('div');
      price.className = 'price-label';
      price.innerHTML = `${gemSVG}<span>${COSTS[idx]} to buy</span>`;
      li.appendChild(price);
    }

    flowRow.appendChild(li);
  });
}

function tryBuyFromFlow(idx){
  const card = state.flow[idx];
  if(!card) return;
  const cost = COSTS[idx];
  if(state.player.aether < cost){ toast('Not enough Aether'); return; }

  setAether('player', state.player.aether - cost);
  spotlightFlowCard(idx);

  // move to discard
  state.player.discard.push(card);
  state.flow[idx] = null;
  renderFlow();
}

function spotlightFlowCard(idx){
  const flowCard = $(`.flow-card[data-idx="${idx}"] .card`);
  if(!flowCard) return;
  const rect = flowCard.getBoundingClientRect();

  let spot = $('.spotlight');
  if(!spot){
    spot = document.createElement('div');
    spot.className = 'spotlight';
    document.body.appendChild(spot);
  }
  spot.style.setProperty('--cx', `${rect.left + rect.width/2}px`);
  spot.style.setProperty('--cy', `${rect.top + rect.height/2}px`);
  spot.classList.remove('show'); void spot.offsetWidth; spot.classList.add('show');
}

///////////////////////
// Hand, draw, discard
///////////////////////
function clearHand(){
  handEl.innerHTML = '';
}

function layoutHand(){
  const cards = $$('.hand .card');
  const n = cards.length;
  const spread = Math.min(18, 6 + n*1.2); // nice fan
  const base = -spread/2;
  cards.forEach((c, i)=>{
    const rot = base + (spread/(n-1||1))*i;
    c.style.setProperty('--rot', rot.toFixed(2)+'deg');
    c.style.setProperty('--tx', `${(i - (n-1)/2) * (Math.min(38, 420/n))}px`);
    c.style.setProperty('--ty', `${Math.abs(rot)*-0.6}px`);
  });
}

function draw(player='player', count=1, withAnim=true){
  const p = state[player];
  for(let i=0;i<count;i++){
    if(p.deck.length===0){ // reshuffle
      p.deck = shuffle(p.discard.splice(0));
    }
    const card = p.deck.pop();
    p.hand.push(card);

    if(player==='player'){
      const el = makeCardEl(card, {inHand:true});
      handEl.appendChild(el);

      if(withAnim){
        // spawn from top deck area visually
        const deckTop = $('#ai-slots') || document.body;
        const rDeck = deckTop.getBoundingClientRect();
        const rCard = el.getBoundingClientRect();
        el.style.setProperty('--sx', `${rDeck.left - rCard.left}px`);
        el.style.setProperty('--sy', `${rDeck.top - rCard.top}px`);
        el.classList.add('anim-draw');
        setTimeout(()=>el.classList.remove('anim-draw'), 450);
      }
    }
  }
  layoutHand();
}

function discardHand(player='player', withAnim=true){
  const p = state[player];
  const cards = [...p.hand];
  p.discard.push(...cards);
  p.hand.length = 0;

  if(player==='player'){
    const els = $$('.hand .card');
    els.forEach((el, i)=>{
      if(withAnim){ el.classList.add('anim-discard'); }
      setTimeout(()=>el.remove(), withAnim? 360: 0);
    });
  }
}

///////////////////////
// Drag & drop
///////////////////////
let dragging = null;

function onDragStart(e){
  dragging = e.currentTarget;
  dragging.classList.add('dragging');
  enableDropTargets(dragging.dataset.type);
}

function onDragEnd(){
  disableDropTargets();
  if(dragging){ dragging.classList.remove('dragging'); dragging = null; }
}

function enableDropTargets(type){
  // player slots
  $$('.slot').forEach(s=>{
    const isGlyph = s.textContent.toLowerCase().includes('glyph slot');
    const isSpell = s.textContent.toLowerCase().includes('spell slot');
    const accept = (type==='GLYPH' && isGlyph) || (type==='SPELL' && isSpell);
    if(accept){ s.classList.add('accept','pulse') }

    s.ondragover = (ev)=>{ if(accept){ ev.preventDefault(); } };
    s.ondrop = (ev)=>{
      if(!accept || !dragging) return;
      ev.preventDefault();
      // Place card visually inside the slot (full card render)
      s.innerHTML = '';
      const cardName = dragging.dataset.name;
      const card = state.player.hand.find(c=>c.name===cardName);
      if(!card) return;

      // remove from hand state & DOM
      state.player.hand = state.player.hand.filter(c=>c!==card);
      dragging.remove();
      layoutHand();

      // show card
      const placed = makeCardEl(card, {inHand:false});
      s.appendChild(placed);
      toast(`Played ${card.name}`);
    };
  });

  // discard (right HUD, bottom-most square)
  const bins = $$('.hud .hud-btn');
  const bin = bins[bins.length-1];
  if(bin){
    bin.classList.add('accept','pulse');
    bin.ondragover = ev=>ev.preventDefault();
    bin.ondrop = ev=>{
      ev.preventDefault();
      if(!dragging) return;
      const cardName = dragging.dataset.name;
      const card = state.player.hand.find(c=>c.name===cardName);
      if(!card) return;

      // Gain aether equal to aetherValue
      const gain = card.aetherValue||0;
      if(gain>0){ setAether('player', state.player.aether + gain); }

      state.player.discard.push(card);
      state.player.hand = state.player.hand.filter(c=>c!==card);
      dragging.remove();
      layoutHand();
      toast(`Discarded ${card.name}${gain?` (+${gain} Aether)`:''}`);
    };
  }
}

function disableDropTargets(){
  $$('.slot').forEach(s=>{
    s.classList.remove('accept','pulse');
    s.ondragover = null;
    s.ondrop = null;
  });
  const bins = $$('.hud .hud-btn');
  const bin = bins[bins.length-1];
  if(bin){
    bin.classList.remove('accept','pulse');
    bin.ondragover = null; bin.ondrop = null;
  }
}

///////////////////////
// Peek (press & hold)
///////////////////////
function enablePeek(cardEl){
  let t;
  const show = ()=>{
    let peek = $('#peek-card');
    if(!peek){
      peek = document.createElement('div');
      peek.id = 'peek-card';
      peek.className = 'card peek';
      $('#preview-layer')?.appendChild(peek) || document.body.appendChild(Object.assign(document.createElement('div'),{id:'preview-layer'})).appendChild(peek);
    }
    peek.innerHTML = cardEl.innerHTML;
    $('#peek-card').classList.add('show');
  };
  const hide = ()=>$('#peek-card')?.classList.remove('show');

  cardEl.addEventListener('pointerdown', ()=>{ t=setTimeout(show, 320); });
  ['pointerup','pointerleave','dragstart'].forEach(ev=>cardEl.addEventListener(ev,()=>{clearTimeout(t); hide();}));
}

///////////////////////
// Turn flow
///////////////////////
function startTurn(){
  refillFlowStartOfTurn();
  draw('player', 5, true);
}

function endTurn(){
  // discard hand with animation
  discardHand('player', true);
  // river advances
  advanceFlowEndOfTurn();
  // opponent fake action …
  setTimeout(()=>{
    // back to player
    startTurn();
  }, 550);
}

///////////////////////
// Toast
///////////////////////
let toastT=null;
function toast(msg){
  let t = $('.toast');
  if(!t){ t=document.createElement('div');t.className='toast';document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>t.classList.remove('show'), 1300);
}

///////////////////////
// Init
///////////////////////
function mountHUD(){
  // simple three buttons (end turn / deck / discard)
  const hud = $('.hud');
  if(!hud) return;
  hud.innerHTML = `
    <button class="hud-btn" id="btn-end">End Turn</button>
    <button class="hud-btn" id="btn-deck">D</button>
    <button class="hud-btn" id="btn-bin">🗂</button>
  `;
  $('#btn-end').onclick = endTurn;
}

function boot(){
  // state decks
  state.player.deck = shuffle(STARTING_DECK.slice());
  state.ai.deck = shuffle(STARTING_DECK.slice());

  renderPortraitBars();
  mountHUD();
  renderFlow();
  startTurn();
}

document.addEventListener('DOMContentLoaded', boot);
