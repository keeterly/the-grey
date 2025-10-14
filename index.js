import { initState, serializePublic, playCardToSpellSlot, setGlyphFromHand, buyFromFlow } from "./GameLogic.js";

/* ------------ tiny helpers ------------ */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

/* ------------ DOM refs ------------ */
const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");

const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

/* bars */
const playerHearts  = $("player-hearts");
const aiHearts      = $("ai-hearts");
const playerGem     = $("player-gem");
const aiGem         = $("ai-gem");
const playerGemCount= $("player-gem-count");
const aiGemCount    = $("ai-gem-count");
const pTrI          = $("p-trance-I");
const pTrII         = $("p-trance-II");
const aTrI          = $("a-trance-I");
const aTrII         = $("a-trance-II");

/* preview/zoom */
const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* buttons */
$("btn-end-turn")?.addEventListener("click", onEndTurn);

let state = initState({});

/* ------------ svg helpers ------------ */
function gemSVG(cls="gem"){ 
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l6 6-6 14L6 8l6-6z"/></svg>`; 
}
function heartSVG(){ 
  return `<svg viewBox="0 0 20 18" aria-hidden="true">
    <path class="heart-stroke" d="M10 16s-6-3.5-8-7.5C.2 4.3 2 2 4.5 2 6.2 2 7.6 3 8.3 4.3 9 3 10.4 2 12 2 14.5 2 16.3 4.3 18 8.5 16 12.5 10 16 10 16z"/>
    <path class="heart-fill" d="M10 15.2S4.7 12.2 2.9 8.8C1.7 6.5 3 4.5 4.9 4.5c1.3 0 2.3.8 2.8 2 .5-1.2 1.5-2 2.8-2 1.8 0 3.3 1.7 2 4.4C12.7 12.2 10 15.2 10 15.2z"/>
  </svg>`;
}

/* ------------ toast ------------ */
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

/* ------------ hand layout (MTGA-like) ------------ */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 22, MIN_ANGLE = 4, MAX_SPREAD_PX = container.clientWidth * 0.70, LIFT_BASE = 40;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.2, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const spread = Math.min(MAX_SPREAD_PX, 760);
  const stepX = (N===1) ? 0 : spread/(N-1), startX = -spread/2;

  cards.forEach((el,i)=>{
    const a = startAngle + step*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    const y = LIFT_BASE - Math.cos(rad) * (LIFT_BASE*0.82);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ------------ peek & zoom ------------ */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  const pip = Math.max(0, Number(data.pip||0));
  const pips = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map((_,i)=>`<span class="pip filled"></span>`).join("")}</div>` : "";
  const chip = (data.aetherValue>0) ? `
    <div class="aether-chip">${gemSVG("gem")}<span class="val">${data.aetherValue}</span></div>` : "";
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}${data.price?` — Cost ${gemSVG("gem")} ${data.price}`:""}</div>
    <div class="textbox">${(data.text||"")}</div>
    ${chip}${pips}
  `;
}
function attachPeekAndZoom(el, data){
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  let tId;
  el.addEventListener("pointerdown", (ev)=>{
    clearTimeout(tId);
    tId = setTimeout(()=>{
      if (zoomOverlayEl && zoomCardEl){ fillCardShell(zoomCardEl, data); zoomOverlayEl.setAttribute("data-open","true"); }
    }, 360);
  }, {passive:true});
  ["pointerup","pointercancel","pointerleave"].forEach(e=> el.addEventListener(e, ()=> clearTimeout(tId), {passive:true}));
}
zoomOverlayEl?.addEventListener("click", closeZoom);
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });

/* ------------ drag & drop ------------ */
function dragifyCard(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);

    // show pulses on legal targets
    document.querySelectorAll('.slot').forEach(s=>{
      const isGlyph = s.classList.contains("glyph");
      if ((data.type==="SPELL" && !isGlyph) || (data.type==="GLYPH" && isGlyph)) s.classList.add("accept");
    });

    // ghost
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    document.querySelectorAll('.slot.accept').forEach(s=> s.classList.remove("accept"));
  });
}

function makeSlotDroppable(dEl, i, isGlyph, isPlayer){
  if (!isPlayer) return; // no drops on opponent
  dEl.addEventListener("dragover", (ev)=>{
    const t = ev.dataTransfer?.getData("text/card-type");
    if ((t==="SPELL" && !isGlyph) || (t==="GLYPH" && isGlyph)){ ev.preventDefault(); dEl.classList.add("accept"); }
  });
  dEl.addEventListener("dragleave", ()=> dEl.classList.remove("accept"));
  dEl.addEventListener("drop", (ev)=>{
    ev.preventDefault(); dEl.classList.remove("accept");
    const cardId   = ev.dataTransfer?.getData("text/card-id");
    const cardType = ev.dataTransfer?.getData("text/card-type");
    if (!cardId) return;

    try{
      if (!isGlyph && cardType==="SPELL"){ state = playCardToSpellSlot(state, "player", cardId, i); render(); return; }
      if ( isGlyph && cardType==="GLYPH"){ state = setGlyphFromHand(state, "player", cardId); render(); return; }
    }catch(err){ toast(err?.message || "Cannot play here"); }
  });
}

