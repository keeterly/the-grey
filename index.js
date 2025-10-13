import { initState, serializePublic, playCardToSpellSlot, setGlyphFromHand, buyFromFlow } from "./GameLogic.js";

/* ------- helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");

const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");
const playerAether  = $("player-aether");
const playerAetherVal = $("player-aether-val");
const deckCountEl   = $("deck-count");

const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

const hudDiscard    = $("btn-discard-hud");
const hudEnd        = $("btn-endturn-hud");

let state = initState({});
let prevAether = 0;

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
function gemSVG(){ return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L21 9l-9 13L3 9l9-7zM7 9l5 11L17 9H7z"/></svg>`; }
function getAetherValue(card){ return (typeof card?.aetherValue === "number") ? card.aetherValue : 0; }
function getPipRequirement(card){
  const t = (card?.text || "").toString();
  const m = t.match(/Advance\s+(\d+)/i);
  const n = m ? parseInt(m[1], 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function pipTrackHTML(req, cur=0){
  if (!req || req < 1) return "";
  const safeCur = Math.max(0, Math.min(cur|0, req));
  let dots = "";
  for (let i=0;i<req;i++){
    const filled = i < safeCur ? "filled" : "";
    dots += `<span class="pip ${filled}"></span>`;
  }
  return `<div class="pip-track" aria-label="Pip track (${safeCur}/${req})">${dots}</div>`;
}
function aetherChipHTML(val){
  if (!val || val < 1) return "";
  return `<div class="aether-chip" title="Aether gained when discarded">${gemSVG()}<span class="val">${val}</span></div>`;
}
function fillCardShell(div, data){
  if (!div) return;
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}${data.price?` — Cost Æ ${data.price}`:""}</div>
    <div class="textbox">${data.text||""}</div>
    ${aetherChipHTML(getAetherValue(data))}
    ${pipTrackHTML(getPipRequirement(data), data.currentPips || 0)}
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

/* ------- DnD payload helpers (desktop) ------- */
function setDragPayload(dt, id, type){
  if (!dt) return;
  dt.setData("text/plain", `card:${id}:${type}`);
  dt.setData("text/card-id", id);
  dt.setData("text/card-type", type);
  dt.effectAllowed = "move";
}
function getDragPayload(dt){
  const plain = dt?.getData("text/plain") || "";
  const id = dt?.getData("text/card-id") || (plain.startsWith("card:") ? plain.split(":")[1] : "");
  const type = dt?.getData("text/card-type") || (plain.startsWith("card:") ? plain.split(":")[2] : "");
  return { id, type };
}

/* ------- Desktop draggable ------- */
function makeDesktopDraggable(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    document.body.classList.add("dragging-mode");
    el.classList.add("dragging");
    setDragPayload(ev.dataTransfer, data.id, data.type);
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
  });
  el.addEventListener("dragend", ()=>{
    document.body.classList.remove("dragging-mode");
    el.classList.remove("dragging");
  });
}

