import { initState, serializePublic, playCardToSpellSlot, buyFromFlow } from "./GameLogic.js";

/* ------- helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

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
const playerHearts  = $("player-hearts");
const aiHearts      = $("ai-hearts");

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

/* ------- slots ------- */
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
    d.textContent = slot.hasCard ? (slot.card?.name || "Spell") : "Spell Slot";
    if (isPlayer){
      d.addEventListener("dragover", (ev)=> { ev.preventDefault(); d.classList.add("drag-over"); });
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
  g.textContent = "Glyph Slot";
  container.appendChild(g);
}

/* ------- flow ------- */
function cardHTML(c){
  const price = (typeof c.price === "number") ? c.price : 0;
  const gems = "🜂".repeat(price);
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price?` — Cost Æ ${price}`:""}</div>
    <div class="textbox">${c.text||""}</div>
    <div class="actions"><button class="btn" data-buy="1">Buy (Æ ${price})</button> <span aria-hidden="true">${gems}</span></div>
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
    card.innerHTML = cardHTML(c);
    card.querySelector("[data-buy]")?.addEventListener("click", ()=>{
      try{ state = buyFromFlow(state, "player", idx); toast("Bought to discard"); }
      catch(err){ toast(err?.message || "Cannot buy"); }
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
    <div class="type">${data.type}${data.price?` — Cost Æ ${data.price}`:""}</div>
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

/* ------- safe drag for desktop ------- */
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    // custom ghost snapshot to avoid permanent ghost
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
  });
  el.addEventListener("dragend", ()=> el.classList.remove("dragging"));
}

/* ------- render ------- */
function ensureSafetyShape(s){
  // If external changes gave us empty data, create safe defaults
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
      {id:"h1",name:"Apprentice Bolt",type:"SPELL",aetherValue:0,text:"Starter"},
      {id:"h2",name:"Apprentice Bolt",type:"SPELL",aetherValue:0,text:"Starter"},
      {id:"h3",name:"Apprentice Bolt",type:"SPELL",aetherValue:0,text:"Starter"},
      {id:"h4",name:"Apprentice Bolt",type:"SPELL",aetherValue:0,text:"Starter"},
      {id:"h5",name:"Apprentice Bolt",type:"SPELL",aetherValue:0,text:"Starter"},
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
  set(turnIndicator, el => el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`);
  set(aetherReadout, el => el.textContent  = `Æ ${s.player?.aether ?? 0}  ◇ ${s.player?.channeled ?? 0}`);
  set(playerPortrait, el=> el.src = s.player?.weaver?.portrait || "./weaver_aria.jpg");
  set(aiPortrait,     el=> el.src = s.ai?.weaver?.portrait     || "./weaver_morr.jpg");
  set(playerName,     el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el=> el.textContent = s.ai?.weaver?.name || "Opponent");

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
      const costGems = c.aetherValue>0 ? `Channel ${c.aetherValue} Æ on discard` : "";
      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}${c.aetherValue?` — Æ value ${c.aetherValue}`:""}</div>
        <div class="textbox">${c.text||""}</div>`;
      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* wiring */
startBtn?.addEventListener("click", ()=>{ render(); });
endBtn?.addEventListener("click", ()=>{ toast("End turn (stub)"); });
$("btn-endturn-hud")?.addEventListener("click", ()=> endBtn?.click());
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", render);
