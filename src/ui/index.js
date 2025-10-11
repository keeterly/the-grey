import { initState, serializePublic, MAX_SLOTS } from "../engine/GameLogic.js";

const startBtn = document.getElementById("btn-start-turn");
const endBtn   = document.getElementById("btn-end-turn");

const aiSlotsEl     = document.getElementById("ai-slots");
const playerSlotsEl = document.getElementById("player-slots");

const flowRowEl = document.getElementById("flow-row");
const handEl    = document.getElementById("hand");

const turnIndicator = document.getElementById("turn-indicator");
const aetherReadout = document.getElementById("aether-readout");

let state = initState({});
let prevFlowIds = [];

/* ---------------- Hand fanning ---------------- */
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function layoutHand(container, cards) {
  const N = cards.length; if (!N) return;
  const MAX_ANGLE = 28, MIN_ANGLE = 8, MAX_SPREAD_PX = 800, LIFT_BASE = 48;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*3.2, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const rect = container.getBoundingClientRect();
  const spread = Math.min(MAX_SPREAD_PX, rect.width*0.92);
  const stepX = (N===1) ? 0 : spread/(N-1), startX = -spread/2;

  cards.forEach((el,i)=>{
    const a = startAngle + step*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    const y = LIFT_BASE - Math.cos(rad) * (LIFT_BASE*0.75);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ---------------- Flow (river) FLIP animation ---------------- */
function buildFlowEl(card){
  const li = document.createElement("li");
  li.className = "flow-card";
  li.dataset.id = card.id;
  li.innerHTML = `
    <div class="ttl">${card.name} <span class="typ">(${card.type})</span></div>
    <div class="price">Price: Æ ${card.price}</div>
  `;
  return li;
}
function renderFlow(nextFlow){
  const currentChildren = Array.from(flowRowEl.children);
  const firstRects = new Map(currentChildren.map(el => [el.dataset.id, el.getBoundingClientRect()]));
  const existingById = new Map(currentChildren.map(el => [el.dataset.id, el]));
  const nextIds = nextFlow.map(c => c.id);

  // exiting
  currentChildren.filter(el => !nextIds.includes(el.dataset.id)).forEach(el=>{
    el.classList.add("flow-exit"); requestAnimationFrame(()=>el.classList.add("flow-exit-active"));
    setTimeout(()=>el.remove(), 180);
  });

  // rebuild in new order (reuse nodes)
  const frag = document.createDocumentFragment();
  const newEls = [];
  nextFlow.forEach(c=>{
    let el = existingById.get(c.id);
    if (!el) { el = buildFlowEl(c); el.classList.add("flow-enter"); requestAnimationFrame(()=>el.classList.add("flow-enter-active")); }
    else { el.querySelector(".price").textContent = `Price: Æ ${c.price}`; }
    frag.appendChild(el); newEls.push(el);
  });
  flowRowEl.replaceChildren(frag);

  // FLIP
  newEls.forEach(el=>{
    const first = firstRects.get(el.dataset.id); if (!first) return;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left; const dy = first.top - last.top;
    if (dx || dy){
      el.style.transform = `translate(${dx}px, ${dy}px)`; el.style.transition = "none";
      requestAnimationFrame(()=>{ el.style.transition = "transform .22s ease"; el.style.transform = "translate(0,0)"; });
    }
  });

  prevFlowIds = nextIds;
}

/* ---------------- Slots (3 spell + 1 glyph) ---------------- */
function renderSlots(container, slotSnapshot/* array from engine */, isGlyphRight=true){
  container.replaceChildren();
  // 3 spell bays (bind to engine 0..2)
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot";
    d.textContent = slotSnapshot?.[i]?.hasCard ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (slotSnapshot?.[i]?.hasCard) d.classList.add("has-card");
    container.appendChild(d);
  }
  // 1 glyph bay (visual only unless engine wires a 4th)
  const g = document.createElement("div");
  g.className = "slot glyph";
  g.textContent = "Glyph Slot";
  container.appendChild(g);
}

/* ---------------- Render ---------------- */
function render(){
  const snap = serializePublic(state);

  turnIndicator.textContent = `Turn ${snap.turn} — ${snap.activePlayer}`;
  aetherReadout.textContent = `Æ ${snap.player.aether}  ◇ ${snap.player.channeled}`;

  // portraits
  document.getElementById("player-portrait").src = snap.player.weaver.portrait || "";
  document.getElementById("ai-portrait").src = snap.ai.weaver.portrait || "";
  document.getElementById("player-name").textContent = snap.player.weaver.name;
  document.getElementById("ai-name").textContent = snap.ai.weaver.name;

  // sides
  renderSlots(playerSlotsEl, snap.player.slots);
  renderSlots(aiSlotsEl, snap.ai.slots);

  // flow
  renderFlow(snap.flow);

  // hand
  handEl.replaceChildren();
  const cardEls = [];
  snap.player.hand.forEach(c=>{
    const el = document.createElement("article");
    el.className = "card";
    el.tabIndex = 0;
    el.innerHTML = `
      <div class="title">${c.name}</div>
      <div class="type">${c.type}</div>
      <div class="textbox"></div>
      <div class="actions">
        <button class="btn">Play</button>
        <button class="btn">Discard for Æ ${c.aetherValue ?? 0}</button>
      </div>
    `;
    handEl.appendChild(el); cardEls.push(el);
  });
  layoutHand(handEl, cardEls);
}

/* Wire-up */
startBtn.addEventListener("click", render);
endBtn.addEventListener("click", render);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl.children)));

render();