/* ------- Touch/mobile drag (custom) ------- */
function makeTouchDraggable(el, data){
  let dragging = false, ghost = null, curTarget = null;

  function clearTargetGlow(){
    document.querySelectorAll(".slot.drag-over").forEach(n=> n.classList.remove("drag-over"));
    document.querySelectorAll(".drop-target.drop-ready").forEach(n=> n.classList.remove("drop-ready"));
  }

  el.addEventListener("pointerdown", (ev)=>{
    if (ev.pointerType !== "touch") return; // desktop uses native DnD
    ev.preventDefault();
    const startX = ev.clientX, startY = ev.clientY;
    let started = false;

    const onMove = (mv)=>{
      const dx = mv.clientX - startX, dy = mv.clientY - startY;
      if (!started && Math.hypot(dx,dy) > 6){
        // start drag
        started = true; dragging = true;
        document.body.classList.add("dragging-mode");
        el.classList.add("touch-dragging");
        ghost = el.cloneNode(true);
        ghost.style.position = "fixed";
        ghost.style.left = "0px";
        ghost.style.top  = "0px";
        ghost.style.zIndex = "99999";
        ghost.style.pointerEvents = "none";
        ghost.style.transform = "translate(-50%,-50%)";
        document.body.appendChild(ghost);
      }
      if (!dragging) return;

      // move ghost
      ghost.style.left = `${mv.clientX}px`;
      ghost.style.top  = `${mv.clientY}px`;

      // find target under finger
      clearTargetGlow();
      const elUnder = document.elementFromPoint(mv.clientX, mv.clientY);
      const slot = elUnder?.closest?.(".slot");
      const discardBtn = elUnder?.closest?.("#btn-discard-hud");
      curTarget = null;

      if (slot){
        const isGlyph = slot.classList.contains("glyph");
        const can = (data.type === "SPELL" && slot.classList.contains("spell")) ||
                    (data.type === "GLYPH" && isGlyph);
        if (can){ slot.classList.add("drag-over"); curTarget = slot; }
      } else if (discardBtn){
        discardBtn.classList.add("drop-ready"); curTarget = discardBtn;
      }
    };

    const onUp = (up)=>{
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      clearTargetGlow();

      if (ghost) ghost.remove();
      ghost = null;
      el.classList.remove("touch-dragging");
      document.body.classList.remove("dragging-mode");

      if (!dragging) return;
      dragging = false;

      // drop action
      if (!curTarget) return;

      if (curTarget.id === "btn-discard-hud"){
        // discard for Æ
        discardCardById(data.id);
        return;
      }

      if (curTarget.classList.contains("slot")){
        const idx = Number(curTarget.dataset.slotIndex ?? -1);
        try{
          if (curTarget.classList.contains("glyph")){
            state = setGlyphFromHand(state, "player", data.id);
          }else{
            state = playCardToSpellSlot(state, "player", data.id, idx);
          }
          render();
        }catch(err){ toast(err?.message || "Can't play"); }
      }
    };

    window.addEventListener("pointermove", onMove, {passive:false});
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }, {passive:false});
}

function discardCardById(cardId){
  const hand = state.players?.player?.hand || [];
  const i = hand.findIndex(c => c.id === cardId);
  if (i < 0){ toast("Card not in hand"); return; }
  const card = hand[i];
  const gain = getAetherValue(card);
  hand.splice(i,1);
  state.players.player.discardCount = (state.players.player.discardCount|0) + 1;
  const before = state.players.player.aether|0;
  const after  = before + (gain|0);
  state.players.player.aether = after;
  if (after > before){ triggerAetherFlash(); }
  toast(gain ? `Discarded for Æ${gain}` : "Discarded");
  render();
}

