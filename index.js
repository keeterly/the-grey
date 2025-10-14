import {
  initState,
  serializePublic,
  playCardToSpellSlot,
  setGlyphFromHand,
  buyFromFlow
} from "./GameLogic.js";

/* ========== DOM ========== */
const $ = (id) => document.getElementById(id);
const startBtn      = $("btn-start-turn");
const endBtn        = $("btn-end-turn");
const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const flowCostsEl   = $("flow-prices");
const handEl        = $("hand");
const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");
const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

let state = initState({});

/* ========== helpers ========== */
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const gemSVG = `<svg class="gem" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l6 6-6 14L6 8l6-6z"/></svg>`;
const heartSVG = (on=true)=>`
  <svg viewBox="0 0 24 24" class="heart ${on?"":"off"}" aria-hidden="true">
    <path fill="#e67a7a" d="M12 21s-6.7-4.41-9.33-8.05C.55 10.28 1.24 7.3 3.7 6.22 5.4 5.45 7.23 5.95 8.5 7.2L12 10.7l3.5-3.5c1.27-1.25 3.1-1.75 4.8-.98 2.46 1.08 3.15 4.06 1.03 6.73C18.7 16.59 12 21 12 21z"/>
  </svg>
`;

function toastMsg(){
  let t = document.querySelector(".toast");
  if (!t){ t = document.createElement("div"); t.className="toast"; document.body.appendChild(t); }
  return t;
}
function toast(msg, ms=1200){
  const t = toastMsg();
  t.textContent = msg; t.classList.add("show");
  setTimeout(()=> t.classList.remove("show"), ms);
}

/* ========== safe flow normalization ========== */
const FLOW_COSTS = [4,3,3,2,2];

function normalizeFlow(flow){
  const arr = Array.isArray(flow) ? flow.slice(0,5) : [];
  for (let i=0;i<5;i++){
    if (!arr[i] || typeof arr[i] !== "object"){
      arr[i] = { id:`empty_${i}`, name:"Empty", type:"—", text:"", price:FLOW_COSTS[i], aetherValue:0, pips:0 };
    } else {
      arr[i].price = Number(arr[i].price ?? FLOW_COSTS[i]);
      arr[i].aetherValue = Number(arr[i].aetherValue ?? 0);
      arr[i].pips = Number(arr[i].pips ?? 0);
    }
  }
  return arr;
}

/* ========== hand fanning ========== */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  // tighter MTGArena-like fan (not full-justify)
  const MAX_ANGLE = 20, MIN_ANGLE = 6, MAX_SPREAD_PX = Math.min(container.clientWidth * 0.72, 820), LIFT_BASE = 36;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.25, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const spread = Math.min(MAX_SPREAD_PX, 820);
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

