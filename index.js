import { initState, serializePublic, playCardToSpellSlot } from "./GameLogic.js";

const startBtn       = document.getElementById("btn-start-turn");
const endBtn         = document.getElementById("btn-end-turn");
const aiSlotsEl      = document.getElementById("ai-slots");
const playerSlotsEl  = document.getElementById("player-slots");
const flowRowEl      = document.getElementById("flow-row");
const handEl         = document.getElementById("hand");
const turnIndicator  = document.getElementById("turn-indicator");
const aetherReadout  = document.getElementById("aether-readout");

const peekEl         = document.getElementById("peek-card");
const zoomOverlayEl  = document.getElementById("zoom-overlay");
const zoomCardEl     = document.getElementById("zoom-card");

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
    // smooth redistribution (transition is on .card)
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ---------- Slots ---------- */
function renderSlots(container, slotSnapshot, isPlayer){
  container.replaceChildren();

  // 3 rectangular Spell bays
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const has = slotSnapshot?.[i]?.hasCard;
    d.textContent = has ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (has) d.classList.add("has-card");

    if (isPlayer){
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
        if (cardType !== "SPELL") return; // spell slots accept only SPELL
        try{
          playCardToSpellSlot(state, "player", cardId, i);
          render(); // re-render → hand redistributes
        }catch(e){ console.warn(e?.message || e); }
      });
    }
    container.appendChild(d);
  }

  // 1 rectangular Glyph bay (accepts only GLYPH)
  if (isPlayer){
    const g = document.createElement("div");
    g.className = "slot glyph";
    g.textContent = "Glyph Slot";

    g.addEventListener("dragover", (ev)=> {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{
      ev.preventDefault(); g.classList.remove("drag-over");
      const cardType = ev.dataTransfer?.getData("text/card-type");
      if (cardType !== "GLYPH") return;
      // TODO: hook engine when glyph slot exists in state; for now just ignore gracefully
      // You can wire a playGlyphToSlot(state, "player", cardId) here later.
    });
    container.appendChild(g);
  } else {
    const g = document.createElement("div");
    g.className = "slot glyph";
    g.textContent = "Glyph Slot";
    container.appendChild(g);
  }
}

/* ---------- Flow row (full-size cards) ---------- */
function cardHTML(c){
  return `<div class="title">${c.name}</div>
          <div class="type">${c.type}</div>
          <div class="textbox"></div>
          <div class="actions"><button class="btn">Buy (Æ ${c.price ?? 0})</button></div>`;
}
function renderFlow(nextFlow){
  flowRowEl.replaceChildren();
  nextFlow.slice(0,5).forEach(c=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.innerHTML = cardHTML(c);
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ---------- Peek + Zoom ---------- */
function fillCardShell(div, data){
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}</div>
    <div class="textbox"></div>
    <div class="actions" style="opacity:.6"><span>Preview</span></div>
  `;
}
let longPressTimer = null;
function attachPeekAndZoom(el, data){
  // Hover peek (desktop)
  el.addEventListener("mouseenter", ()=>{
    fillCardShell(peekEl, data);
    peekEl.hidden = false;
    peekEl.classList.add("show");
  });
  el.addEventListener("mouseleave", ()=>{
    peekEl.classList.remove("show");
    peekEl.hidden = true;
  });

  // Press & hold for 2x zoom (mouse or touch)
  const start = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(()=>{
      fillCardShell(zoomCardEl, data);
      zoomOverlayEl.hidden = false;
    }, 350);
  };
  const cancel = ()=>{
    if (longPressTimer) clearTimeout(longPressTimer);
  };
  el.addEventListener("pointerdown", start);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("dragstart", cancel);

  // Dismiss zoom
  zoomOverlayEl.addEventListener("click", ()=> zoomOverlayEl.hidden = true);
  document.addEventListener("keydown", (e)=> { if (e.key === "Escape") zoomOverlayEl.hidden = true; });
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

    el.innerHTML = `
      <div class="title">${c.name}</div>
      <div class="type">${c.type}</div>
      <div class="textbox"></div>
      <div class="actions">
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

    // peek + zoom
    attachPeekAndZoom(el, c);

    handEl.appendChild(el); els.push(el);
  });
  layoutHand(handEl, els);
}

/* Wire-up */
startBtn.addEventListener("click", render);
endBtn.addEventListener("click", render);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl.children)));
document.addEventListener("DOMContentLoaded", render);
