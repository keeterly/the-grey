import { initState, reducer, serializePublic, MAX_SLOTS } from "../engine/GameLogic.js";

const startBtn = document.getElementById("btn-start-turn");
const endBtn = document.getElementById("btn-end-turn");
const turnIndicator = document.getElementById("turn-indicator");
const aetherReadout = document.getElementById("aether-readout");
const flowRowEl = document.getElementById("flow-row");
const slotsEl = document.getElementById("slots");
const handEl = document.getElementById("hand");

let state = initState({ seed: 99 });

function doAction(action){
  try{
    state = reducer(state, action);
    render();
  }catch(e){
    console.warn(e);
    alert(e.message || String(e));
  }
}

function cardNode(card, actions=[]){
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = card.id;
  el.innerHTML = `<div class="title">${card.name}</div>
  <div class="type">${card.type}</div>
  <div class="textbox">Aether Value: ${card.aetherValue||0}</div>
  <div class="actions"></div>`;
  const a = el.querySelector(".actions");
  actions.forEach(({label, onClick})=>{
    const b = document.createElement("button"); b.className="btn"; b.textContent=label; b.onclick=onClick; a.appendChild(b);
  });
  return el;
}

function render(){
  const snap = serializePublic(state);
  turnIndicator.textContent = `Turn ${snap.turn} — ${snap.activePlayer}`;
  aetherReadout.textContent = `${snap.player.aether} / ${snap.player.channeled}`;

  flowRowEl.replaceChildren();
  snap.flow.forEach((c,i)=>{
    const li = document.createElement("li"); li.className="flow-card";
    li.innerHTML = `<div>${c.name} <small>(${c.type})</small></div><div>Price: Æ ${c.price}</div>`;
    const b = document.createElement("button"); b.className="btn"; b.textContent="Buy";
    b.onclick = ()=> doAction({ type:'BUY_FROM_FLOW', player:'player', flowIndex:i });
    li.appendChild(b); flowRowEl.appendChild(li);
  });

  slotsEl.replaceChildren();
  for (let i=0;i<MAX_SLOTS;i++){
    const s = snap.player.slots[i];
    const slot = document.createElement("div"); slot.className="slot";
    if (s.hasCard && s.card){
      slot.innerHTML = `<div>${s.card.name} (${s.card.type}) · prog ${s.progress}</div>`;
      if (s.card.type==='SPELL'){
        const adv = document.createElement("button"); adv.className="btn"; adv.textContent="Advance";
        adv.onclick = ()=> doAction({ type:'ADVANCE_SPELL', player:'player', slotIndex:i });
        slot.appendChild(adv);
      }
    }else{
      slot.textContent = "Empty Slot";
    }
    slot.ondragover = (e)=> e.preventDefault();
    slot.ondrop = (e)=>{
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain"); const t = e.dataTransfer.getData("x-type");
      if (t==='SPELL') doAction({ type:'PLAY_CARD_TO_SLOT', player:'player', cardId:id, slotIndex:i });
      if (t==='GLYPH') doAction({ type:'SET_GLYPH', player:'player', cardId:id, slotIndex:i });
    };
    slotsEl.appendChild(slot);
  }

  handEl.replaceChildren();
  const N = snap.player.hand.length;
  snap.player.hand.forEach((c,idx)=>{
    const actions = [];
    if (c.type==='INSTANT'){
      actions.push({label:"Cast (Surge targets slot)", onClick:()=>pickSlotForInstant(c.id)});
    }
    actions.push({label:"Discard→Æ", onClick:()=>doAction({ type:'DISCARD_FOR_AETHER', player:'player', cardId:c.id })});
    const node = cardNode(c, actions);
    const angle = (idx-(N-1)/2)*5, lift=30+Math.abs(idx-(N-1)/2)*4;
    node.style.transform = `translateY(${lift}px) rotate(${angle}deg)`;
    node.draggable = true;
    node.ondragstart = (e)=>{ e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.setData("x-type", c.type); };
    handEl.appendChild(node);
  });
}

function pickSlotForInstant(cardId){
  const c = state.players.player.hand.find(x=>x.id===cardId);
  if (c && c.id !== 'c:surgeAsh'){
    doAction({ type:'CAST_INSTANT_ADVANCE_SLOT', player:'player', cardId, slotIndex: -1 });
    return;
  }
  const once = (e)=>{
    const slot = e.currentTarget;
    const idx = Array.from(slotsEl.children).indexOf(slot);
    doAction({ type:'CAST_INSTANT_ADVANCE_SLOT', player:'player', cardId, slotIndex: idx });
    cleanup();
  };
  function cleanup(){ Array.from(slotsEl.children).forEach(s=>s.removeEventListener("click", once)); }
  Array.from(slotsEl.children).forEach(s=> s.addEventListener("click", once));
  alert("Click a slot to advance by 1");
}

startBtn.addEventListener("click", ()=> doAction({ type:'START_TURN', player:'player' }));
endBtn.addEventListener("click", ()=> doAction({ type:'END_TURN', player:'player' }));

render();
