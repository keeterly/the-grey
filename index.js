import { initState, serializePublic, playCardToSpellSlot, setGlyphFromHand, buyFromFlow } from "./GameLogic.js";

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
const aetherReadout = $("aether-readout");
const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

/* HUD targets for deck/discard (must exist in HTML) */
const hudDiscardBtn = $("btn-discard-hud");
const hudDeckBtn    = $("btn-deck-hud");

const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

let state = initState({});

/* ------- tiny toast ------- */
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
   Card layout (MTG Arena–style tighter fanning)
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

function gemSVG(cls=""){ 
  return `<svg class="${cls}" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 2l5 4-5 16L7 6l5-4zM2 8l5-2 5 16-5 2-5-16zm20 0l-5-2-5 16 5 2 5-16z"></path>
  </svg>`;
}
function withAetherText(s=""){
  return (s||"").replace(/Æ/g, () => `<span class="ae-inline">${gemSVG("aegem-txt")}</span>`);
}

function fillCardShell(div, data){
  if (!div) return;
  const pip = Number.isFinite(data.pip) ? Math.max(0, data.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (data.aetherValue>0)
    ? `<div class="aether-chip">${gemSVG()}<span class="val">${data.aetherValue}</span></div>` : "";

  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}${data.price?` — Cost ${withAetherText("Æ")}${data.price}`:""}</div>
    <div class="textbox">${withAetherText(data.text||"")}</div>
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
   Drag & Drop (desktop + mobile touch)
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

/* ----- touch drag (mobile) ----- */
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

    // drop behavior
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
          state = discardCardForAether(state, "player", el.dataset.cardId);
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
    if (on && cardType==="SPELL") s.classList.add("drag-over-pulse");
    else s.classList.remove("drag-over-pulse");
  });
  const g = document.querySelector(".slot.glyph");
  if (g){
    if (on && cardType==="GLYPH") g.classList.add("drag-over-pulse");
    else g.classList.remove("drag-over-pulse");
  }
  if (hudDiscardBtn){
    if (on) hudDiscardBtn.classList.add("drop-ready");
    else hudDiscardBtn.classList.remove("drop-ready");
  }
}

/* ------------------------------------------------
   Simple discard-for-aether (front-end convenience)
-------------------------------------------------*/
function discardCardForAether(s, playerId, cardId){
  const P = s.players[playerId];
  if (!P) throw new Error("bad player");
  const i = P.hand.findIndex(c=>c.id===cardId);
  if (i<0) throw new Error("card not in hand");
  const card = P.hand[i];
  const gain = card.aetherValue|0;
  if (gain<=0) throw new Error("This card has no Æ value");
  P.aether = (P.aether|0) + gain;
  P.discardCount += 1;
  P.hand.splice(i,1);
  const readout = document.querySelector(".aether-display");
  if (readout){ readout.classList.remove("flash"); void readout.offsetWidth; readout.classList.add("flash"); }
  return s;
}

/* ------------------------------------------------
   Slots
-------------------------------------------------*/
function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];

  // 3 spell + 1 glyph
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
   Flow (uses state.flow from GameLogic)
-------------------------------------------------*/
function cardHTML(c){
  if (!c) return `<div class="title">Empty</div><div class="type">—</div>`;
  const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (c.aetherValue>0)
    ? `<div class="aether-chip">${gemSVG()}<span class="val">${c.aetherValue}</span></div>` : "";
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${c.price?` — Cost ${withAetherText("Æ")}${c.price}`:""}</div>
    <div class="textbox">${withAetherText(c.text||"")}</div>
    ${pipDots}
    ${aetherChip}
  `;
}

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

    // click to buy (uses GameLogic buyFromFlow)
    if (c){
      card.addEventListener("click", ()=>{
        try{ state = buyFromFlow(state, "player", idx); toast("Bought to discard"); render(); }
        catch(err){ toast(err?.message || "Cannot buy"); }
      });
    }

    li.appendChild(card);
    const costLbl = document.createElement("div");
    costLbl.className = "price-label";
    const cost = [4,3,3,2,2][idx] || 0;
    costLbl.innerHTML = `${withAetherText("Æ")} ${cost} to buy`;
    li.appendChild(costLbl);

    flowRowEl.appendChild(li);
  });
}

/* ------------------------------------------------
   Render
-------------------------------------------------*/
function ensureSafetyShape(s){
  if (!Array.isArray(s.flow) || s.flow.length===0){
    s.flow = [null,null,null,null,null];
  }
  if (!s.player) s.player = {aether:0,channeled:0,hand:[],slots:[]};
  if (!Array.isArray(s.player.hand)) s.player.hand=[];
  if (!Array.isArray(s.player.slots) || s.player.slots.length<4){
    s.player.slots = [
      {hasCard:false,card:null},{hasCard:false,card:null},{hasCard:false,card:null},
      {isGlyph:true,hasCard:false,card:null}
    ];
  }
  if (!s.ai) s.ai = {weaver:{name:"Opponent"}};
  return s;
}

function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  let s = ensureSafetyShape(serializePublic(state) || {});
  set(turnIndicator, el => el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`);
  set(aetherReadout, el => el.textContent  = `Æ ${s.player?.aether ?? 0}  ◇ ${s.player?.channeled ?? 0}`);
  set(playerPortrait, el=> el.src = s.player?.weaver?.portrait || "./weaver_aria.jpg");
  set(aiPortrait,     el=> el.src = s.ai?.weaver?.portrait     || "./weaver_morr.jpg");
  set(playerName,     el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el=> el.textContent = s.ai?.weaver?.name || "Opponent");

  // mark HUD as drop-targets
  if (hudDiscardBtn) hudDiscardBtn.classList.add("drop-target");
  if (hudDeckBtn)    hudDeckBtn.classList.add("drop-target");

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);
  renderFlow(s.flow);

  // hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
      const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
      const aetherChip = (c.aetherValue>0)
        ? `<div class="aether-chip">${gemSVG()}<span class="val">${c.aetherValue}</span></div>` : "";

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}${c.price?` — Cost ${withAetherText("Æ")}${c.price}`:""}</div>
        <div class="textbox">${withAetherText(c.text||"")}</div>
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
   Wiring
-------------------------------------------------*/
startBtn?.addEventListener("click", ()=>{ render(); });
endBtn?.addEventListener("click", ()=>{ toast("End turn (stub)"); render(); });
$("btn-endturn-hud")?.addEventListener("click", ()=> endBtn?.click());
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", render);
