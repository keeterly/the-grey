/* ===== Grey Animations bootstrap (idempotent) ===== */
(() => {
  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on = (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    };
    const off = (name, fn) => listeners.get(name)?.delete(fn);
    const emit = (name, detail) => (listeners.get(name) || []).forEach(fn => { try { fn(detail); } catch {} });
    const bus = { on, off, emit };
    window.Grey = bus;
    return bus;
  })();

  // Load animations without blocking
  async function loadAnimationsOnce() {
    if (window.__greyAnimationsLoaded__) return;
    try { await import('./animations.js?v=2571'); } catch {}
  }
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
  withAetherText
} from "./GameLogic.js";

/* ------- DOM helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

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

/* ------- animation emit helpers ------- */
function emitAnim(name, detail){
  if (window.Grey?.emit) window.Grey.emit(name, detail);
  else document.dispatchEvent(new CustomEvent(name, { detail, bubbles:true }));
}
const A = {
  drawn(nodes){ emitAnim('cards:drawn', { nodes }); },
  discarded(nodes){ emitAnim('cards:discard', { nodes }); },
  flowReveal(node){ emitAnim('aetherflow:reveal', { node }); },
  flowFalloff(node){ emitAnim('aetherflow:falloff', { node }); },
  flowBought(node){ emitAnim('aetherflow:bought', { node }); }
};

/* ------- previous snapshots for diffing ------- */
let prevHandIds = [];
let prevFlowIds = [null,null,null,null,null];

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
   Aether / text helpers
-------------------------------------------------*/
function gemSVG(cls="", size=16){
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2l6 6-6 14-6-14 6-6z"/></svg>`;
}
function aeInline(s){ return withAetherText(s); }
function setAetherDisplay(el, v=0){
  if (!el) return;
  el.innerHTML = `<span class="gem">${gemSVG("aegem-txt", 16)}</span><strong class="val">${v|0}</strong>`;
}

