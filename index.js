import { initState, serializePublic, playCardToSpellSlot } from "./GameLogic.js";

const startBtn       = document.getElementById("btn-start-turn");
const endBtn         = document.getElementById("btn-end-turn");
const aiSlotsEl      = document.getElementById("ai-slots");
const playerSlotsEl  = document.getElementById("player-slots");
const flowRowEl      = document.getElementById("flow-row");
const handEl         = document.getElementById("hand");
const turnIndicator  = document.getElementById("turn-indicator");
const aetherReadout  = document.getElementById("aether-readout");

let state = initState({});

/* ---------- Hand fanning ---------- */
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

/* ---------- Slots ---------- */
function renderSlots(container, slotSnapshot, isPlayer){
  container.replaceChildren();

  // 3 Spell bays (card-shaped)
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const has = slotSnapshot?.[i]?.hasCard;
    d.textContent = has ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (has) d.classList.add("has-card");

    if (isPlayer){
      // drag target wiring
      d.addEventListener("dragover", (ev)=> {
        ev.preventDefault(); d.classList.add("drag-over");
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault();
        d.classList.remove("drag-over");
        const cardId = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId) return;
        if (cardType !== "SPELL") return; // only spells go to spell slots
        try{
          playCardToSpellSlot(state, "player", cardId, i);
          render(); // re-render after mutation
        }catch(e){ console.warn(e?.message || e); }
      });
    }

    container.appendChild(d);
  }

  // 1 Glyph bay (circular; visual only for now)
  const g = document.createElement("div");
  g.className = "slot glyph";
  g.textContent = "Glyph Slot";
  container.appendChild(g);
}

/* ---------- Flow row (5 columns) ---------- */
function renderFlow(nextFlow){
  flowRowEl.replaceChildren();
  nextFlow.slice(0,5).forEach(c=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    li.innerHTML = `<div class="ttl">${c.name} <span class="typ">(${c.type})</span></div>
                    <div class="price">Price: Æ ${c.price}</div>`;
    flowRowEl.appendChild(li);
  });
}

/* ---------- Main render ---------- */
function render(){
  const s = serializePublic(state);

  turnIndicator.textContent = `Turn ${s.turn} — ${s.activePlayer}`;
  aetherReadout.textContent = `Æ ${s.player.aether}  ◇ ${s.player.channeled}`;

  document.getElementById("player-portrait").src = s.player.weaver.portrait || "";
  document.getElementById("ai-portrait").src     = s.ai.weaver.portrait || "";
  document.getElementById("player-name").textContent = s.player.weaver.name;
  document.getElementById("ai-name").textContent     = s.ai.weaver.name;

  renderSlots(playerSlotsEl, s.player.slots, true);
  renderSlots(aiSlotsEl, s.ai.slots, false);
  renderFlow(s.flow);

  // Hand
  handEl.replaceChildren();
  const els = [];
  s.player.hand.forEach(c=>{
    const el = document.createElement("article");
    el.className = "card"; el.tabIndex = 0; el.draggable = true;
    el.dataset.cardId = c.id;
    el.dataset.cardType = c.type;

    el.innerHTML = `<div class="title" style="padding:10px 10px 0 10px; font-weight:600;">${c.name}</div>
                    <div class="type" style="opacity:.75; padding:0 10px 6px 10px; font-size:.9rem">${c.type}</div>
                    <div class="textbox" style="flex:1"></div>
                    <div class="actions" style="display:flex; gap:8px; padding:10px">
                      <button class="btn">Play</button>
                      <button class="btn">Discard for Æ ${c.aetherValue ?? 0}</button>
                    </div>`;

    // drag source
    el.addEventListener("dragstart", (ev)=>{
      el.classList.add("dragging");
      ev.dataTransfer?.setData("text/card-id", c.id);
      ev.dataTransfer?.setData("text/card-type", c.type);
      ev.dataTransfer?.setDragImage(el, el.clientWidth/2, el.clientHeight*0.9);
    });
    el.addEventListener("dragend", ()=> el.classList.remove("dragging"));

    handEl.appendChild(el); els.push(el);
  });
  layoutHand(handEl, els);
}

/* Wire-up */
startBtn.addEventListener("click", render);
endBtn.addEventListener("click", render);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl.children)));
document.addEventListener("DOMContentLoaded", render);