/* ========== preview / zoom ========== */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data={}){
  if (!div) return;
  const price = Number(data?.price ?? 0);
  const gemCost = price ? ` — Cost ${gemSVG} ${price}` : "";
  const pips = Number(data?.pips ?? 0);
  const pipRow = pips>0 ? `<div class="pip-track">${Array.from({length:pips}).map(()=>`<span class="pip"></span>`).join("")}</div>` : "";
  const av = Number(data?.aetherValue ?? 0);
  const chip = av>0 ? `<div class="aether-chip">${gemSVG}<span class="val">${av}</span></div>` : "";
  div.innerHTML = `
    <div class="title">${data?.name ?? "Empty"}</div>
    <div class="type">${data?.type ?? "—"}${gemCost}</div>
    <div class="textbox">${data?.text ?? ""}</div>
    ${chip}${pipRow}
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

/* ========== desktop drag ========== */
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    // ghost
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
    // enable slot pulses for valid targets
    pulseValidTargets(data.type, true);
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    pulseValidTargets(data.type, false);
  });
}
function pulseValidTargets(cardType, on){
  const spells = document.querySelectorAll(".slot.spell");
  const glyph  = document.querySelectorAll(".slot.glyph");
  if (cardType==="SPELL"){
    spells.forEach(n=> n.classList.toggle("pulse", on));
    glyph.forEach(n=> n.classList.remove("pulse"));
  } else if (cardType==="GLYPH"){
    glyph.forEach(n=> n.classList.toggle("pulse", on));
    spells.forEach(n=> n.classList.remove("pulse"));
  } else {
    spells.forEach(n=> n.classList.remove("pulse"));
    glyph.forEach(n=> n.classList.remove("pulse"));
  }
}

/* ========== slots (with glyph support) ========== */
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

    if (slot.hasCard && slot.card){
      attachPeekAndZoom(d, slot.card);
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
  // glyph
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  g.textContent = glyphSlot.hasCard ? (glyphSlot.card?.name || "Glyph") : "Glyph Slot";

  if (glyphSlot.hasCard && glyphSlot.card){
    attachPeekAndZoom(g, glyphSlot.card);
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

/* ========== Flow row ========== */
function cardHTML(c = {}) {
  const price = Number(c?.price ?? 0);
  const chip =
    c?.aetherValue > 0
      ? `<div class="aether-chip">${gemSVG}<span class="val">${c.aetherValue}</span></div>`
      : "";
  const pips =
    c?.pips > 0
      ? `<div class="pip-track">${Array.from({ length: c.pips })
          .map(() => `<span class="pip"></span>`)
          .join("")}</div>`
      : "";

  return `
    <div class="title">${c?.name ?? "Empty"}</div>
    <div class="type">${c?.type ?? "—"}${price?` — Cost ${gemSVG} ${price}`:""}</div>
    <div class="textbox">${c?.text || ""}</div>
    ${chip}${pips}
  `;
}

function renderFlow(flowArray){
  if (!flowRowEl) return;
  const flow = normalizeFlow(flowArray);

  flowRowEl.replaceChildren();
  flow.forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c);
    attachPeekAndZoom(card, c);

    // click to buy if not empty
    card.addEventListener("click", ()=>{
      if (c?.name === "Empty") return;
      const price = Number(c?.price ?? 0);
      const have = Number(state?.players?.player?.aether ?? 0);
      if (have < price){ toast("Not enough Aether"); return; }
      try{
        state = buyFromFlow(state, "player", idx);
        toast(`Bought ${c.name} → discard`);
        render();
      }catch(err){ toast(err?.message || "Cannot buy"); }
    });

    li.appendChild(card);
    flowRowEl.appendChild(li);
  });

  // cost labels
  if (flowCostsEl){
    flowCostsEl.replaceChildren();
    FLOW_COSTS.forEach((v)=>{
      const tag = document.createElement("div");
      tag.className = "price-label";
      tag.innerHTML = `${gemSVG} ${v} to buy`;
      flowCostsEl.appendChild(tag);
    });
  }
}

/* ========== Portrait HUD render ========== */
function renderPortrait(elImg, nameEl, side, pdata){
  if (!pdata) return;
  if (elImg){
    // allow your portrait file naming; no flip here (use CSS transform if you want)
    elImg.src = side==="player" ? "./weaver_aria.jpg" : "./weaver_morr.jpg";
  }
  if (nameEl){ nameEl.textContent = side==="player" ? (pdata?.weaver?.name || "Player") : (pdata?.weaver?.name || "Opponent"); }

  // hearts + aether + trance block
  const container = nameEl?.parentElement; // <figure class="portrait">
  if (!container) return;

  // hearts row (5 hearts from your STARTING_VITALITY proxy)
  let heartsRow = container.querySelector(".hearts");
  if (!heartsRow){ heartsRow = document.createElement("div"); heartsRow.className="hearts"; container.appendChild(heartsRow); }
  heartsRow.innerHTML = "";
  const vitality = Number(pdata?.vitality ?? 5);
  for (let i=0;i<5;i++) heartsRow.insertAdjacentHTML("beforeend", heartSVG(i < vitality));

  // meters
  let meters = container.querySelector(".meters");
  if (!meters){ meters = document.createElement("div"); meters.className="meters"; container.appendChild(meters); }
  meters.replaceChildren();

  // aether line (3× gem visual)
  const aLine = document.createElement("div");
  aLine.className = "meter-row";
  aLine.innerHTML = `<span class="ico">${gemSVG}</span><span class="val">${Number(pdata?.aether ?? 0)}</span>`;
  meters.appendChild(aLine);

  // trance I / II stacked (roman numerals)
  const tCol = document.createElement("div"); tCol.className="trance-col";
  const t1 = document.createElement("div"); t1.textContent = "I";
  const t2 = document.createElement("div"); t2.textContent = "II";
  t1.className="active"; // placeholder default
  tCol.appendChild(t1); tCol.appendChild(t2);
  meters.appendChild(tCol);
}

/* ========== Flow river step (safe) ========== */
function advanceFlowRiver(){
  state.flow = normalizeFlow(state.flow);
  // shift right
  for (let i=4;i>0;i--) state.flow[i] = state.flow[i-1];
  // simple random front card
  const pool = [
    { id:"res_chor", name:"Resonant Chorus", type:"SPELL", text:`On Resolve: Gain 2 ${gemSVG}, Channel 1`, price:FLOW_COSTS[0], aetherValue:1, pips:1 },
    { id:"pulse_fb", name:"Pulse Feedback", type:"INSTANT", text:"Advance all Spells you control by 1", price:FLOW_COSTS[0], aetherValue:0, pips:0 },
    { id:"fract_mem", name:"Fractured Memory", type:"SPELL", text:"On Resolve: Draw 2 cards", price:FLOW_COSTS[0], aetherValue:0, pips:2 },
  ];
  state.flow[0] = structuredClone(pool[Math.floor(Math.random()*pool.length)]);
}

/* ========== Safety shape (keeps prior demo content intact) ========== */
function ensureShape(s){
  s.flow = normalizeFlow(s.flow);

  if (!s.player) s.player = {aether:0, channeled:0, hand:[], slots:[]};
  if (!Array.isArray(s.player.hand) || s.player.hand.length===0){
    s.player.hand = [
      {id:"h1", name:"Pulse of the Grey", type:"SPELL", aetherValue:0, pips:1, text:`On Resolve: Draw 1, gain ${gemSVG} 1`},
      {id:"h2", name:"Echoing Reservoir", type:"SPELL", aetherValue:2, pips:1, text:"On Resolve: Channel 1"},
      {id:"h3", name:"Ashen Focus", type:"SPELL", aetherValue:1, pips:1, text:"On Resolve: Channel 1, Draw 1"},
      {id:"h4", name:"Veil of Dust", type:"INSTANT", aetherValue:0, pips:0, text:`Cost ${gemSVG} 1. Prevent 1 or cancel an instant.`},
      {id:"h5", name:"Glyph of Remnant Light", type:"GLYPH", aetherValue:0, pips:0, text:`When a spell resolves → gain ${gemSVG} 1.`},
    ];
  }
  if (!Array.isArray(s.player.slots) || s.player.slots.length<4){
    s.player.slots = [
      {hasCard:false,card:null},{hasCard:false,card:null},{hasCard:false,card:null},
      {isGlyph:true,hasCard:false,card:null}
    ];
  }
  if (!s.ai) s.ai = {weaver:{name:"Opponent"}, vitality:5, aether:0};

  return s;
}

/* ========== render() ========== */
function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  const s = ensureShape(serializePublic(state) || {});
  // reflect normalized flow in state to keep it stable
  state.flow = s.flow;

  renderPortrait(playerPortrait, playerName, "player", s.player);
  renderPortrait(aiPortrait, aiName, "ai", s.ai);

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

      const p = 0; // intrinsic play cost displayed inline if you add one
      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}${p?` — Cost ${gemSVG} ${p}`:""}</div>
        <div class="textbox">${c.text||""}</div>
        ${c.aetherValue>0? `<div class="aether-chip">${gemSVG}<span class="val">${c.aetherValue}</span></div>` : ""}
        ${c.pips>0? `<div class="pip-track">${Array.from({length:c.pips}).map(()=>`<span class="pip"></span>`).join("")}</div>`:""}
      `;

      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* wiring */
startBtn?.addEventListener("click", ()=>{ render(); });
endBtn?.addEventListener("click", ()=>{
  // simple river step + redraw
  advanceFlowRiver();
  toast("End turn");
  render();
});

$("btn-endturn-hud")?.addEventListener("click", ()=> endBtn?.click());
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", render);
