import { initState, serializePublic, reducer } from "./GameLogic.js";

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

let state = initState({}); // same seed as before if you want determinism

/* ---------- Small toast for errors ---------- */
let toastEl;
function toast(msg, ms=1200){
  if (!toastEl){
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), ms);
}

/* ---------- Hand fanning (responsive) ---------- */
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function layoutHand(container, cards) {
  const N = cards.length; if (!N) return;
  const MAX_ANGLE = 26, MIN_ANGLE = 6, MAX_SPREAD_PX = container.clientWidth * 0.92, LIFT_BASE = 42;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*3.1, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const spread = Math.min(MAX_SPREAD_PX, 900);
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

  // 3 rectangular Spell bays
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const has = slotSnapshot?.[i]?.hasCard;
    d.textContent = has ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (has) d.classList.add("has-card");

    if (isPlayer){
      d.addEventListener("dragover", (ev)=> { ev.preventDefault(); d.classList.add("drag-over"); });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const cardId = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL") return;
        playSpellIfPossible(cardId, i);
      });
    }
    container.appendChild(d);
  }

  // 1 rectangular Glyph bay (accepts GLYPH only – engine hook later)
  const g = document.createElement("div");
  g.className = "slot glyph";
  g.textContent = "Glyph Slot";
  if (isPlayer){
    g.addEventListener("dragover", (ev)=> {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", ()=> { g.classList.remove("drag-over"); toast("Set Glyph: not implemented yet"); });
  }
  container.appendChild(g);
}

/* ---------- Flow row (full-size market cards) ---------- */
function cardHTML(c){
  return `<div class="title">${c.name}</div>
          <div class="type">${c.type}</div>
          <div class="textbox"></div>
          <div class="actions"><button class="btn" data-buy="1" data-id="${c.id}">Buy (Æ ${c.price ?? 0})</button></div>`;
}
function renderFlow(nextFlow){
  flowRowEl.replaceChildren();
  nextFlow.slice(0,5).forEach(c=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    // shim price so UI can show cost consistently with GameLogic FLOW_COSTS
    card.dataset.flowIndex = String(nextFlow.indexOf(c));
    card.innerHTML = cardHTML(c);
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });

  // Buy buttons
  flowRowEl.querySelectorAll("[data-buy]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const el = e.currentTarget;
      const parentCard = el.closest(".card");
      const idx = [...flowRowEl.querySelectorAll(".card")].indexOf(parentCard);
      try{
        state = reducer(state, { type:'BUY_FROM_FLOW', player:'player', flowIndex: idx });
        render();
      }catch(err){ toast(err?.message || "Cannot buy"); }
    });
  });
}

