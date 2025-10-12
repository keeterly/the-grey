import { initState, serializePublic, reducer } from "./GameLogic.js";

const __DEV = false; // set true to log snapshot/flow lengths in console

/* ------- safe getters (avoid null errors) ------- */
const $    = (id) => document.getElementById(id);
const set  = (el, fn) => { if (el) fn(el); };

const startBtn       = $("btn-start-turn");
const endBtn         = $("btn-end-turn");
const aiSlotsEl      = $("ai-slots");
const playerSlotsEl  = $("player-slots");
const flowRowEl      = $("flow-row");
const handEl         = $("hand");
const turnIndicator  = $("turn-indicator");
const aetherReadout  = $("aether-readout");

/* optional (may not exist in your HTML) */
const playerPortrait = $("player-portrait");
const aiPortrait     = $("ai-portrait");
const playerName     = $("player-name");
const aiName         = $("ai-name");

const peekEl         = $("peek-card");
const zoomOverlayEl  = $("zoom-overlay");
const zoomCardEl     = $("zoom-card");

let state = initState({});

/* ------- tiny toast ------- */
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

/* ------- hand fanning ------- */
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
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

/* ------- slots ------- */
function renderSlots(container, slotSnapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();

  // three rectangular spell bays
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
        const cardId   = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL") return;
        playSpellIfPossible(cardId, i);
      });
    }
    container.appendChild(d);
  }

  // one rectangular glyph bay (format matches spell)
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

/* ------- flow row ------- */
const DEFAULT_FLOW_COSTS = [4,3,2,2,2];
function cardHTML(c){
  const price = (typeof c.price === "number") ? c.price : 0;
  return `<div class="title">${c.name}</div>
          <div class="type">${c.type}</div>
          <div class="textbox"></div>
          <div class="actions"><button class="btn" data-buy="1">Buy (Æ ${price})</button></div>`;
}
function renderFlow(flowArray){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flowArray || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c);
    card.querySelector("[data-buy]")?.addEventListener("click", ()=>{
      try{
        state = reducer(state, { type:'BUY_FROM_FLOW', player:'player', flowIndex: idx });
        render();
      }catch(err){ toast(err?.message || "Cannot buy"); }
    });
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ------- preview / zoom ------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
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
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const touch = ev.clientX !== undefined ? ev : (ev.touches?.[0] ?? {clientX:0,clientY:0});
    pressStart = { x: touch.clientX, y: touch.clientY };
    longPressTimer = setTimeout(()=>{
      if (zoomOverlayEl && zoomCardEl){
        fillCardShell(zoomCardEl, data);
        zoomOverlayEl.setAttribute("data-open","true");
      }
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=> { if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } };
  const onMove = (ev)=>{
    const t = ev.clientX !== undefined ? ev : (ev.touches?.[0] ?? {clientX:0,clientY:0});
    if (Math.hypot(t.clientX - pressStart.x, t.clientY - pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };
  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", clearLP, {passive:true});
  el.addEventListener("pointerleave", clearLP, {passive:true});
  el.addEventListener("pointercancel", clearLP, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
  el.addEventListener("dragstart", clearLP);
}

/* ------- mobile-friendly drag ghost ------- */
function installTouchDrag(cardEl, cardData){
  let dragging = false;
  let ghost = null;
  let start = {x:0,y:0};
  let last = {x:0,y:0};
  let tickPending = false;

  function pt(e){ const t = e.clientX !== undefined ? e : (e.touches?.[0] ?? {clientX:0,clientY:0}); return {x:t.clientX, y:t.clientY}; }

  const rAFMove = ()=>{
    tickPending = false;
    if (ghost) ghost.style.transform = `translate(${last.x - ghost.clientWidth/2}px, ${last.y - ghost.clientHeight*0.9}px)`;
  };

  const DOWN = (e)=>{
    start = last = pt(e);
    dragging = false;
    cardEl.setPointerCapture?.(e.pointerId || 0);
  };

  const MOVE = (e)=>{
    const p = pt(e);
    if (dragging) e.preventDefault();

    if (!dragging){
      if (Math.hypot(p.x - start.x, p.y - start.y) > 10){
        dragging = true;
        if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; }

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

  cardEl.addEventListener("pointerdown", DOWN);
  window.addEventListener("pointermove", MOVE, {passive:false});
  window.addEventListener("pointerup",   UP,   {passive:true});
}

/* ------- actions ------- */
function playSpellIfPossible(cardId, slotIndex){
  try{
    state = reducer(state, { type:'PLAY_CARD_TO_SLOT', player:'player', cardId, slotIndex });
    render();
  }catch(err){ toast(err?.message || "Can't play there"); }
}

/* ------- main render ------- */
function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  const s = serializePublic(state) || {};

  set(turnIndicator, el => el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`);
  set(aetherReadout, el => el.textContent  = `Æ ${s.player?.aether ?? 0}  ◇ ${s.player?.channeled ?? 0}`);

  set(playerPortrait, el=> el.src = s.player?.weaver?.portrait || el.src || "");
  set(aiPortrait,     el=> el.src = s.ai?.weaver?.portrait || el.src || "");
  set(playerName,     el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el=> el.textContent = s.ai?.weaver?.name || "Opponent");

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);

  // Flow fallback if GameLogic.serializePublic doesn't return s.flow
  let flow = Array.isArray(s.flow) ? s.flow : [];
  if (!flow.length && Array.isArray(state.flowRow)){
    flow = state.flowRow.map((c,i)=> ({
      id: c.id, name: c.name, type: c.type, price: DEFAULT_FLOW_COSTS[i] ?? 0,
    }));
  }
  renderFlow(flow);

  // Hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card"; el.tabIndex = 0; el.draggable = true;
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;
      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox"></div>
        <div class="actions">
          <button class="btn" data-play="1">Play</button>
          <button class="btn" data-discard="1">Discard for Æ ${c.aetherValue ?? 0}</button>
        </div>`;

      el.addEventListener("dragstart", (ev)=>{
        el.classList.add("dragging");
        ev.dataTransfer?.setData("text/card-id", c.id);
        ev.dataTransfer?.setData("text/card-type", c.type);
        ev.dataTransfer?.setDragImage(el, el.clientWidth/2, el.clientHeight*0.9);
      });
      el.addEventListener("dragend", ()=> el.classList.remove("dragging"));

      installTouchDrag(el, c);
      attachPeekAndZoom(el, c);

      el.querySelector("[data-play]")?.addEventListener("click", ()=>{
        const idx = (s.player?.slots || []).findIndex(x=>!x.hasCard && !x.isGlyph);
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
}

/* wiring */
startBtn?.addEventListener("click", ()=>{ state = reducer(state, {type:'START_TURN', player:'player'}); render(); });
endBtn?.addEventListener("click",   ()=>{ state = reducer(state, {type:'END_TURN',   player:'player'}); render(); });
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
zoomOverlayEl?.addEventListener("click", closeZoom);
document.addEventListener("DOMContentLoaded", render);