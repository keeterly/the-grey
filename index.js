import { initState, serializePublic, reducer } from "./GameLogic.js";

/* ------- helpers ------- */
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

const playerPortrait = $("player-portrait");
const aiPortrait     = $("ai-portrait");
const playerName     = $("player-name");
const aiName         = $("ai-name");

const peekEl         = $("peek-card");
const zoomOverlayEl  = $("zoom-overlay");
const zoomCardEl     = $("zoom-card");

let state = initState({});

/* ------- toast ------- */
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

/* ------- hand fan ------- */
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

/* ------- slot rendering ------- */
function renderSlots(container, slotSnapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();

  // three spell bays
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const has = slotSnapshot?.[i]?.hasCard;
    d.textContent = has ? (slotSnapshot[i].card?.name || "Spell") : "Spell Slot";
    if (has) d.classList.add("has-card");
    container.appendChild(d);
  }

  // glyph bay
  const g = document.createElement("div");
  g.className = "slot glyph";
  g.textContent = "Glyph Slot";
  container.appendChild(g);
}

/* ------- flow row ------- */
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
    attachPeekAndZoom(card, c);
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
  // Hover peek (desktop)
  el.addEventListener("mouseenter", ()=>{
    if (!peekEl) return;
    fillCardShell(peekEl, data);
    peekEl.classList.add("show");
  });
  el.addEventListener("mouseleave", ()=> peekEl?.classList.remove("show"));

  // Long-press zoom (mobile + desktop)
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const t = ("clientX" in ev) ? ev : (ev.touches?.[0] ?? {clientX:0,clientY:0});
    pressStart = { x: t.clientX, y: t.clientY };
    longPressTimer = setTimeout(()=>{
      if (zoomOverlayEl && zoomCardEl){
        fillCardShell(zoomCardEl, data);
        zoomOverlayEl.setAttribute("data-open","true");
      }
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=> { if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } };
  const onMove = (ev)=>{
    const t = ("clientX" in ev) ? ev : (ev.touches?.[0] ?? {clientX:0,clientY:0});
    if (Math.hypot(t.clientX - pressStart.x, t.clientY - pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };

  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", clearLP, {passive:true});
  el.addEventListener("pointerleave", clearLP, {passive:true});
  el.addEventListener("pointercancel", clearLP, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
}

/* ====== High-quality custom drag (no native HTML5 drag) ======
   - Works smoothly on mobile & desktop
   - Snap to spell slots; highlights target slot
================================================================ */
let slotRects = [];
function updateSlotRects(){
  slotRects = Array.from(document.querySelectorAll(".row.player .slot.spell")).map((el,i)=>{
    const r = el.getBoundingClientRect();
    return { i, el, r };
  });
}
function pointerPt(e){
  const t = ("clientX" in e) ? e : (e.touches?.[0] ?? {clientX:0,clientY:0});
  return { x:t.clientX, y:t.clientY };
}

function installCardDrag(cardEl, card){
  // ensure no native selection or drag image
  cardEl.style.userSelect = "none";
  cardEl.addEventListener("dragstart", e => e.preventDefault());

  let ghost=null, dragging=false, last={x:0,y:0}, start={x:0,y:0}, rafPending=false;

  const moveRAF = ()=>{
    rafPending = false;
    if (ghost) ghost.style.transform = `translate(${last.x - ghost.clientWidth/2}px, ${last.y - ghost.clientHeight*0.9}px)`;

    // hover target highlight
    document.querySelectorAll(".slot.drag-over").forEach(s=>s.classList.remove("drag-over"));
    const target = slotRects.find(s =>
      last.x >= s.r.left && last.x <= s.r.right && last.y >= s.r.top && last.y <= s.r.bottom
    );
    if (target) target.el.classList.add("drag-over");
  };

  const onDown = (e)=>{
    const p = pointerPt(e);
    start = last = p;
    dragging = false;
    cardEl.setPointerCapture?.(e.pointerId || 0);
    updateSlotRects();
  };

  const onMove = (e)=>{
    const p = pointerPt(e);

    // If moving significantly, start drag
    if (!dragging && Math.hypot(p.x-start.x, p.y-start.y) > 10){
      dragging = true;
      if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; }
      ghost = cardEl.cloneNode(true);
      ghost.classList.add("dragging");
      ghost.style.position = "fixed";
      ghost.style.left = "0"; ghost.style.top = "0";
      ghost.style.transform = `translate(${p.x - cardEl.clientWidth/2}px, ${p.y - cardEl.clientHeight*0.9}px)`;
      ghost.style.zIndex = "100000";
      ghost.style.pointerEvents = "none";
      document.body.appendChild(ghost);
    }

    if (dragging){
      e.preventDefault();
      last = p;
      if (!rafPending){ rafPending = true; requestAnimationFrame(moveRAF); }
    }
  };

  const onUp = ()=>{
    document.querySelectorAll(".slot.drag-over").forEach(s=>s.classList.remove("drag-over"));
    if (dragging && ghost){
      const target = slotRects.find(s =>
        last.x >= s.r.left && last.x <= s.r.right && last.y >= s.r.top && last.y <= s.r.bottom
      );
      if (target){
        playSpellIfPossible(card.id, target.i);
      }
      ghost.remove(); ghost=null; dragging=false;
    }
  };

  cardEl.addEventListener("pointerdown", onDown, {passive:true});
  window.addEventListener("pointermove", onMove, {passive:false});
  window.addEventListener("pointerup",   onUp,   {passive:true});
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
  updateSlotRects();

  renderFlow(s.flow || []);

  // Hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card"; el.tabIndex = 0;
      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox"></div>
        <div class="actions">
          <button class="btn" data-play="1">Play</button>
          <button class="btn" data-discard="1">Discard for Æ ${c.aetherValue ?? 0}</button>
        </div>`;

      // smooth pointer-based drag
      installCardDrag(el, c);
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
window.addEventListener("resize", ()=> { layoutHand(handEl, Array.from(handEl?.children || [])); updateSlotRects(); });
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
zoomOverlayEl?.addEventListener("click", closeZoom);
document.addEventListener("DOMContentLoaded", render);
