import { initState, reducer, serializePublic, MAX_SLOTS } from "../engine/GameLogic.js";

const startBtn = document.getElementById("btn-start-turn");
const endBtn = document.getElementById("btn-end-turn");
const turnIndicator = document.getElementById("turn-indicator");
const aetherReadout = document.getElementById("aether-readout");
const flowRowEl = document.getElementById("flow-row");
const slotsEl = document.getElementById("slots");
const handEl = document.getElementById("hand");
const cineRoot = document.getElementById("cinematic-root");

let state = initState({ seed: 101, playerWeaverId: 'aria', aiWeaverId: 'morr' });
let lastTrance = { player: 0, ai: 0 };

// ---- Sound hooks (WebAudio: soft whoosh + chime) ----
let audioCtx;
function playSound(stage=1){
  try{
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    // whoosh noise via filtered noise burst
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate*0.25, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * (1 - i/data.length); }
    const src = audioCtx.createBufferSource(); src.buffer = buffer;
    const filter = audioCtx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 800 + stage*400;
    src.connect(filter).connect(audioCtx.destination);
    src.start(now);

    // soft chime (sine + gain env)
    const osc = audioCtx.createOscillator(); osc.type="sine"; osc.frequency.setValueAtTime(stage===1? 660: 784, now);
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.2, now+0.02); gain.gain.exponentialRampToValueAtTime(0.0001, now+0.5);
    osc.connect(gain).connect(audioCtx.destination); osc.start(now+0.05); osc.stop(now+0.55);
  }catch(e){ console.warn("Audio error", e); }
}

// ---- Cinematic overlay with Skip button ----
function playTranceCinematic({stage, weaver, side='player'}){
  const wrap = document.createElement('div');
  wrap.className = `cine stage${stage} shake`;
  const sigil = document.createElement('div'); sigil.className='sigil';
  const burst = document.createElement('div'); burst.className='burst';
  const figure = document.createElement('div'); figure.className='char';

  const img = document.createElement('img');
  img.src = weaver.portrait || ''; img.alt = weaver.name;

  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.textContent = `${weaver.name} enters Trance ${stage}.`;

  const skip = document.createElement('button');
  skip.className = 'skip'; skip.textContent = 'Skip';
  skip.onclick = ()=> wrap.remove();

  figure.appendChild(img); figure.appendChild(caption);
  wrap.appendChild(skip);
  wrap.appendChild(sigil); wrap.appendChild(burst); wrap.appendChild(figure);

  cineRoot.appendChild(wrap);
  // play sound
  playSound(stage);
  // auto-remove after 1.6s if not skipped
  setTimeout(()=> { if (wrap.isConnected) wrap.remove(); }, 1600);
}

function checkTranceAndCinematic(){
  const p = state.players.player.weaver ? state.players.player.tranceStage || 0 : 0;
  const a = state.players.ai.weaver ? state.players.ai.tranceStage || 0 : 0;
  if (p > (lastTrance.player||0)) playTranceCinematic({ stage: p, weaver: state.players.player.weaver, side:'player' });
  if (a > (lastTrance.ai||0)) playTranceCinematic({ stage: a, weaver: state.players.ai.weaver, side:'ai' });
  lastTrance = { player: p, ai: a };
}

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

  // portraits
  document.getElementById("p1").src = snap.player.weaver.portrait || "";
  document.getElementById("p2").src = snap.ai.weaver.portrait || "";
  document.getElementById("p1-name").textContent = snap.player.weaver.name;
  document.getElementById("p2-name").textContent = snap.ai.weaver.name;

  // Flow
  flowRowEl.replaceChildren();
  snap.flow.forEach((c,i)=>{
    const li = document.createElement("li"); li.className="flow-card";
    li.innerHTML = `<div>${c.name} <small>(${c.type})</small></div><div>Price: Æ ${c.price}</div>`;
    const b = document.createElement("button"); b.className="btn"; b.textContent="Buy";
    b.onclick = ()=> doAction({ type:'BUY_FROM_FLOW', player:'player', flowIndex:i });
    li.appendChild(b); flowRowEl.appendChild(li);
  });

  // Slots
  slotsEl.replaceChildren();
  for (let i=0;i<MAX_SLOTS;i++){
    const s = snap.player.slots[i];
    const slot = document.createElement("div"); slot.className="slot";
    if (s.hasCard && s.card){
      slot.classList.add("has-card");
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

  // Hand
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

  checkTranceAndCinematic();
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