/* ------------------------------------------------
   Hand layout (MTGArena-ish)
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
   Peek / Zoom
-------------------------------------------------*/
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  const pip = Number.isFinite(data.pip) ? Math.max(0, data.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (data.aetherValue>0) ? `<div class="aether-chip">${gemSVG("", 16)}<span class="val">${data.aetherValue}</span></div>` : "";
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
  let dragging = false, ghost = null, currentHover = null;
  const start = (ev)=>{
    const t = ev.touches ? ev.touches[0] : ev;
    dragging = true; markDropTargets(data.type, true);
    ghost = el.cloneNode(true);
    ghost.style.position = "fixed"; ghost.style.left = "0px"; ghost.style.top = "0px";
    ghost.style.pointerEvents = "none"; ghost.style.transform = "translate(-9999px,-9999px)";
    ghost.style.zIndex = "99999"; ghost.classList.add("dragging");
    document.body.appendChild(ghost);
    move(t.clientX, t.clientY); ev.preventDefault();
  };
  const move = (x,y)=>{
    if (!dragging || !ghost) return;
    ghost.style.transform = `translate(${x-ghost.clientWidth/2}px, ${y-ghost.clientHeight*0.9}px) rotate(6deg)`;
    const elUnder = document.elementFromPoint(x, y);
    const hoverTarget = findValidDropTarget(elUnder, data.type);
    if (hoverTarget !== currentHover){
      currentHover?.classList.remove("drag-over");
      currentHover = hoverTarget;
      currentHover?.classList.add("drag-over");
    }
  };
  const end = (ev)=>{
    if (!dragging) return;
    dragging = false;
    const t = ev.changedTouches ? ev.changedTouches[0] : ev;
    const elUnder = document.elementFromPoint(t.clientX, t.clientY);
    const target = findValidDropTarget(elUnder, data.type);
    currentHover?.classList.remove("drag-over");
    markDropTargets(data.type, false);
    ghost?.remove(); ghost = null;
    if (target){
      if (target.classList.contains("slot") && target.classList.contains("spell") && data.type==="SPELL"){
        const slotIndex = Number(target.dataset.slotIndex || 0);
        try { state = playCardToSpellSlot(state, "player", el.dataset.cardId, slotIndex); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      } else if (target.classList.contains("slot") && target.classList.contains("glyph") && data.type==="GLYPH"){
        try { state = setGlyphFromHand(state, "player", el.dataset.cardId); render(); }
        catch(err){ toast(err?.message || "Can't set glyph"); }
      } else if (target === hudDiscardBtn){
        try { state = discardForAether(state, "player", el.dataset.cardId); render(); toast("Discarded for Æ"); }
        catch(e){ toast(e?.message || "Can't discard"); }
      }
    }
  };
  el.addEventListener("touchstart", start, {passive:false});
  el.addEventListener("touchmove", (ev)=>{ const t=ev.touches[0]; move(t.clientX,t.clientY); ev.preventDefault(); }, {passive:false});
  el.addEventListener("touchend", end, {passive:false});
  el.addEventListener("touchcancel", end, {passive:false});
}
// Only allow dropping into YOUR board slots (not AI)
function findValidDropTarget(node, cardType){
  if (!node) return null;
  const slot = node.closest(".slot");
  if (slot){
    const isPlayerSlot = !!slot.closest(".row.player");
    if (!isPlayerSlot) return null;
    if (slot.classList.contains("spell") && cardType==="SPELL") return slot;
    if (slot.classList.contains("glyph") && cardType==="GLYPH") return slot;
  }
  if (hudDiscardBtn && node.closest("#btn-discard-hud")) return hudDiscardBtn;
  return null;
}
function markDropTargets(cardType, on){
  document.querySelectorAll(".row.player .slot.spell").forEach(s=>{
    if (on && cardType==="SPELL") s.classList.add("drag-over");
    else s.classList.remove("drag-over");
  });
  const g = document.querySelector(".row.player .slot.glyph");
  if (g){
    if (on && cardType==="GLYPH") g.classList.add("drag-over");
    else g.classList.remove("drag-over");
  }
  hudDiscardBtn?.classList.toggle("drop-ready", !!on);
}

/* ------------------------------------------------
   Slots + Cards
-------------------------------------------------*/
function cardHTML(c){
  if (!c) return `<div class="title">Empty</div><div class="type">—</div>`;
  const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (c.aetherValue>0) ? `<div class="aether-chip">${gemSVG("", 16)}<span class="val">${c.aetherValue}</span></div>` : "";
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
   Aetherflow row (reveal, falloff, buy)
-------------------------------------------------*/
function renderFlow(flowArray){
  if (!flowRowEl) return;
  const oldCardsByIndex = Array.from(flowRowEl.children).map(li => li.querySelector('.card'));
  const nextIds = (flowArray || []).slice(0,5).map(c => c ? c.id : null);

  // falloff animation for slots whose id changed from previous render
  prevFlowIds.forEach((prevId, idx) => {
    if (!prevId) return;
    const incoming = nextIds[idx];
    if (incoming !== prevId) {
      const oldNode = oldCardsByIndex[idx];
      if (oldNode) A.flowFalloff(oldNode);
    }
  });

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
        A.flowBought(card);
        try { state = buyFromFlow(state, "player", idx); toast("Bought to discard"); render(); }
        catch(err){ toast(err?.message || "Cannot buy"); }
      });
    }

    li.appendChild(card);

    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    const PRICE_BY_POS = [4,3,3,2,2];
    priceLbl.innerHTML = `${aeInline("Æ")} ${PRICE_BY_POS[idx]||0} to buy`;
    li.appendChild(priceLbl);

    flowRowEl.appendChild(li);

    // reveal animation when a new id appears
    if (!prevFlowIds[idx] && c) A.flowReveal(card);
  });

  prevFlowIds = nextIds;
}

