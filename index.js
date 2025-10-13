import { initState, serializePublic, reducer } from "./GameLogic.js";

/* ------- helpers ------- */
const $ = (id) => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };

/* DOM refs */
const startBtn       = $("btn-start-turn");
const endBtn         = $("btn-end-turn");
const endSideBtn     = $("btn-end-turn-side");
const aiSlotsEl      = $("ai-slots");
const playerSlotsEl  = $("player-slots");
const flowRowEl      = $("flow-row");
const handEl         = $("hand");
const turnIndicator  = $("turn-indicator");
const aetherReadout  = $("aether-readout");
const deckCountEl    = $("deck-count");
const discCountEl    = $("discard-count");

const playerPortrait = $("player-portrait");
const aiPortrait     = $("ai-portrait");
const playerName     = $("player-name");
const aiName         = $("ai-name");
const playerHearts   = $("player-hearts");
const aiHearts       = $("ai-hearts");

const peekEl         = $("peek-card");
const zoomOverlayEl  = $("zoom-overlay");
const zoomCardEl     = $("zoom-card");

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
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 24, MIN_ANGLE = 6, MAX_SPREAD_PX = container.clientWidth * 0.9, LIFT_BASE = 36;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.8, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const spread = Math.min(MAX_SPREAD_PX, 860);
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