/* ---------- Preview / Zoom helpers ---------- */
function closeZoom(){ zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}</div>
    <div class="textbox"></div>
    <div class="actions" style="opacity:.6"><span>Preview</span></div>
  `;
}
let longPressTimer = null;
let pressStart = {x:0, y:0};
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;

function attachPeekAndZoom(el, data){
  // Hover peek (desktop)
  el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
  el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });

  // Long-press for zoom
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    pressStart = { x: ev.clientX ?? (ev.touches?.[0]?.clientX ?? 0),
                   y: ev.clientY ?? (ev.touches?.[0]?.clientY ?? 0) };
    longPressTimer = setTimeout(()=>{
      fillCardShell(zoomCardEl, data);
      zoomOverlayEl.setAttribute("data-open","true");
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=> { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  const onMove = (ev)=>{
    const x = ev.clientX ?? (ev.touches?.[0]?.clientX ?? 0);
    const y = ev.clientY ?? (ev.touches?.[0]?.clientY ?? 0);
    if (Math.hypot(x - pressStart.x, y - pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };

  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", clearLP, {passive:true});
  el.addEventListener("pointerleave", clearLP, {passive:true});
  el.addEventListener("pointercancel", clearLP, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
  el.addEventListener("dragstart", clearLP);
}

/* ---------- Mobile drag: rAF-ticked ghost (smooth & crash-safe) ---------- */
function installTouchDrag(cardEl, cardData){
  let dragging = false;
  let ghost = null;
  let start = {x:0,y:0};
  let last = {x:0,y:0};
  let tickPending = false;

  function pointer(e){ return { x: e.clientX ?? (e.touches?.[0]?.clientX ?? 0),
                                y: e.clientY ?? (e.touches?.[0]?.clientY ?? 0) }; }

  const rAFMove = ()=>{
    tickPending = false;
    if (!ghost) return;
    ghost.style.transform = `translate(${last.x - ghost.clientWidth/2}px, ${last.y - ghost.clientHeight*0.9}px)`;
  };

  const DOWN = (e)=>{
    start = last = pointer(e);
    dragging = false;
    cardEl.setPointerCapture?.(e.pointerId || 0);
  };

  const MOVE = (e)=>{
    const p = pointer(e);
    // Prevent page scroll while dragging (important on iOS).
    if (dragging) e.preventDefault();

    if (!dragging){
      if (Math.hypot(p.x - start.x, p.y - start.y) > 10){
        dragging = true;
        // cancel any long-press zoom
        if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; }

        // build ghost (use computed size once to avoid layout thrash)
        ghost = cardEl.cloneNode(true);
        ghost.classList.add("dragging");
        ghost.style.position = "fixed";
        ghost.style.left = "0"; ghost.style.top = "0";
        ghost.style.transform = `translate(${p.x - ghost.clientWidth/2}px, ${p.y - ghost.clientHeight*0.9}px)`;
        ghost.style.zIndex = "99999";
        document.body.appendChild(ghost);
      }
    }else{
      last = p;
      if (!tickPending){ tickPending = true; requestAnimationFrame(rAFMove); }

      // slot highlight
      document.querySelectorAll(".slot.drag-over").forEach(s => s.classList.remove("drag-over"));
      const el = document.elementFromPoint(p.x, p.y);
      const slot = el?.closest?.(".slot.spell");
      if (slot) slot.classList.add("drag-over");
    }
  };

  const UP = ()=>{
    document.querySelectorAll(".slot.drag-over").forEach(s => s.classList.remove("drag-over"));
    if (dragging && ghost){
      const el = document.elementFromPoint(last.x, last.y);
      const slot = el?.closest?.(".slot.spell");
      if (slot){
        const idx = Number(slot.dataset.slotIndex || 0);
        playSpellIfPossible(cardData.id, idx);
      }
      ghost.remove(); ghost=null;
      dragging=false;
    }
  };

  // NB: pointermove must be non-passive to allow preventDefault scrolling while dragging.
  cardEl.addEventListener("pointerdown", DOWN);
  window.addEventListener("pointermove", MOVE, {passive:false});
  window.addEventListener("pointerup",   UP,   {passive:true});
}

/* ---------- Actions ---------- */
function playSpellIfPossible(cardId, slotIndex){
  try{
    state = reducer(state, { type:'PLAY_CARD_TO_SLOT', player:'player', cardId, slotIndex });
    render(); // re-fan hand after successful play
  }catch(err){
    toast(err?.message || "Can't play there");
  }
}

/* ---------- Main render ---------- */
function render(){
  // Close overlays so nothing “sticks”
  closeZoom(); peekEl.classList.remove("show");

  const s = serializePublic(state);
  turnIndicator.textContent = `Turn ${s.turn} — ${s.activePlayer}`;
  aetherReadout.textContent  = `Æ ${s.player.aether}  ◇ ${s.player.channeled}`;

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
        <button class="btn" data-play="1">Play</button>
        <button class="btn" data-discard="1">Discard for Æ ${c.aetherValue ?? 0}</button>
      </div>`;

    // Desktop HTML5 drag
    el.addEventListener("dragstart", (ev)=>{
      el.classList.add("dragging");
      ev.dataTransfer?.setData("text/card-id", c.id);
      ev.dataTransfer?.setData("text/card-type", c.type);
      ev.dataTransfer?.setDragImage(el, el.clientWidth/2, el.clientHeight*0.9);
    });
    el.addEventListener("dragend", ()=> el.classList.remove("dragging"));

    // Touch drag polyfill + peek/zoom
    installTouchDrag(el, c);
    attachPeekAndZoom(el, c);

    // Buttons
    el.querySelector("[data-play]")?.addEventListener("click", ()=>{
      // default to first open spell slot
      const idx = s.player.slots.findIndex(x=>!x.hasCard && !x.isGlyph);
      if (idx < 0){ toast("No empty spell slot"); return; }
      playSpellIfPossible(c.id, idx);
    });
    el.querySelector("[data-discard]")?.addEventListener("click", ()=>{
      try{
        state = reducer(state, { type:'DISCARD_FOR_AETHER', player:'player', cardId: c.id });
        render();
      }catch(err){ toast(err?.message || "Can't discard"); }
    });

    handEl.appendChild(el); els.push(el);
  });
  layoutHand(handEl, els);
}

/* Wire-up */
startBtn.addEventListener("click", ()=>{ state = reducer(state, {type:'START_TURN', player:'player'}); render(); });
endBtn.addEventListener("click",   ()=>{ state = reducer(state, {type:'END_TURN',   player:'player'}); render(); });
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl.children)));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
zoomOverlayEl.addEventListener("click", closeZoom);
document.addEventListener("DOMContentLoaded", render);