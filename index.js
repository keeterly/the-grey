/* ===== Grey Animations bootstrap — ADD THIS BLOCK AT THE VERY TOP (v2.571-safe) ===== */
(() => {
  // Idempotent bus (won’t overwrite an existing one)
  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on = (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    };
    const off = (name, fn) => listeners.get(name)?.delete(fn);
    const emit = (name, detail) => {
      (listeners.get(name) || []).forEach(fn => {
        try { fn(detail); } catch (e) { console.error('[Grey handler]', name, e); }
      });
    };
    const safeEmit = (name, detail) => { try { emit(name, detail); } catch {} };
    const bus = { on, off, emit, safeEmit };
    window.Grey = bus;
    return bus;
  })();

  // Load animations once, without changing your flow
  async function loadAnimationsOnce() {
    if (window.__greyAnimationsLoaded__) return;
    try {
      await import('./animations.js');
    } catch (e) {
      // Fallback for older loaders – still no-op if it fails
      const s = document.createElement('script');
      s.type = 'module';
      s.src = './animations.js';
      s.onload = () => {};
      s.onerror = () => console.warn('[Grey] animations fallback failed');
      document.head.appendChild(s);
    }
  }

  // Start loading ASAP, but don’t block your existing code
  loadAnimationsOnce();
})();

import {
  initState,
  serializePublic,
  startTurn,
  endTurn,
  aiTakeTurn,
  drawN,
  playCardToSpellSlot,
  setGlyphFromHand,
  buyFromFlow,
  discardForAether,
  withAetherText,
  AE_GEM_SVG
} from "./GameLogic.js";

/* ------- DOM helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

/* ------- refs ------- */
const startBtn      = $("btn-start-turn");
const endBtn        = $("btn-end-turn");
const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");
const turnIndicator = $("turn-indicator");

const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

const playerAeEl    = $("player-aether");
const aiAeEl        = $("ai-aether");

const hudDiscardBtn = $("btn-discard-hud");
const hudDeckBtn    = $("btn-deck-hud");

const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* ------- state ------- */
let state = initState();

/* ------- toast ------- */
let toastEl;
function toast(msg, ms=1100){
  if (!toastEl){
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), ms);
}

/* ------------------------------------------------
   Aether gem utilities
-------------------------------------------------*/
function gemSVG(cls="", size=16){
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <path d="M12 2l6 6-6 14-6-14 6-6z" />
  </svg>`;
}
function aeInline(s){ return withAetherText(s); }

function setAetherDisplay(el, v=0){
  if (!el) return;
  el.innerHTML = `
    <span class="gem">${gemSVG("aegem-txt", 16)}</span>
    <strong class="val">${v|0}</strong>
  `;
}

/* ------------------------------------------------
   Hand layout (MTG Arena–style tighter fanning)
-------------------------------------------------*/
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 18, MIN_ANGLE = 6;
  const spread = Math.min(container.clientWidth * 0.78, 820);
  const totalAngle = N===1 ? 0 : clamp(MIN_ANGLE + (N-2)*1.8, MIN_ANGLE, MAX_ANGLE);
  const stepA = N===1 ? 0 : totalAngle/(N-1);
  const startA = -totalAngle/2;
  const stepX = N===1 ? 0 : spread/(N-1);
  const startX = -spread/2;
  const LIFT = 34;

  cards.forEach((el,i)=>{
    const a = startA + stepA*i;
    const rad = a * Math.PI/180;
    const x = startX + stepX*i;
    const y = LIFT - Math.cos(rad)*(LIFT*0.7);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ------------------------------------------------
   Preview / Zoom (press & hold or hover)
-------------------------------------------------*/
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }

function fillCardShell(div, data){
  if (!div) return;
  const pip = Number.isFinite(data.pip) ? Math.max(0, data.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (data.aetherValue>0)
    ? `<div class="aether-chip">${gemSVG("", 16)}<span class="val">${data.aetherValue}</span></div>` : "";

  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}${(data.price ?? data.cost) ? ` — Cost ${aeInline("Æ")}${data.price ?? data.cost}` : ""}</div>
    <div class="textbox">${aeInline(data.text||"")}</div>
    ${pipDots}
    ${aetherChip}
  `;
}

let longPressTimer=null, pressStart={x:0,y:0};
const LONG_PRESS_MS=350, MOVE_CANCEL_PX=8;