/* ------------------------------------------------
   Render root
-------------------------------------------------*/
function ensureSafetyShape(s){
  if (!Array.isArray(s.flow)) s.flow = [null,null,null,null,null];
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

  setAetherDisplay(playerAeEl, s.players?.player?.aether ?? 0);
  setAetherDisplay(aiAeEl,     s.players?.ai?.aether ?? 0);

  // Ensure icons in HUD
  if (hudDeckBtn && !hudDeckBtn.dataset.icon){
    hudDeckBtn.dataset.icon = "true";
    hudDeckBtn.innerHTML = `
      <svg class="icon deck" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
        <rect x="10" y="12" width="36" height="40" rx="4"></rect>
        <rect x="14" y="8" width="36" height="40" rx="4"></rect>
        <rect x="18" y="4" width="36" height="40" rx="4"></rect>
      </svg>
    `;
  }
  if (hudDiscardBtn && !hudDiscardBtn.dataset.icon){
    hudDiscardBtn.dataset.icon = "true";
    hudDiscardBtn.innerHTML = `
      <svg class="icon discard" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
        <rect x="10" y="10" width="44" height="34" rx="6"></rect>
        <path d="M20 22h24M20 30h24M20 38h24" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  hudDiscardBtn?.classList.add("drop-target");
  hudDeckBtn?.classList.add("drop-target");

  renderSlots(playerSlotsEl, s.players?.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.players?.ai?.slots     || [], false);
  renderFlow(s.flow);

  // hand
  if (handEl){
    const oldIds = prevHandIds;
    handEl.replaceChildren();
    const els = [];
    const newIds = [];
    (s.players?.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
      const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
      const aetherChip = (c.aetherValue>0) ? `<div class="aether-chip">${gemSVG("", 16)}<span class="val">${c.aetherValue}</span></div>` : "";
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
      newIds.push(c.id);
    });
    layoutHand(handEl, els);

    const addedNodes = els.filter(el => !oldIds.includes(el.dataset.cardId));
    if (addedNodes.length) A.drawn(addedNodes);

    prevHandIds = newIds;
  }
}

/* ------------------------------------------------
   Turn wiring (player -> ai -> player)
-------------------------------------------------*/
async function doStartTurn(){
  state = startTurn(state);             // reveal flow head if empty
  // Auto-draw up to 5 for the ACTIVE player
  const active = state.activePlayer;
  const need = Math.max(0, 5 - (state.players[active].hand?.length||0));
  if (need) state = drawN(state, active, need);
  render(); // render first so new DOM nodes exist
  // Draw animation: emit after DOM built
  const handNodes = Array.from(handEl?.children || []);
  const justDrawn = handNodes.slice(-Math.max(0, need));
  if (justDrawn.length) A.drawn(justDrawn);
}

async function doEndTurn(){
  // 1) Animate discarding the player's remaining hand
  const handNodes = Array.from(handEl?.children || []);
  if (handNodes.length) {
    A.discarded(handNodes);
    await sleep(560);
    // move hand -> discard in state
    const P = state.players.player;
    P.discard.push(...P.hand.splice(0));
  }

  // 2) Finish player's turn: river shift + switch to AI (also reveals for next)
  state = endTurn(state);

  // 3) AI start turn: draw to 5, render (optional quick pause)
  if (state.activePlayer === "ai"){
    const needAI = Math.max(0, 5 - (state.players.ai.hand?.length||0));
    if (needAI) state = drawN(state, "ai", needAI);
    render();

    // (stub AI actions go here)

    // 4) AI end turn immediately (no hand discard anim for AI yet)
    state = endTurn(state);
  }

  // 5) Back to player start: reveal & draw to 5 and animate draw
  await doStartTurn();
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
document.addEventListener("DOMContentLoaded", async ()=>{
  // Inject HUD icons immediately (so discard target exists for anims)
  hudDeckBtn && (hudDeckBtn.innerHTML = `
    <svg class="icon deck" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
      <rect x="10" y="12" width="36" height="40" rx="4"></rect>
      <rect x="14" y="8" width="36" height="40" rx="4"></rect>
      <rect x="18" y="4" width="36" height="40" rx="4"></rect>
    </svg>
  `);
  hudDiscardBtn && (hudDiscardBtn.innerHTML = `
    <svg class="icon discard" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
      <rect x="10" y="10" width="44" height="34" rx="6"></rect>
      <path d="M20 22h24M20 30h24M20 38h24" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>
  `);
  hudDiscardBtn?.classList.add("drop-target");
  hudDeckBtn?.classList.add("drop-target");

  // Initial start-of-game: treat as start turn (reveal + draw to 5 + anim)
  await doStartTurn();
});