/* ------------ render helpers ------------ */
function renderHearts(container, n=5){
  if (!container) return; container.replaceChildren();
  for(let i=0;i<n;i++){ const span = document.createElement("span"); span.innerHTML = heartSVG(); container.appendChild(span); }
}
function renderPortraitBars(){
  renderHearts(playerHearts, 5); renderHearts(aiHearts, 5);
  playerGem.innerHTML = gemSVG("gem"); aiGem.innerHTML = gemSVG("gem");
  playerGemCount.textContent = String(state.players?.player?.aether ?? 0);
  aiGemCount.textContent     = String(state.players?.ai?.aether ?? 0);

  // trance (placeholder active I only)
  [pTrI, aTrI].forEach(el=> el?.classList.add("active"));
  [pTrII, aTrII].forEach(el=> el?.classList.remove("active"));
}

function cardHTML(c){
  const pip = Math.max(0, Number(c.pip||0));
  const pips = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>`<span class="pip filled"></span>`).join("")}</div>` : "";
  const chip = (c.aetherValue>0) ? `<div class="aether-chip">${gemSVG("gem")}<span class="val">${c.aetherValue}</span></div>` : "";
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${c.price?` — Cost ${gemSVG("gem")} ${c.price}`:""}</div>
    <div class="textbox">${c.text||""}</div>
    ${chip}${pips}
  `;
}

function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    const slot = safe[i] || {hasCard:false, card:null};
    if (slot.hasCard && slot.card){
      const inner = document.createElement("article"); inner.className="card"; inner.innerHTML = cardHTML(slot.card);
      attachPeekAndZoom(inner, slot.card);
      d.appendChild(inner);
    }else{
      d.textContent = "Spell Slot";
    }
    makeSlotDroppable(d, i, false, isPlayer);
    container.appendChild(d);
  }
  // glyph
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  if (glyphSlot.hasCard && glyphSlot.card){
    const inner = document.createElement("article"); inner.className="card"; inner.innerHTML = cardHTML(glyphSlot.card);
    attachPeekAndZoom(inner, glyphSlot.card);
    g.appendChild(inner);
  }else{
    g.textContent = "Glyph Slot";
  }
  makeSlotDroppable(g, 3, true, isPlayer);
  container.appendChild(g);
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

    // buy
    card.addEventListener("click", ()=>{
      try{ state = buyFromFlow(state, "player", idx); toast("Bought to discard"); }
      catch(err){ toast(err?.message || "Cannot buy"); }
    });

    const price = document.createElement("div");
    price.className = "flow-price";
    price.innerHTML = `${gemSVG("gem")} <span>${c.price ?? ""}</span> <span>to buy</span>`;

    li.appendChild(card);
    li.appendChild(price);
    flowRowEl.appendChild(li);
  });
}

/* ------------ main render ------------ */
function render(){
  closeZoom(); peekEl?.classList.remove("show");
  const s = serializePublic(state) || {};
  // portraits
  set(playerPortrait, el=> el.src = s.player?.weaver?.portrait || "./weaver_aria.jpg");
  set(aiPortrait,     el=> el.src = s.ai?.weaver?.portrait     || "./weaver_morr.jpg");
  set(playerName,     el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el=> el.textContent = s.ai?.weaver?.name || "Opponent");
  renderPortraitBars();

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
      dragifyCard(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* ------------ end turn ------------ */
function onEndTurn(){
  // discard whole hand (visual)
  const cards = Array.from(handEl?.children || []);
  cards.forEach((el,i)=> setTimeout(()=> { el.style.opacity="0"; el.style.transform += " translateY(180px) rotate(14deg)"; }, i*60));
  setTimeout(()=> toast("End turn (stub)"), 320);
}

window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("DOMContentLoaded", render);





// --- imports: make sure __dev is imported from GameLogic ---
import {
  initState,
  serializePublic,
  playCardToSpellSlot,
  setGlyphFromHand,
  buyFromFlow,
  __dev,                   // <-- add this
} from "./GameLogic.js";

// --- state bootstrap (unchanged) ---
let STATE = initState();
render();

// ========== OPTIONAL animation shims (won’t throw if you don’t have them) ==========
async function animateDiscardAllFromHand() {
  if (window.animations?.discardAllFromHand) {
    await window.animations.discardAllFromHand();
  } else if (window.animations?.discardAll) {
    await window.animations.discardAll();
  } else {
    // tiny pause so the turn change still feels responsive
    await new Promise(r => setTimeout(r, 120));
  }
}
async function animateDrawToHand() {
  if (window.animations?.drawToHand) {
    await window.animations.drawToHand();
  } else if (window.animations?.draw) {
    await window.animations.draw(1);
  } else {
    await new Promise(r => setTimeout(r, 120));
  }
}

// ========== END TURN: real turn logic ==========
// Try either #endTurn or a [data-action="end-turn"] hook, whichever exists.
const endTurnBtn =
  document.getElementById("endTurn") ||
  document.querySelector('[data-action="end-turn"]');

if (endTurnBtn) {
  endTurnBtn.addEventListener("click", onEndTurn);
}

let uiLocked = false;
async function onEndTurn() {
  if (uiLocked) return;
  try {
    uiLocked = true;

    // 1) Discard the whole player hand (visual)
    await animateDiscardAllFromHand();

    // 2) Advance the game (river shifts, AI quick turn, player draws 1)
    //    __dev.endTurn mutates state; return for safety if you prefer immutable
    __dev.endTurn(STATE);

    // 3) Re-render immediately so river/AI updates show
    render();

    // 4) Start-of-turn draw animation for player (optional)
    await animateDrawToHand();

    // 5) Final re-render in case animations altered any temp UI
    render();
  } finally {
    uiLocked = false;
  }
}

// ========== render helper (unchanged, keep your existing one) ==========
function render() {
  const view = serializePublic(STATE);
  // ... your existing DOM update code that consumes `view` ...
}