function attachPeekAndZoom(el, data){
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const t = ev.clientX!==undefined?ev:(ev.touches?.[0]??{clientX:0,clientY:0});
    pressStart = {x:t.clientX,y:t.clientY};
    longPressTimer = setTimeout(()=>{
      if (zoomOverlayEl && zoomCardEl){
        fillCardShell(zoomCardEl, data);
        zoomOverlayEl.setAttribute("data-open","true");
      }
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=>{ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } };
  const onMove = (ev)=>{
    const t = ev.clientX!==undefined?ev:(ev.touches?.[0]??{clientX:0,clientY:0});
    if (Math.hypot(t.clientX-pressStart.x, t.clientY-pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };
  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", clearLP, {passive:true});
  el.addEventListener("pointerleave", clearLP, {passive:true});
  el.addEventListener("pointercancel", clearLP, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
  el.addEventListener("dragstart", clearLP);
}

/* ------------------------------------------------
   Drag & Drop (desktop + touch)
-------------------------------------------------*/
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
    markDropTargets(data.type, true);
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    markDropTargets(data.type, false);
  });
}

function wireTouchDrag(el, data){
  let dragging = false;
  let ghost = null;
  let currentHover = null;

  const start = (ev)=>{
    const t = ev.touches ? ev.touches[0] : ev;
    dragging = true;
    markDropTargets(data.type, true);

    ghost = el.cloneNode(true);
    ghost.style.position = "fixed";
    ghost.style.left = "0px"; ghost.style.top = "0px";
    ghost.style.pointerEvents = "none";
    ghost.style.transform = "translate(-9999px,-9999px)";
    ghost.style.zIndex = "99999";
    ghost.classList.add("dragging");
    document.body.appendChild(ghost);
    move(t.clientX, t.clientY);
    ev.preventDefault();
  };

  const move = (x, y)=>{
    if (!dragging || !ghost) return;
    ghost.style.transform = `translate(${x-ghost.clientWidth/2}px, ${y-ghost.clientHeight*0.9}px) rotate(6deg)`;

    const elUnder = document.elementFromPoint(x, y);
    const hoverTarget = findValidDropTarget(elUnder, data.type);
    if (hoverTarget !== currentHover){
      if (currentHover) currentHover.classList.remove("drag-over");
      currentHover = hoverTarget;
      if (currentHover) currentHover.classList.add("drag-over");
    }
  };

  const end = (ev)=>{
    if (!dragging) return;
    dragging = false;

    const t = ev.changedTouches ? ev.changedTouches[0] : ev;
    const elUnder = document.elementFromPoint(t.clientX, t.clientY);
    const target = findValidDropTarget(elUnder, data.type);

    if (currentHover) currentHover.classList.remove("drag-over");
    markDropTargets(data.type, false);

    if (ghost) { ghost.remove(); ghost = null; }

    if (target){
      if (target.classList.contains("slot") && target.classList.contains("spell") && data.type==="SPELL"){
        const slotIndex = Number(target.dataset.slotIndex || 0);
        try { state = playCardToSpellSlot(state, "player", el.dataset.cardId, slotIndex); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      } else if (target.classList.contains("slot") && target.classList.contains("glyph") && data.type==="GLYPH"){
        try { state = setGlyphFromHand(state, "player", el.dataset.cardId); render(); }
        catch(err){ toast(err?.message || "Can't set glyph"); }
      } else if (target === hudDiscardBtn){
        try {
          state = discardForAether(state, "player", el.dataset.cardId);
          render();
          toast("Discarded for Æ");
        } catch(e){ toast(e?.message || "Can't discard"); }
      }
    }
  };

  el.addEventListener("touchstart", start, {passive:false});
  el.addEventListener("touchmove", (ev)=>{ const t=ev.touches[0]; move(t.clientX,t.clientY); ev.preventDefault(); }, {passive:false});
  el.addEventListener("touchend", end, {passive:false});
  el.addEventListener("touchcancel", end, {passive:false});
}

function findValidDropTarget(node, cardType){
  if (!node) return null;
  const slot = node.closest(".slot");
  if (slot){
    if (slot.classList.contains("spell") && cardType==="SPELL") return slot;
    if (slot.classList.contains("glyph") && cardType==="GLYPH") return slot;
  }
  if (hudDiscardBtn && node.closest("#btn-discard-hud")) return hudDiscardBtn;
  return null;
}

function markDropTargets(cardType, on){
  document.querySelectorAll(".slot.spell").forEach(s=>{
    if (on && cardType==="SPELL") s.classList.add("drag-over");
    else s.classList.remove("drag-over");
  });
  const g = document.querySelector(".slot.glyph");
  if (g){
    if (on && cardType==="GLYPH") g.classList.add("drag-over");
    else g.classList.remove("drag-over");
  }
  if (hudDiscardBtn){
    if (on) hudDiscardBtn.classList.add("drop-ready");
    else hudDiscardBtn.classList.remove("drop-ready");
  }
}

/* ------------------------------------------------
   Slots (show full card when occupied)
-------------------------------------------------*/
function cardHTML(c){
  if (!c) return `<div class="title">Empty</div><div class="type">—</div>`;
  const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (c.aetherValue>0)
    ? `<div class="aether-chip">${gemSVG("", 16)}<span class="val">${c.aetherValue}</span></div>` : "";
  const price = (c.price ?? c.cost) | 0;

  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price ? ` — Cost ${aeInline("Æ")}${price}` : ""}</div>
    <div class="textbox">${aeInline(c.text||"")}</div>
    ${pipDots}
    ${aetherChip}
  `;
}

function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];

  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);

    const slot = safe[i] || {hasCard:false, card:null};
    if (slot.hasCard && slot.card){
      const art = document.createElement("article");
      art.className = "card";
      art.innerHTML = cardHTML(slot.card);
      attachPeekAndZoom(art, slot.card);
      d.appendChild(art);
    } else {
      d.textContent = "Spell Slot";
    }

    if (isPlayer){
      d.addEventListener("dragover", (ev)=> { 
        const t = ev.dataTransfer?.getData("text/card-type");
        if (t==="SPELL"){ ev.preventDefault(); d.classList.add("drag-over"); }
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const cardId   = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL") return;
        try { state = playCardToSpellSlot(state, "player", cardId, i); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      });
    }
    container.appendChild(d);
  }

  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};

  if (glyphSlot.hasCard && glyphSlot.card){
    const art = document.createElement("article");
    art.className = "card";
    art.innerHTML = cardHTML(glyphSlot.card);
    attachPeekAndZoom(art, glyphSlot.card);
    g.appendChild(art);
  } else {
    g.textContent = "Glyph Slot";
  }

  if (isPlayer){
    g.addEventListener("dragover", (ev)=> {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{ 
      ev.preventDefault(); g.classList.remove("drag-over"); 
      const cardId = ev.dataTransfer?.getData("text/card-id");
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t!=="GLYPH") return;
      try { state = setGlyphFromHand(state, "player", cardId); render(); }
      catch(err){ toast(err?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ------------------------------------------------
   Flow (river): uses s.flow; click-to-buy
-------------------------------------------------*/
function renderFlow(flowArray){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flowArray || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);

    if (c){ card.innerHTML = cardHTML(c); attachPeekAndZoom(card, c); }
    else { card.innerHTML = `<div class="title">Empty</div><div class="type">—</div>`; }

    if (c){
      card.addEventListener("click", ()=>{
        try{ state = buyFromFlow(state, "player", idx); toast("Bought to discard"); render(); }
        catch(err){ toast(err?.message || "Cannot buy"); }
      });
    }

    li.appendChild(card);

    // fixed price rail (4,3,3,2,2 by position)
    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    const PRICE_BY_POS = [4,3,3,2,2];
    priceLbl.innerHTML = `${aeInline("Æ")} ${PRICE_BY_POS[idx]||0} to buy`;
    li.appendChild(priceLbl);

    flowRowEl.appendChild(li);
  });
}

/* ------------------------------------------------
   Render root
-------------------------------------------------*/
function ensureSafetyShape(s){
  if (!Array.isArray(s.flow)) s.flow = [null,null,null,null,null];

  // don’t mutate original player structures here beyond counts
  if (!s.player) s.player = {aether:0,channeled:0,hand:[],slots:[],deckCount:0};
  if (!Array.isArray(s.player.hand)) s.player.hand=[];
  if (!Array.isArray(s.player.slots) || s.player.slots.length<4){
    s.player.slots = [
      {hasCard:false,card:null},{hasCard:false,card:null},{hasCard:false,card:null},
      {isGlyph:true,hasCard:false,card:null}
    ];
  }
  if (!s.ai) s.ai = {weaver:{name:"Opponent"}, aether:0, slots:[{},{},{},{isGlyph:true}]};
  return s;
}

function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  let s = ensureSafetyShape(serializePublic(state) || {});
  set(turnIndicator, el => el && (el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`));

  set(playerPortrait, el=> el && (el.src = s.players?.player?.weaver?.portrait || "./weaver_aria.jpg"));
  set(aiPortrait,     el=> el && (el.src = s.players?.ai?.weaver?.portrait     || "./weaver_morr.jpg"));
  set(playerName,     el=> el && (el.textContent = s.players?.player?.weaver?.name || "Player"));
  set(aiName,         el=> el && (el.textContent = s.players?.ai?.weaver?.name || "Opponent"));

  // Æ gem readouts under portraits
  setAetherDisplay(playerAeEl, s.players?.player?.aether ?? 0);
  setAetherDisplay(aiAeEl,     s.players?.ai?.aether ?? 0);

  if (hudDiscardBtn) hudDiscardBtn.classList.add("drop-target");
  if (hudDeckBtn)    hudDeckBtn.classList.add("drop-target");

  renderSlots(playerSlotsEl, s.players?.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.players?.ai?.slots     || [], false);
  renderFlow(s.flow);

  // hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.players?.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
      const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
      const aetherChip = (c.aetherValue>0)
        ? `<div class="aether-chip">${gemSVG("", 16)}<span class="val">${c.aetherValue}</span></div>` : "";

      const price = (c.price ?? c.cost) | 0;
      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}${price ? ` — Cost ${aeInline("Æ")}${price}` : ""}</div>
        <div class="textbox">${aeInline(c.text||"")}</div>
        ${pipDots}
        ${aetherChip}
      `;

      wireDesktopDrag(el, c);
      wireTouchDrag(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* ------------------------------------------------
   Turn wiring
-------------------------------------------------*/
function doStartTurn(){
  state = startTurn(state);
  // draw up to 5 if desired at start (optional; comment if not needed)
  // state = drawN(state, "player", Math.max(0, 5 - (state.players.player.hand?.length||0)));
  render();
}

function doEndTurn(){
  // (Optionally discard remaining hand, then draw—left to your game rules)
  state = endTurn(state);        // shift river + switch player + reveal for next
  if (state.activePlayer === "ai"){
    state = aiTakeTurn(state);   // stub; no-ops by default
    state = endTurn(state);      // pass back to player and reveal again
  }
  render();
}

/* ------------------------------------------------
   Events
-------------------------------------------------*/
startBtn?.addEventListener("click", doStartTurn);
endBtn?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });

/* ------------------------------------------------
   Boot
-------------------------------------------------*/
document.addEventListener("DOMContentLoaded", ()=>{
  // reveal the first flow card at game start
  state = startTurn(state);
  render();
});


/* ============================================================
   v2.571 — Animations harness (safe / optional)
   - No visual changes.
   - Loads animations module only if it exists.
   - Exposes Grey.emit(...) you can call later.
   ============================================================ */

const Grey = window.Grey ?? (window.Grey = {
  on(type, fn, opts)  { document.addEventListener(type, fn, opts); },
  off(type, fn, opts) { document.removeEventListener(type, fn, opts); },
  emit(type, detail={}) {
    document.dispatchEvent(new CustomEvent(type, { detail, bubbles:true }));
  }
});

async function loadAnimationsModule() {
  try {
    await import('./animations.js?v=2571'); // cache-bust to avoid iOS stale cache
  } catch (_) {
    // animations.js not present yet — totally fine, remain no-op
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => queueMicrotask(loadAnimationsModule));
} else {
  queueMicrotask(loadAnimationsModule);
}

/* Example signals you'll wire later (do not add yet):
Grey.emit('cards:drawn',   { nodes: [/* DOM nodes of drawn cards *\/] });
Grey.emit('cards:discard', { nodes: [/* DOM nodes discarded *\/] });
Grey.emit('flow:reveal',   { node: /* newly revealed flow card *\/ });
Grey.emit('flow:falloff',  { node: /* rightmost flow card *\/ });
Grey.emit('flow:purchase', { node: /* bought flow card *\/ });
*/