/* ------- cards (html) ------- */
function cardHTML(c, opts={}){
  const price = (typeof c.price === "number") ? c.price : (c.cost ?? 0);
  const showBuy = opts.market === true;
  const showPlay = opts.hand === true;
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price ? ` — Cost Æ ${price}` : ""}</div>
    <div class="textbox"></div>
    <div class="actions">
      ${showBuy  ? `<button class="btn" data-buy="1">Buy (Æ ${price})</button>` : ""}
      ${showPlay ? `<button class="btn" data-play="1">Play</button>
                    <button class="btn" data-discard="1">Discard for Æ ${c.aetherValue ?? 0}</button>` : ""}
    </div>`;
}

/* ------- preview / zoom ------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  div.innerHTML = cardHTML(data, {market:false, hand:false});
}

/* Long-press (centered) */
let longPressTimer = null;
let pressStart = {x:0, y:0};
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;

function attachPeekAndZoom(el, data){
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const t = ev.clientX !== undefined ? ev : (ev.touches?.[0] ?? {clientX:0,clientY:0});
    pressStart = { x: t.clientX, y: t.clientY };
    longPressTimer = setTimeout(()=>{
      fillCardShell(zoomCardEl, data);
      zoomOverlayEl.setAttribute("data-open","true");
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=> { if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } };
  const onMove = (ev)=>{
    const t = ev.clientX !== undefined ? ev : (ev.touches?.[0] ?? {clientX:0,clientY:0});
    if (Math.hypot(t.clientX - pressStart.x, t.clientY - pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };
  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", clearLP, {passive:true});
  el.addEventListener("pointerleave", clearLP, {passive:true});
  el.addEventListener("pointercancel", clearLP, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
  el.addEventListener("dragstart", clearLP);
}

/* ------- safe drag (no ghost-on-cursor) ------- */
function installDragToSlot(cardEl, cardData){
  // Desktop native DnD
  cardEl.draggable = true;
  cardEl.addEventListener("dragstart", (ev)=>{
    cardEl.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", cardData.id);
    ev.dataTransfer?.setData("text/card-type", cardData.type);
    ev.dataTransfer?.setDragImage(cardEl, cardEl.clientWidth/2, cardEl.clientHeight*0.9);
  });
  cardEl.addEventListener("dragend", ()=> cardEl.classList.remove("dragging"));

  // Lightweight pointer-based drag for touch devices
  let dragging = false, ghost=null, moveRef=null, upRef=null;
  let start={x:0,y:0}, last={x:0,y:0};

  function pt(e){ const t = e.clientX !== undefined ? e : (e.touches?.[0] ?? {clientX:0,clientY:0}); return {x:t.clientX, y:t.clientY}; }

  const onDown = (e)=>{
    start = last = pt(e); dragging=false;
    cardEl.setPointerCapture?.(e.pointerId || 0);

    moveRef = (ev)=>{
      const p = pt(ev);
      if (!dragging){
        if (Math.hypot(p.x - start.x, p.y - start.y) > 10){
          dragging = true;
          ghost = cardEl.cloneNode(true);
          ghost.classList.add("dragging");
          ghost.style.position = "fixed";
          ghost.style.left = "0"; ghost.style.top = "0";
          ghost.style.transform = `translate(${p.x - ghost.clientWidth/2}px, ${p.y - ghost.clientHeight*0.9}px)`;
          ghost.style.zIndex = "99999";
          document.body.appendChild(ghost);
        }
      }else{
        last = p;
        ghost.style.transform = `translate(${p.x - ghost.clientWidth/2}px, ${p.y - ghost.clientHeight*0.9}px)`;
        document.querySelectorAll(".slot.drag-over").forEach(s => s.classList.remove("drag-over"));
        const el = document.elementFromPoint(p.x, p.y);
        const slot = el?.closest?.(".slot.spell, .slot.glyph");
        if (slot) slot.classList.add("drag-over");
      }
      ev.preventDefault();
    };

    upRef = ()=>{
      document.querySelectorAll(".slot.drag-over").forEach(s => s.classList.remove("drag-over"));
      if (dragging && ghost){
        const el = document.elementFromPoint(last.x, last.y);
        const slot = el?.closest?.(".slot.spell, .slot.glyph");
        if (slot && slot.classList.contains("spell")){
          const idx = Number(slot.dataset.slotIndex || 0);
          playSpellIfPossible(cardData.id, idx);
        }
      }
      if (ghost){ ghost.remove(); ghost=null; }
      dragging=false;
      window.removeEventListener("pointermove", moveRef, {passive:false});
      window.removeEventListener("pointerup", upRef, {passive:true});
    };

    window.addEventListener("pointermove", moveRef, {passive:false});
    window.addEventListener("pointerup",   upRef,   {passive:true});
  };

  cardEl.addEventListener("pointerdown", onDown);
}

/* ------- slots ------- */
function renderSlots(container, slotSnapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();

  // three spell bays
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);

    // render content
    const has = slotSnapshot?.[i]?.hasCard;
    if (has && slotSnapshot[i].card){
      const c = slotSnapshot[i].card;
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = cardHTML(c);
      attachPeekAndZoom(card, c);
      d.appendChild(card);
    }else{
      d.textContent = "Spell Slot";
    }

    if (isPlayer){
      d.addEventListener("dragover", (ev)=> { ev.preventDefault(); d.classList.add("drag-over"); });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const cardId   = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL") return;
        playSpellIfPossible(cardId, i);
      });
    }
    container.appendChild(d);
  }

  // one glyph bay
  const g = document.createElement("div");
  g.className = "slot glyph";
  if (slotSnapshot?.glyph?.hasCard && slotSnapshot.glyph.card){
    const c = slotSnapshot.glyph.card;
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = cardHTML(c);
    attachPeekAndZoom(card, c);
    g.appendChild(card);
  }else{
    g.textContent = "Glyph Slot";
  }

  if (isPlayer){
    g.addEventListener("dragover", (ev)=>{
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", ()=> { g.classList.remove("drag-over"); toast("Set Glyph: (stub)"); });
  }
  container.appendChild(g);
}

/* ------- flow row ------- */
function renderFlow(flowArray){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flowArray || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li");
    li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c, {market:true});

    card.querySelector("[data-buy]")?.addEventListener("click", ()=>{
      try{
        state = reducer(state, { type:'BUY_FROM_FLOW', player:'player', flowIndex: idx });
        render();
      }catch(err){ toast(err?.message || "Cannot buy"); }
    });

    attachPeekAndZoom(card, c);
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ------- actions ------- */
function playSpellIfPossible(cardId, slotIndex){
  try{
    state = reducer(state, { type:'PLAY_CARD_TO_SLOT', player:'player', cardId, slotIndex });
    render();
  }catch(err){ toast(err?.message || "Can't play there"); }
}

/* ------- hearts ------- */
function heartsHTML(n=5){ return Array.from({length:5}, (_,i)=> `<span style="color:${i<n?'#e7a6a6':'#6b5a4a'}">●</span>`).join(""); }

/* ------- main render ------- */
function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  const s = serializePublic(state) || {};

  set(turnIndicator, el => el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`);
  set(aetherReadout, el => el.textContent  = `Æ ${s.player?.aether ?? 0}  ◇ ${s.player?.channeled ?? 0}`);

  // portraits + names
  set(playerPortrait, el => { el.src = s.player?.weaver?.portrait || "./weaver_aria.jpg"; });
  set(aiPortrait,     el => { el.src = s.ai?.weaver?.portrait     || "./weaver_morr.jpg"; });
  set(playerName,     el => el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el => el.textContent = s.ai?.weaver?.name     || "Opponent");
  set(playerHearts,   el => el.innerHTML   = heartsHTML(s.player?.vitality ?? 5));
  set(aiHearts,       el => el.innerHTML   = heartsHTML(s.ai?.vitality ?? 5));

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);

  renderFlow(s.flow || []);

  // counts
  set(deckCountEl, el => el.textContent = String(s.player?.deckCount ?? 0));
  set(discCountEl, el => el.textContent = String(s.player?.discardCount ?? 0));

  // Hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;
      el.innerHTML = cardHTML(c, {hand:true});

      installDragToSlot(el, c);
      attachPeekAndZoom(el, c);

      el.querySelector("[data-play]")?.addEventListener("click", ()=>{
        const idx = (s.player?.slots || []).findIndex(x=>!x.hasCard && !x.isGlyph);
        if (idx < 0){ toast("No empty spell slot"); return; }
        playSpellIfPossible(c.id, idx);
      });
      el.querySelector("[data-discard]")?.addEventListener("click", ()=>{
        try{
          state = reducer(state, { type:'DISCARD_FOR_AETHER', player:'player', cardId: c.id });
          render();
        }catch(err){ toast(err?.message || "Can't discard"); }
      });

      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* wiring */
function endTurn(){
  state = reducer(state, { type:'END_TURN', player:'player' });
  render();
}

startBtn?.addEventListener("click", ()=>{ state = reducer(state, {type:'START_TURN', player:'player'}); render(); });
endBtn?.addEventListener("click", endTurn);
endSideBtn?.addEventListener("click", endTurn);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
zoomOverlayEl?.addEventListener("click", closeZoom);
document.addEventListener("DOMContentLoaded", render);
