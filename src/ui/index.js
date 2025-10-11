import { initState, serializePublic } from "../engine/GameLogic.js";

const startBtn = document.getElementById("btn-start-turn");
const endBtn   = document.getElementById("btn-end-turn");

const aiSlotsEl     = document.getElementById("ai-slots");
const playerSlotsEl = document.getElementById("player-slots");
const flowRowEl     = document.getElementById("flow-row");
const handEl        = document.getElementById("hand");
const turnIndicator = document.getElementById("turn-indicator");
const aetherReadout = document.getElementById("aether-readout");

let state = initState({});
let prevFlowIds = [];

/* ---------- Hand fan ---------- */
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

/* ---------- Flow FLIP ---------- */
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
  const children = Array.from(flowRowEl.children);
  const firstRects = new Map(children.map(el => [el.dataset.id, el.getBoundingClientRect()]));
  const existing = new Map(children.map(el => [el.dataset.id, el]));
  const nextIds = nextFlow.map(c=>c.id);

  // exit
  children.filter(el => !nextIds.includes(el.dataset.id)).forEach(el=>{
    el.classList.add("flow-exit"); requestAnimationFrame(()=>el.classList.add("flow-exit-active"));
    setTimeout(()=>el.remove(), 180);
  });

  // build new order
  const frag = document.createDocumentFragment();
  const newEls = [];
  nextFlow.forEach(c=>{
    let el = existing.get(c.id);
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
}

/* ---------- Slots (3 spell + 1 glyph bay) ---------- */
function renderSlots(container, slotSnapshot){
  container.replaceChildren();

  // 3 spell bays mapped to engine slots 0..2
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot";
    d.textContent = slotSnapshot?.[i]?.hasCard ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (slotSnapshot?.[i]?.hasCard) d.classList.add("has-card");
    container.appendChild(d);
  }

  // 1 glyph bay (visual placeholder until engine wires a glyph slot)
  const glyph = document.createElement("div");
  glyph.className = "slot glyph";
  glyph.textContent = "Glyph Slot";
  container.appendChild(glyph);
}

/* ---------- Render ---------- */
function render(){
  const s = serializePublic(state);

  turnIndicator.textContent = `Turn ${s.turn} — ${s.activePlayer}`;
  aetherReadout.textContent = `Æ ${s.player.aether}  ◇ ${s.player.channeled}`;

  // portraits
  document.getElementById("ai-portrait").src = s.ai.weaver.portrait || "";
  document.getElementById("player-portrait").src = s.player.weaver.portrait || "";
  document.getElementById("ai-name").textContent = s.ai.weaver.name;
  document.getElementById("player-name").textContent = s.player.weaver.name;

  // rows
  renderSlots(aiSlotsEl, s.ai.slots);
  renderSlots(playerSlotsEl, s.player.slots);
  renderFlow(s.flow);

  // hand
  handEl.replaceChildren();
  const cardEls = [];
  s.player.hand.forEach(c=>{
    const el
