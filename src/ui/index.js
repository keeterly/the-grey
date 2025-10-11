import { initState, serializePublic, MAX_SLOTS } from "../engine/GameLogic.js";

const startBtn = document.getElementById("btn-start-turn");
const endBtn   = document.getElementById("btn-end-turn");
const flowRowEl = document.getElementById("flow-row");
const slotsEl   = document.getElementById("slots");
const handEl    = document.getElementById("hand");
const turnIndicator = document.getElementById("turn-indicator");
const aetherReadout = document.getElementById("aether-readout");

let state = initState({});

// ---------- Hand fan helpers ----------
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function layoutHand(container, cards) {
  const N = cards.length;
  if (!N) return;

  // Tunables
  const MAX_ANGLE = 28;          // total degrees arc for large hands
  const MIN_ANGLE = 8;           // for small hands
  const MAX_SPREAD_PX = 800;     // max horizontal spread
  const LIFT_BASE = 48;          // downward arc sag
  // const RADIUS = 520;          // (kept for future perspective tricks)

  const totalAngle = (N === 1)
    ? 0
    : clamp(MIN_ANGLE + (N - 2) * 3.2, MIN_ANGLE, MAX_ANGLE);
  const step = (N === 1) ? 0 : totalAngle / (N - 1);
  const startAngle = -totalAngle / 2;

  const rect = container.getBoundingClientRect();
  const spread = Math.min(MAX_SPREAD_PX, rect.width * 0.92);
  const stepX = (N === 1) ? 0 : spread / (N - 1);
  const startX = -spread / 2;

  cards.forEach((el, i) => {
    const a = startAngle + step * i;       // degrees
    const rad = (a * Math.PI) / 180;
    const x = startX + stepX * i;          // px
    const y = LIFT_BASE - Math.cos(rad) * (LIFT_BASE * 0.75);

    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400 + i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

// ---------- Render ----------
function render(){
  const snap = serializePublic(state);

  turnIndicator.textContent = `Turn ${snap.turn} — ${snap.activePlayer}`;
  aetherReadout.textContent = `Æ ${snap.player.aether}  ◇ ${snap.player.channeled}`;

  // portraits
  document.getElementById("p1").src = snap.player.weaver.portrait || "";
  document.getElementById("p2").src = snap.ai.weaver.portrait || "";
  document.getElementById("p1-name").textContent = snap.player.weaver.name;
  document.getElementById("p2-name").textContent = snap.ai.weaver.name;

  // flow row
  flowRowEl.replaceChildren();
  snap.flow.forEach((c,i)=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    li.innerHTML = `
      <div class="ttl">${c.name} <span class="typ">(${c.type})</span></div>
      <div class="price">Price: Æ ${c.price}</div>
    `;
    flowRowEl.appendChild(li);
    // nice little fade-in
    li.style.opacity='0'; li.style.transform='translateY(8px)';
    requestAnimationFrame(()=>{
      li.style.transition='.2s';
      li.style.opacity='1'; li.style.transform='translateY(0)';
    });
  });

  // slots
  slotsEl.replaceChildren();
  for (let i=0;i<MAX_SLOTS;i++){
    const d = document.createElement("div");
    d.className = "slot";
    d.textContent = "Empty Slot";
    if (snap.player.slots[i]?.hasCard) d.classList.add("has-card");
    slotsEl.appendChild(d);
  }

  // hand
  handEl.replaceChildren();
  const cardEls = [];
  snap.player.hand.forEach((c)=>{
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
    handEl.appendChild(el);
    cardEls.push(el);
  });
  layoutHand(handEl, cardEls);
}

// basic wire-up (keeps your existing flow)
startBtn.addEventListener("click", render);
endBtn.addEventListener("click", render);
window.addEventListener("resize", ()=> {
  // re-layout the hand on resize
  layoutHand(handEl, Array.from(handEl.children));
});

render();
