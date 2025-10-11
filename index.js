// Path fix: import from root, not /src/...
import { initState, serializePublic } from "./GameLogic.js";

const startBtn       = document.getElementById("btn-start-turn");
const endBtn         = document.getElementById("btn-end-turn");
const aiSlotsEl      = document.getElementById("ai-slots");
const playerSlotsEl  = document.getElementById("player-slots");
const flowRowEl      = document.getElementById("flow-row");
const handEl         = document.getElementById("hand");
const turnIndicator  = document.getElementById("turn-indicator");
const aetherReadout  = document.getElementById("aether-readout");

let state;

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

function renderSlots(container, slotSnapshot){
  container.replaceChildren();
  // 3 Spell bays (bind to engine slots 0..2)
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot";
    const has = slotSnapshot?.[i]?.hasCard;
    d.textContent = has ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (has) d.classList.add("has-card");
    container.appendChild(d);
  }
  // 1 Glyph bay (visual for now)
  const g = document.createElement("div");
  g.className = "slot glyph";
  g.textContent = "Glyph Slot";
  container.appendChild(g);
}

function renderFlow(flow){
  flowRowEl.replaceChildren();
  const list = (Array.isArray(flow) && flow.length) ? flow : [
    // fallback placeholders if engine misfires
    {id:"p1", name:"—", type:"INSTANT", price:4},
    {id:"p2", name:"—", type:"SPELL",   price:3},
    {id:"p3", name:"—", type:"GLYPH",   price:2},
    {id:"p4", name:"—", type:"SPELL",   price:2},
    {id:"p5", name:"—", type:"INSTANT", price:2},
  ];
  list.slice(0,5).forEach(c=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    li.innerHTML = `<div class="ttl">${c.name} <span class="typ">(${c.type})</span></div>
                    <div class="price">Price: Æ ${c.price}</div>`;
    flowRowEl.appendChild(li);
  });
}

function render(){
  const s = serializePublic(state);

  turnIndicator.textContent = `Turn ${s.turn} — ${s.activePlayer}`;
  aetherReadout.textContent = `Æ ${s.player.aether}  ◇ ${s.player.channeled}`;

  document.getElementById("player-portrait").src = s.player.weaver.portrait || "";
  document.getElementById("ai-portrait").src     = s.ai.weaver.portrait || "";
  document.getElementById("player-name").textContent = s.player.weaver.name;
  document.getElementById("ai-name").textContent     = s.ai.weaver.name;

  renderSlots(playerSlotsEl, s.player.slots);
  renderSlots(aiSlotsEl, s.ai.slots);
  renderFlow(s.flow);

  // Hand
  handEl.replaceChildren();
  const cardEls = [];
  s.player.hand.forEach(c=>{
    const el = document.createElement("article");
    el.className = "card"; el.tabIndex = 0;
    el.innerHTML = `<div class="title">${c.name}</div>
                    <div class="type">${c.type}</div>
                    <div class="textbox"></div>
                    <div class="actions">
                      <button class="btn">Play</button>
                      <button class="btn">Discard for Æ ${c.aetherValue ?? 0}</button>
                    </div>`;
    handEl.appendChild(el); cardEls.push(el);
  });
  layoutHand(handEl, cardEls);
}

function boot(){
  try{
    state = initState({});
    render();
  }catch(e){
    console.error("[UI] boot error:", e);
    // Visual hint in case of import path issues
    const hint = document.createElement("div");
    hint.style.position="fixed";hint.style.top="56px";hint.style.left="16px";
    hint.style.padding="8px 12px";hint.style.background="#5a2";hint.style.color="#fff";
    hint.style.zIndex="99999";hint.textContent="Boot error (open console)";
    document.body.appendChild(hint);
  }
}

startBtn.addEventListener("click", render);
endBtn.addEventListener("click", render);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl.children)));
document.addEventListener("DOMContentLoaded", boot);
