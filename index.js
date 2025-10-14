// v2.53 — restore drag/drop, HUD hearts/gems/trance, turn cycle with animations

import {
  initState, serializePublic,
  playCardToSpellSlot, setGlyphFromHand, buyFromFlow
} from "./GameLogic.js";

/* ------- helpers ------- */
const $  = id => document.getElementById(id);
const set= (el,fn)=>{ if(el) fn(el); };
const clamp=(v,min,max)=> Math.max(min, Math.min(max, v));

/* DOM refs */
const handEl        = $("hand");
const flowRowEl     = $("flow-row");
const flowCostsEl   = $("flow-costs");
const playerSlotsEl = $("player-slots");
const aiSlotsEl     = $("ai-slots");
const endTurnBtn    = $("btn-endturn-hud");
const discardBtn    = $("btn-discard-hud");
const deckBtn       = $("btn-deck-hud");

const playerAether  = $("player-aether");
const aiAether      = $("ai-aether");
const playerHearts  = $("player-hearts");
const aiHearts      = $("ai-hearts");

/* zoom/peek */
const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* state */
let state = initState();

/* tiny toast */
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

/* ------- HUD ------- */
function renderHearts(container, value=5){
  if (!container) return;
  const N = clamp(value, 0, 5);
  [...container.children].forEach((child, i)=> {
    child.classList.toggle("on", i < N);
  });
}
function renderHUD(s){
  set(playerAether, el=> el.textContent = String(s.player?.aether ?? 0));
  set(aiAether,      el=> el.textContent = String(s.ai?.aether ?? 0));
  renderHearts(playerHearts, s.player?.vitality ?? 5);
  renderHearts(aiHearts,     s.ai?.vitality ?? 5);
}

/* ------- preview / zoom ------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  const pipHtml = (data.pips && data.pips>0)
    ? `<div class="pip-track">${Array.from({length:data.pips}).map(()=> `<span class="pip"></span>`).join("")}</div>` : "";
  const aetherChip = (data.aetherValue && data.aetherValue>0)
    ? `<div class="aether-chip"><svg class="gem" viewBox="0 0 24 24"><path d="M12 2l6 6-6 14L6 8l6-6z"/></svg><span class="val">${data.aetherValue}</span></div>` : "";
  div.innerHTML = `
    <div class="title">${data.name||""}</div>
    <div class="type">${data.type||""}${data.price?` — Cost <svg class="gem" viewBox="0 0 24 24"><path d="M12 2l6 6-6 14L6 8l6-6z"/></svg> ${data.price}`:""}</div>
    <div class="textbox">${data.text||""}</div>
    ${aetherChip}${pipHtml}
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
zoomOverlayEl?.addEventListener("click", closeZoom);

/* ------- hand fanning (compact like MTGA) ------- */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 18, MIN_ANGLE = 6, SPREAD = Math.min(container.clientWidth * 0.72, 720);
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.1, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const stepX = (N===1) ? 0 : SPREAD/(N-1), startX = -SPREAD/2;
  const LIFT = 36;

  cards.forEach((el,i)=>{
    const a = startAngle + step*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    const y = LIFT - Math.cos(rad) * (LIFT*0.75);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ------- drag helpers ------- */
function highlightEligibleSlots(cardType, on){
  const targets = [];
  if (cardType === "SPELL"){
    targets.push(...playerSlotsEl.querySelectorAll(".slot.spell"));
  }else if (cardType === "GLYPH"){
    const g = playerSlotsEl.querySelector(".slot.glyph");
    if (g) targets.push(g);
  }
  targets.forEach(t => t.classList.toggle("pulse", !!on));
}

function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    highlightEligibleSlots(data.type, true);

    // temporary ghost
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    highlightEligibleSlots(data.type, false);
  });
}

/* ------- Slots (render + drop) ------- */
function slotDiv(kind){ const d = document.createElement("div"); d.className = `slot ${kind}`; return d; }

