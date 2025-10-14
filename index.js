import {
  initState, serializePublic,
  playCardToSpellSlot, setGlyphFromHand,
  buyFromFlow, startTurn, endTurn
} from "./GameLogic.js";

/* ------- helpers ------- */
const $ = id => document.getElementById(id);
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");
const aetherReadout = $("aether-readout");
const deckBadge     = $("deck-count");
const discardBadge  = $("discard-count");

const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

const endHudBtn     = $("btn-endturn-hud");
const deckBtn       = $("btn-deck-hud");
const discardBtn    = $("btn-discard-hud");

const btnZoom       = $("btn-board-zoom");
const btnLayout     = $("btn-layout-toggle");

const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

let state = initState({});
document.addEventListener("DOMContentLoaded", ()=>{ state = startTurn(state); render(); });

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

/* ------- tighter hand fan (MTGA-like overlap) ------- */
function getCardW(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--card-w').trim();
  return parseFloat(v.replace('px','')) || 150;
}
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const CARD_W = getCardW();
  const overlap = CARD_W * 0.52;              // how much each card overlaps the previous
  const spread = Math.min(container.clientWidth * 0.78, (N-1)*overlap + CARD_W); // keep hand compact
  const MAX_ANGLE = 20, MIN_ANGLE = 6;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.0, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const stepX = (N===1) ? 0 : spread/(N-1), startX = -spread/2;

  cards.forEach((el,i)=>{
    const a = startAngle + step*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    const y = 36 - Math.cos(rad) * (36*0.75);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ------- peek / zoom ------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}</div>
    <div class="textbox">${data.text||""}</div>
  `;
}
function attachPeekAndZoom(el, data){
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  let longPressTimer=null, pressStart={x:0,y:0};
  const LONG_PRESS_MS=350, MOVE_CANCEL_PX=8;
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
}

/* ------- desktop drag (fixed) ------- */
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    document.body.classList.add("dragging-mode");
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/plain", data.id);     // use standard type
    ev.dataTransfer?.setData("application/x-card-type", data.type);
    // ghost
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    document.body.classList.remove("dragging-mode");
  });
}

/* ------- slots (with glyph) ------- */
function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const slot = safe[i] || {hasCard:false, card:null};
    d.textContent = slot.hasCard ? (slot.card?.name || "Spell") : "Spell Slot";

    if (slot.hasCard && slot.card){ attachPeekAndZoom(d, slot.card); }

    if (isPlayer){
      // IMPORTANT: allow drop unconditionally during dragover (can't read dataTransfer here on Chrome)
      d.addEventListener("dragover", (ev)=>{ ev.preventDefault(); d.classList.add("drag-over"); });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const cardId   = ev.dataTransfer?.getData("text/plain");
        const cardType = ev.dataTransfer?.getData("application/x-card-type");
        if (!cardId || cardType !== "SPELL") return;
        try { state = playCardToSpellSlot(state, "player", cardId, i); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      });
    }
    container.appendChild(d);
  }
  // glyph
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  g.textContent = glyphSlot.hasCard ? (glyphSlot.card?.name || "Glyph") : "Glyph Slot";

  if (glyphSlot.hasCard && glyphSlot.card){ attachPeekAndZoom(g, glyphSlot.card); }

  if (isPlayer){
    g.addEventListener("dragover", (ev)=> { ev.preventDefault(); g.classList.add("drag-over"); });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{ 
      ev.preventDefault(); g.classList.remove("drag-over"); 
      const cardId = ev.dataTransfer?.getData("text/plain");
      const t = ev.dataTransfer?.getData("application/x-card-type");
      if (t!=="GLYPH") return;
      try { state = setGlyphFromHand(state, "player", cardId); render(); }
      catch(err){ toast(err?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ------- Flow ------- */
const FLOW_COSTS = [4,3,3,2,2];
const slotCost = (i)=> FLOW_COSTS[i] ?? 0;
function gemChipHTML(val){
  return `
    <div class="aether-chip" aria-label="Aether cost">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 2l6.6 5.1-2.5 8.3H7.9L5.4 7.1 12 2zM7.9 15.4L12 22l4.1-6.6H7.9z"/>
      </svg>
      <span class="val">${val|0}</span>
    </div>
  `;
}
function flowCardHTML(c, price){
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}</div>
    <div class="textbox">${c.text||""}</div>
    ${gemChipHTML(price)}
  `;
}
function renderFlow(flowSlots){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flowSlots || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const price = slotCost(idx);
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);

    if (c){
      card.innerHTML = flowCardHTML(c, price);
      attachPeekAndZoom(card, {...c});
      card.addEventListener("click", ()=>{
        try{
          const before = state.players.player.aether;
          state = buyFromFlow(state, "player", idx);
          const after  = state.players.player.aether;
          render();
          toast(after < before ? `Bought for Æ${(before-after)}` : "Bought");
        }catch(err){ toast(err?.message || "Cannot buy"); }
      });
    } else {
      card.innerHTML = `<div class="title" style="opacity:.5">Empty</div><div class="type" style="opacity:.5">—</div><div class="textbox"></div>`;
      card.style.opacity = .25; card.style.pointerEvents = "none";
    }
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ------- render ------- */
function ensureSafetyShape(s){
  if (!Array.isArray(s.flowSlots) || s.flowSlots.length!==5){ s.flowSlots = [null,null,null,null,null]; }
  if (!s.player) s.player = {aether:0,channeled:0,hand:[],slots:[],discardCount:0,deckCount:0};
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
  peekEl?.classList.remove("show");

  const s = ensureSafetyShape(serializePublic(state) || {});
  playerPortrait.src = s.player?.weaver?.portrait || "./weaver_aria.jpg";
  aiPortrait.src     = s.ai?.weaver?.portrait     || "./weaver_morr.jpg";
  playerName.textContent = s.player?.weaver?.name || "Player";
  aiName.textContent     = s.ai?.weaver?.name || "Opponent";

  // Æ display and pile badges
  aetherReadout.innerHTML = `<svg class="gem" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l6.6 5.1-2.5 8.3H7.9L5.4 7.1 12 2zM7.9 15.4L12 22l4.1-6.6H7.9z"/></svg><span>${s.player?.aether ?? 0}</span>`;
  deckBadge.textContent = s.player?.deckCount ?? "—";
  discardBadge.textContent = s.player?.discardCount ?? 0;

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);
  renderFlow(s.flowSlots);

  // hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const intrinsicCost = (c.name==="Greyfire Bloom" || c.name==="Surge of Ash" || c.name==="Veil of Dust") ? 1 : 0;
      const costGems = "🜂".repeat(intrinsicCost);

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox">${c.text||""}</div>
        ${intrinsicCost? `<div class="cost">${costGems}</div>` : ""}
      `;

      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, {...c});
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* ------- HUD drop targets (discard for Æ) ------- */
function cardFromHandById(id){
  const H = state.players.player.hand;
  const i = H.findIndex(c => c.id === id);
  return { idx:i, card: H[i] };
}
discardBtn.addEventListener("dragover", (ev)=>{ ev.preventDefault(); discardBtn.classList.add("drop-ready"); });
discardBtn.addEventListener("dragleave", ()=> discardBtn.classList.remove("drop-ready"));
discardBtn.addEventListener("drop", (ev)=>{
  ev.preventDefault(); discardBtn.classList.remove("drop-ready");
  const id = ev.dataTransfer?.getData("text/plain");
  if (!id) return;
  const {idx, card} = cardFromHandById(id);
  if (idx < 0) return;
  // gain Æ equal to aetherValue
  const gain = Number(card.aetherValue || 0);
  state.players.player.aether = (state.players.player.aether || 0) + gain;
  state.players.player.discardCount += 1;
  state.players.player.hand.splice(idx,1);
  // flash gem
  aetherReadout.classList.remove("flash"); void aetherReadout.offsetWidth; aetherReadout.classList.add("flash");
  render();
});

/* ------- End turn -> slide then reveal ------- */
endHudBtn.addEventListener("click", ()=>{
  state = endTurn(state);
  state = startTurn(state);
  render();
});

/* Zoom/Layout toggles (mobile helpers) */
btnZoom?.addEventListener("click", ()=>{
  const on = document.body.classList.toggle("board-zoom75");
  btnZoom.setAttribute("aria-pressed", on ? "true" : "false");
  btnZoom.textContent = on ? "Normal Size" : "Board Zoom";
});
btnLayout?.addEventListener("click", ()=>{
  const on = document.body.classList.toggle("layout-vertflow");
  btnLayout.setAttribute("aria-pressed", on ? "true" : "false");
  btnLayout.textContent = on ? "Flow Bottom" : "Flow Left";
});

/* Misc */
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
