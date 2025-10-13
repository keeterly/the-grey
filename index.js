import { initState, serializePublic, playCardToSpellSlot, setGlyphFromHand, buyFromFlow } from "./GameLogic.js";

/* ------- helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");
const aetherReadout = $("aether-readout");
const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

const endHudBtn     = $("btn-endturn-hud");
const btnZoom       = $("btn-board-zoom");
const btnLayout     = $("btn-layout-toggle");

const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

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
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 24, MIN_ANGLE = 6, MAX_SPREAD_PX = container.clientWidth * 0.92, LIFT_BASE = 36;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.6, MIN_ANGLE, MAX_ANGLE);
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

/* ------- preview / zoom ------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}</div>
    <div class="textbox">${data.text||""}</div>
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

/* ------- desktop drag ------- */
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    document.body.classList.add("dragging-mode");
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
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

/* ------- slots ------- */
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
      d.addEventListener("dragover", (ev)=>{ 
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
  // glyph
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  g.textContent = glyphSlot.hasCard ? (glyphSlot.card?.name || "Glyph") : "Glyph Slot";

  if (glyphSlot.hasCard && glyphSlot.card){ attachPeekAndZoom(g, glyphSlot.card); }

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

/* ------- Flow rendering ------- */
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

function flowCardHTML(c){
  const price = (typeof c.price === "number") ? c.price : 0;
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}</div>
    <div class="textbox">${c.text||""}</div>
    ${gemChipHTML(price)}
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
    card.innerHTML = flowCardHTML(c);
    attachPeekAndZoom(card, {...c });

    // click/tap to buy if enough Æ
    card.addEventListener("click", ()=>{
      try{
        const before = state.players.player.aether;
        state = buyFromFlow(state, "player", idx);
        const after  = state.players.player.aether;
        render();
        toast(after < before ? `Bought for Æ${(before-after)}` : "Bought");
      }catch(err){
        toast(err?.message || "Cannot buy");
      }
    });

    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ------- render ------- */
function ensureSafetyShape(s){
  if (!Array.isArray(s.flow) || s.flow.length===0){
    s.flow = [
      {id:"f1",name:"Resonant Chorus",type:"SPELL",price:4,text:"Market spell"},
      {id:"f2",name:"Pulse Feedback",type:"INSTANT",price:3,text:"Instant"},
      {id:"f3",name:"Refracted Will",type:"GLYPH",price:2,text:"Glyph"},
      {id:"f4",name:"Cascade Insight",type:"INSTANT",price:2,text:"Instant"},
      {id:"f5",name:"Obsidian Vault",type:"SPELL",price:2,text:"Spell"},
    ];
  }
  if (!s.player) s.player = {aether:0,channeled:0,hand:[],slots:[]};
  if (!Array.isArray(s.player.hand) || s.player.hand.length===0){
    s.player.hand = [
      {id:"h1",name:"Pulse of the Grey",type:"SPELL",aetherValue:0,text:"Advance 1 (Æ1). On resolve: Draw 1, gain Æ1."},
      {id:"h2",name:"Echoing Reservoir",type:"SPELL",aetherValue:2,text:"Advance 1 (Æ2). On resolve: Channel 1."},
      {id:"h3",name:"Ashen Focus",type:"SPELL",aetherValue:1,text:"Advance 1 (Æ2). On resolve: Channel 1, draw 1."},
      {id:"h4",name:"Veil of Dust",type:"INSTANT",aetherValue:0,text:"Cost Æ1. Prevent 1 or cancel an instant."},
      {id:"h5",name:"Glyph of Remnant Light",type:"GLYPH",aetherValue:0,text:"When a spell resolves: gain Æ1."},
    ];
  }
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
  set(playerPortrait, el=> el.src = s.player?.weaver?.portrait || "./weaver_aria.jpg");
  set(aiPortrait,     el=> el.src = s.ai?.weaver?.portrait     || "./weaver_morr.jpg");
  set(playerName,     el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el=> el.textContent = s.ai?.weaver?.name || "Opponent");

  // Æ display (blue gem)
  if (aetherReadout){
    aetherReadout.innerHTML = `
      <svg class="gem" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l6.6 5.1-2.5 8.3H7.9L5.4 7.1 12 2zM7.9 15.4L12 22l4.1-6.6H7.9z"/></svg>
      <span>${s.player?.aether ?? 0}</span>
    `;
  }

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

      const intrinsicCost = (c.name==="Greyfire Bloom" || c.name==="Surge of Ash" || c.name==="Veil of Dust") ? 1 : 0;
      const costGems = "🜂".repeat(intrinsicCost); // retained for now (hand visual)

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox">${c.text||""}</div>
        ${intrinsicCost? `<div class="cost">${costGems}</div>` : ""}
      `;

      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, {...c, costGems});
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* wiring */
$("btn-endturn-hud")?.addEventListener("click", ()=> toast("End turn (stub)"));
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", render);

/* Toggles */
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