function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];

  // 3 spell + 1 glyph
  for (let i=0;i<3;i++){
    const d = slotDiv("spell");
    const slot = safe[i] || {hasCard:false, card:null};
    d.textContent = slot.hasCard ? (slot.card?.name || "Spell") : "Spell Slot";

    if (slot.hasCard && slot.card) attachPeekAndZoom(d, slot.card);

    if (isPlayer){
      d.addEventListener("dragover", (ev)=> {
        const t = ev.dataTransfer?.getData("text/card-type");
        if (t==="SPELL" && !slot.hasCard){ ev.preventDefault(); d.classList.add("drag-over"); }
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const cardId   = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL" || slot.hasCard) return;
        try { state = playCardToSpellSlot(state, "player", cardId, i); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      });
    }
    container.appendChild(d);
  }

  // glyph
  const g = slotDiv("glyph");
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  g.textContent = glyphSlot.hasCard ? (glyphSlot.card?.name || "Glyph") : "Glyph Slot";
  if (glyphSlot.hasCard && glyphSlot.card) attachPeekAndZoom(g, glyphSlot.card);

  if (isPlayer){
    g.addEventListener("dragover", (ev)=> {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH" && !glyphSlot.hasCard){ ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{ 
      ev.preventDefault(); g.classList.remove("drag-over");
      const cardId = ev.dataTransfer?.getData("text/card-id");
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t!=="GLYPH" || glyphSlot.hasCard) return;
      try { state = setGlyphFromHand(state, "player", cardId); render(); }
      catch(err){ toast(err?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ------- Flow ------- */
function cardHTML(c){
  const price = (typeof c.price === "number") ? c.price : 0;
  const aetherChip = (c.aetherValue && c.aetherValue>0)
    ? `<div class="aether-chip"><svg class="gem" viewBox="0 0 24 24"><path d="M12 2l6 6-6 14L6 8l6-6z"/></svg><span class="val">${c.aetherValue}</span></div>` : "";
  const pips = (c.pips && c.pips>0)
    ? `<div class="pip-track">${Array.from({length:c.pips}).map(()=> `<span class="pip"></span>`).join("")}</div>` : "";
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price?` — Cost <svg class="gem" viewBox="0 0 24 24"><path d="M12 2l6 6-6 14L6 8l6-6z"/></svg> ${price}`:""}</div>
    <div class="textbox">${c.text||""}</div>
    ${aetherChip}${pips}
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
    attachPeekAndZoom(card, c);

    card.addEventListener("click", ()=>{
      const price = c.price||0;
      if ((state.players.player?.aether ?? 0) < price){ toast("Not enough Aether"); return; }
      try {
        state = buyFromFlow(state, "player", idx);
        toast(`Bought ${c.name} → discard`);
        render();
      } catch(e){ toast(e?.message||"Cannot buy"); }
    });

    li.appendChild(card);
    flowRowEl.appendChild(li);
  });

  // cost labels under slots
  if (flowCostsEl){
    flowCostsEl.replaceChildren();
    const costs = [4,3,3,2,2];
    costs.forEach((v)=>{
      const tag = document.createElement("div");
      tag.className = "price-label";
      tag.innerHTML = `<svg class="gem" viewBox="0 0 24 24"><path d="M12 2l6 6-6 14L6 8l6-6z"/></svg> ${v} to buy`;
      flowCostsEl.appendChild(tag);
    });
  }
}

/* ------- discard drop target ------- */
function wireDiscardDrop(){
  if (!discardBtn) return;
  discardBtn.addEventListener("dragover", (ev)=> {
    const t = ev.dataTransfer?.getData("text/card-type");
    if (t==="SPELL" || t==="INSTANT" || t==="GLYPH"){ ev.preventDefault(); discardBtn.classList.add("drop-ready"); }
  });
  ["dragleave","dragend"].forEach(evName=> discardBtn.addEventListener(evName, ()=> discardBtn.classList.remove("drop-ready")));
  discardBtn.addEventListener("drop", (ev)=>{
    ev.preventDefault(); discardBtn.classList.remove("drop-ready");
    const cardId   = ev.dataTransfer?.getData("text/card-id");
    const cardType = ev.dataTransfer?.getData("text/card-type");
    if (!cardId) return;
    // gain aether if card has aetherValue
    const P = state.players.player;
    const idx = P.hand.findIndex(c=> c.id===cardId);
    if (idx>=0){
      const c = P.hand[idx];
      const gain = c.aetherValue||0;
      P.aether = (P.aether||0) + gain;
      P.discardCount += 1;
      P.hand.splice(idx,1);
      render();
      toast(gain>0?`+${gain} Aether`:"Discarded");
    }
  });
}

/* ------- Render root ------- */
function ensureShape(s){
  // fallback shape guards (kept light)
  if (!Array.isArray(s.flow)) s.flow=[];
  if (!s.player) s.player = {aether:0, vitality:5, hand:[], slots:[]};
  if (!s.ai) s.ai = {aether:0, vitality:5, slots:[]};
  return s;
}

function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  const s = ensureShape(serializePublic(state) || {});

  // HUD
  renderHUD(s);

  // slots & flow
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
      el.innerHTML = cardHTML(c);
      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* ------- Turn cycle ------- */
function animateDiscardHandAndThen(fn){
  const cards = Array.from(handEl?.children || []);
  if (!cards.length){ fn(); return; }
  cards.forEach((c,i)=> setTimeout(()=> c.classList.add("animate-discard"), i*40));
  setTimeout(fn, 520 + cards.length*40);
}

function drawNewHand(n=5){
  const P = state.players.player;
  // super light stub: take from deckCount and create fresh copies from starter pool if needed
  while (P.hand.length < n){
    if (P.deckCount>0){ P.deckCount--; }
    // Just clone one of starter examples to show draw animation
    const sample = { id:`draw_${Math.random().toString(36).slice(2)}`, name:"Pulse of the Grey", type:"SPELL", aetherValue:0, text:"On Resolve: Draw 1, gain <svg class='gem' viewBox='0 0 24 24'><path d='M12 2l6 6-6 14L6 8l6-6z'/></svg>1.", pips:1 };
    P.hand.push(sample);
  }
  render();
  // add draw animation
  Array.from(handEl?.children || []).forEach((c,i)=> setTimeout(()=> c.classList.add("animate-draw"), i*40));
}

function advanceFlowRiver(){
  // move left→right (revealed slides down). Very light placeholder: if less than 1 card at [0], reveal one from a small pool.
  const costs = [4,3,3,2,2];
  if (state.flow.length<5){
    // pad empty
    state.flow = Array.from({length:5}, (_,i)=> state.flow[i] || { id:`empty_${i}`, name:"Empty", type:"—", text:"", price:costs[i] });
  }
  // shift right
  for (let i=4;i>0;i--) state.flow[i] = state.flow[i-1];
  // reveal a new random card into [0] (simple examples)
  const pool = [
    {id:"res_chor",name:"Resonant Chorus",type:"SPELL",text:"On Resolve: Gain 2 <svg class='gem' viewBox='0 0 24 24'><path d='M12 2l6 6-6 14L6 8l6-6z'/></svg>, Channel 1", price:costs[0], aetherValue:1, pips:1},
    {id:"pulse_fb",name:"Pulse Feedback",type:"INSTANT",text:"Advance all Spells you control by 1", price:costs[0], aetherValue:0, pips:0},
  ];
  state.flow[0] = structuredClone(pool[Math.floor(Math.random()*pool.length)]);
}

function doAiTurnStub(){
  // super simple AI stub (no-op with aether +1)
  state.players.ai.aether = (state.players.ai.aether||0) + 1;
}

endTurnBtn?.addEventListener("click", ()=>{
  // discard whole hand, then AI, then draw new hand, advance river
  animateDiscardHandAndThen(()=>{
    const P = state.players.player;
    state.players.player.discardCount += (P.hand?.length||0);
    P.hand = [];
    advanceFlowRiver();
    doAiTurnStub();
    drawNewHand(5);
  });
});

/* wire discard target */
wireDiscardDrop();

/* initial render */
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", render);
