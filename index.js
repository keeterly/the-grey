// v2.55 UI glue — fanned hand, long-press peek, drag to slots, flow spotlight + buy animation.
const template = document.getElementById('cardTemplate');
const handEl = document.getElementById('hand');
const ribbonEl = document.getElementById('flowRibbon');
const endTurnBtn = document.getElementById('endTurn');
const deckCountEl = document.getElementById('deckCount');
const discardCountEl = document.getElementById('discardCount');

const wait = (ms)=> new Promise(r=>setTimeout(r,ms));
function makeCardEl(card){
  const el = template.content.firstElementChild.cloneNode(true);
  el.querySelector('.card__title').textContent = card.name;
  el.querySelector('.card__type').textContent = card.type;
  el.querySelector('.card__rules').textContent = card.text;
  el.querySelector('.pip-count').textContent = (card.cost || card.pip || 1);
  return el;
}

// Flow
function renderFlow(){
  const {flow,flowCosts} = Game.state();
  ribbonEl.innerHTML = '';
  flow.slice(0,5).forEach((c,i)=>{
    const a = document.createElement('article');
    a.className = 'flow-card';
    a.innerHTML = `
      <header class="card__head">
        <div class="card__title">${c.name}</div>
        <div class="card__type">${c.type}</div>
      </header>
      <div class="card__rules">${c.text}</div>
      <div class="pip"></div><div class="pip-count">${flowCosts[i] || (c.cost||c.pip||1)}</div>
    `;
    a.addEventListener('click', async ()=>{
      a.classList.add('spotlight');
      await wait(120);
      const ghost = a.cloneNode(true);
      const rect = a.getBoundingClientRect();
      ghost.style.position='fixed';
      ghost.style.left = rect.left+'px';
      ghost.style.top = rect.top+'px';
      ghost.style.zIndex = 999;
      ghost.style.transform = 'translateY(-6px)';
      document.body.appendChild(ghost);
      const hud = document.querySelector('.hud__panel').getBoundingClientRect();
      await wait(40);
      ghost.style.transition='transform .35s ease, opacity .35s ease';
      ghost.style.transform = `translate(${hud.left-rect.left}px, ${hud.top-rect.top}px) scale(.4)`;
      ghost.style.opacity = .35;
      Game.buyFromFlow(i);
      updateHud();
      await wait(360);
      ghost.remove();
      a.classList.remove('spotlight');
    });
    ribbonEl.appendChild(a);
  });
}

// Hand
function layoutHand(){
  const cards = Array.from(handEl.children);
  const total = cards.length;
  const spread = Math.min(20, total * 7);
  cards.forEach((el,idx)=>{
    const t = idx/(total-1 || 1);
    const angle = (t-.5) * spread * 0.5;
    const x = (t-.5) * (total*18);
    const y = Math.abs(t-.5) * 34;
    el.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
    el.style.zIndex = 10+idx;
  });
}

let peekTimer=null;
function wireCardInteractions(el, index){
  el.addEventListener('mousedown', ()=>{
    peekTimer = setTimeout(()=>{ el.classList.add('is-peeking'); }, 280);
  });
  el.addEventListener('mouseup', ()=>{
    clearTimeout(peekTimer);
    if(el.classList.contains('is-peeking')){
      el.classList.remove('is-peeking');
    }else{
      const free = document.querySelector('.slot[data-slot="spell"]:not(.filled)');
      if(free) animatePlayToSlot(el, free, index);
    }
  });
  el.addEventListener('dragstart', e=>{
    el.classList.add('dragging');
    document.querySelectorAll('.slot').forEach(s=> s.classList.add('drop-ready'));
  });
  el.addEventListener('dragend', e=>{
    el.classList.remove('dragging');
    document.querySelectorAll('.slot').forEach(s=> s.classList.remove('drop-ready'));
  });
}

async function animatePlayToSlot(cardEl, slotEl, handIndex){
  const rect = cardEl.getBoundingClientRect();
  const target = slotEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.style.position='fixed';
  ghost.style.left = rect.left+'px';
  ghost.style.top = rect.top+'px';
  ghost.style.transform = 'translateY(-8px)';
  ghost.style.zIndex = 1000;
  document.body.appendChild(ghost);
  await wait(16);
  ghost.style.transition='transform .35s ease';
  ghost.style.transform = `translate(${target.left-rect.left}px, ${target.top-rect.top}px) scale(.68)`;
  await wait(360);
  ghost.remove();
  slotEl.classList.add('ready','filled');
  Game.playFromHand(handIndex);
  renderHand();
  updateHud();
}

function renderHand(){
  const {hand} = Game.state();
  handEl.innerHTML = '';
  hand.forEach((c, i)=>{
    const el = makeCardEl(c);
    el.classList.add('fan-enter');
    handEl.appendChild(el);
    wireCardInteractions(el, i);
  });
  layoutHand();
}

function updateHud(){
  const {deck, discard} = Game.state();
  deckCountEl.textContent = String(100 + deck.length);
  discardCountEl.textContent = String(discard.length);
}

// Turn
endTurnBtn.addEventListener('click', async ()=>{
  ribbonEl.style.transition = 'transform .15s ease';
  ribbonEl.style.transform = 'translateY(2px)';
  await wait(150);
  ribbonEl.style.transform = 'translateY(0)';
  Game.draw(1);
  renderHand();
  updateHud();
});

// boot
Game.init();
renderFlow();
renderHand();
updateHud();
window.addEventListener('resize', layoutHand);