/* ------- slots (desktop target listeners; touch uses custom hover) ------- */
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
      d.innerHTML = `
        <div class="title">${slot.card.name}</div>
        <div class="type">${slot.card.type}</div>
        <div class="textbox">${slot.card.text||""}</div>
        ${aetherChipHTML(getAetherValue(slot.card))}
        ${pipTrackHTML(getPipRequirement(slot.card), slot.card.currentPips || 0)}
      `;
      attachPeekAndZoom(d, slot.card);
    } else {
      d.textContent = "Spell Slot";
    }

    if (isPlayer){
      d.addEventListener("dragenter", (ev)=>{
        const { type } = getDragPayload(ev.dataTransfer);
        if (type === "SPELL"){ ev.preventDefault(); ev.dataTransfer.dropEffect="move"; d.classList.add("drag-over"); }
      });
      d.addEventListener("dragover", (ev)=>{
        const { type } = getDragPayload(ev.dataTransfer);
        if (type === "SPELL"){ ev.preventDefault(); ev.dataTransfer.dropEffect="move"; d.classList.add("drag-over"); }
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const { id, type } = getDragPayload(ev.dataTransfer);
        if (!id || type !== "SPELL") return;
        try { state = playCardToSpellSlot(state, "player", id, i); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      });
    }
    container.appendChild(d);
  }

  // glyph
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  if (glyphSlot.hasCard && glyphSlot.card){
    g.innerHTML = `
      <div class="title">${glyphSlot.card.name}</div>
      <div class="type">${glyphSlot.card.type}</div>
      <div class="textbox">${glyphSlot.card.text||""}</div>`;
    attachPeekAndZoom(g, glyphSlot.card);
  } else {
    g.textContent = "Glyph Slot";
  }

  if (isPlayer){
    g.addEventListener("dragenter", (ev)=>{
      const { type } = getDragPayload(ev.dataTransfer);
      if (type === "GLYPH"){ ev.preventDefault(); ev.dataTransfer.dropEffect="move"; g.classList.add("drag-over"); }
    });
    g.addEventListener("dragover", (ev)=>{
      const { type } = getDragPayload(ev.dataTransfer);
      if (type === "GLYPH"){ ev.preventDefault(); ev.dataTransfer.dropEffect="move"; g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{
      ev.preventDefault(); g.classList.remove("drag-over");
      const { id, type } = getDragPayload(ev.dataTransfer);
      if (type !== "GLYPH") return;
      try { state = setGlyphFromHand(state, "player", id); render(); }
      catch(err){ toast(err?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ------- flow (market) ------- */
function cardHTML(c){
  const price = (typeof c.price === "number") ? c.price : 0;
  const gems = "🜂".repeat(price);
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price?` — Cost Æ ${price}`:""}</div>
    <div class="textbox">${c.text||""}</div>
    <div class="cost" style="right:10px; left:auto;">${gems}</div>
    ${aetherChipHTML(getAetherValue(c))}
    ${pipTrackHTML(getPipRequirement(c), c.currentPips || 0)}
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
    attachPeekAndZoom(card, {...c, costGems:"🜂".repeat(c.price||0) });

    card.addEventListener("click", ()=>{
      try{ state = buyFromFlow(state, "player", idx); toast("Bought to discard"); }
      catch(err){ toast(err?.message || "Cannot buy"); }
    });

    li.appendChild(card);
    const priceLabel = document.createElement("div");
    priceLabel.className = "price-label";
    priceLabel.textContent = `Æ ${c.price ?? 0} to buy`;
    li.appendChild(priceLabel);
    flowRowEl.appendChild(li);
  });
}

/* ------- discard drop (desktop) ------- */
function handleDiscardDragOver(ev){
  const { id } = getDragPayload(ev.dataTransfer);
  if (id){ ev.preventDefault(); ev.dataTransfer.dropEffect="move"; hudDiscard.classList.add("drop-ready"); }
}
function handleDiscardLeave(){ hudDiscard.classList.remove("drop-ready"); }
function handleDiscardDrop(ev){
  ev.preventDefault();
  hudDiscard.classList.remove("drop-ready");
  const { id } = getDragPayload(ev.dataTransfer);
  if (!id) return;
  discardCardById(id);
}

/* ------- flash + render ------- */
function triggerAetherFlash(){
  if (!playerAether) return;
  playerAether.classList.remove("flash");
  void playerAether.offsetWidth;
  playerAether.classList.add("flash");
}

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
  if (!s.player) s.player = {aether:0,channeled:0,hand:[],slots:[],weaver:{},deckCount:0};
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

  const s = ensureSafetyShape(serializePublic(state) || {});
  set(playerPortrait, el=> el.src = s.player?.weaver?.portrait || "./weaver_aria.jpg");
  set(aiPortrait,     el=> el.src = s.ai?.weaver?.portrait     || "./weaver_morr.jpg");
  set(playerName,     el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el=> el.textContent = s.ai?.weaver?.name || "Opponent");

  const curAether = s.player?.aether ?? 0;
  set(playerAetherVal, el=> el.textContent = String(curAether));
  if (curAether > prevAether){ triggerAetherFlash(); }
  prevAether = curAether;

  set(deckCountEl, el => el.textContent = String(s.player?.deckCount ?? 0));

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

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox">${c.text||""}</div>
        ${aetherChipHTML(getAetherValue(c))}
        ${pipTrackHTML(getPipRequirement(c), c.currentPips || 0)}
      `;

      // desktop + touch
      makeDesktopDraggable(el, c);
      makeTouchDraggable(el, c);

      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* wiring (desktop DnD targets) */
hudDiscard?.addEventListener("dragenter", handleDiscardDragOver);
hudDiscard?.addEventListener("dragover", handleDiscardDragOver);
hudDiscard?.addEventListener("dragleave", handleDiscardLeave);
hudDiscard?.addEventListener("drop", handleDiscardDrop);

hudEnd?.addEventListener("click", ()=> toast("End turn (stub)"));
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", render);
