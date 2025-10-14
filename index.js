import {
  initState, serializePublic,
  playCardToSpellSlot, setGlyphFromHand, buyFromFlow,
  startTurn, endTurn
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
const endHudBtn     = $("btn-endturn-hud");
const discardBtn    = $("btn-discard-hud");

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

/* ------- MTGA-like hand fan ------- */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const W = container.clientWidth;
  const maxSpread = Math.min(750, W * 0.72);
  const totalAngle = (N===1) ? 0 : clamp(10 + (N-2)*4.0, 10, 40);
  const stepAng = (N===1) ? 0 : totalAngle/(N-1);
  const startAng = -totalAngle/2;
  const startX = -maxSpread/2;
  const stepX = (N===1) ? 0 : maxSpread/(N-1);

  cards.forEach((el,i)=>{
    const a = startAng + stepAng*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    // slightly raise middle cards more; edges lower
    const mid = (N-1)/2;
    const d = Math.abs(i - mid);
    const y = 36 - (1 - d/mid) * 18; // center raised
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    // position for initial render; animations may override transform
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

/* ------- desktop drag + pulse targeting ------- */
let pulseTargets=[];
function armPulseForType(type){
  clearPulse();
  // discard always pulsing
  discardBtn.classList.add("pulse-ok");
  pulseTargets.push(discardBtn);
  if (type==="SPELL"){
    document.querySelectorAll("#player-slots .slot.spell").forEach(el=>{
      if (!el.dataset.occupied){ el.classList.add("pulse-ok"); pulseTargets.push(el); }
    });
  }
  if (type==="GLYPH"){
    const g = document.querySelector("#player-slots .slot.glyph");
    if (g && !g.dataset.occupied){ g.classList.add("pulse-ok"); pulseTargets.push(g); }
  }
}
function clearPulse(){
  pulseTargets.forEach(el=> el.classList.remove("pulse-ok"));
  pulseTargets=[];
}

function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    armPulseForType(data.type);

    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
  });
  el.addEventListener("dragend", ()=>{ el.classList.remove("dragging"); clearPulse(); });
}

/* ------- hearts (runic red) ------- */
const heartSVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-6.7-4.2-9.3-8C.6 9 .9 6.1 3 4.6 5.1 3.1 7.9 3.6 9.5 5.5L12 8.3l2.5-2.8C16.1 3.6 18.9 3.1 21 4.6c2.1 1.5 2.4 4.4.3 7.4-2.6 3.8-9.3 8-9.3 8z"/></svg>`;
function renderHearts(el, n){
  if (!el) return;
  el.innerHTML = new Array(n).fill(0).map(()=>heartSVG).join("");
}

/* ------- slots (with glyph) ------- */
function renderCardInto(el, card){
  el.classList.add("has-card");
  const article = document.createElement("article");
  article.className = "card";
  article.innerHTML = `
    <div class="title">${card.name}</div>
    <div class="type">${card.type}</div>
    <div class="textbox">${card.text||""}</div>
  `;
  el.appendChild(article);
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
    d.dataset.occupied = slot.hasCard ? "1" : "";

    if (slot.hasCard && slot.card){
      renderCardInto(d, slot.card);
      attachPeekAndZoom(d, slot.card);
    }else{
      d.textContent = "Spell Slot";
    }

    if (isPlayer){
      d.addEventListener("dragover", (ev)=>{ ev.preventDefault(); d.classList.add("drag-over"); });
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
  g.dataset.occupied = glyphSlot.hasCard ? "1" : "";
  if (glyphSlot.hasCard && glyphSlot.card){
    renderCardInto(g, glyphSlot.card);
    attachPeekAndZoom(g, glyphSlot.card);
  }else{
    g.textContent = "Glyph Slot";
  }

  if (isPlayer){
    g.addEventListener("dragover", (ev)=>{ ev.preventDefault(); g.classList.add("drag-over"); });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{
      ev.preventDefault(); g.classList.remove("drag-over");
      const cardId   = ev.dataTransfer?.getData("text/card-id");
      const t        = ev.dataTransfer?.getData("text/card-type");
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
function chip(val){
  return `
    <div class="aether-chip">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l6.6 5.1-2.5 8.3H7.9L5.4 7.1 12 2zM7.9 15.4L12 22l4.1-6.6H7.9z"/>
      </svg><span class="val">${val|0}</span>
    </div>`;
}
function renderFlow(flowSlots){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flowSlots || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const price = slotCost(idx);
    const card = document.createElement("article"); card.className = "card market"; card.dataset.flowIndex = String(idx);

    if (c){
      card.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox">${c.text||""}</div>
        ${chip(price)}
      `;
      attachPeekAndZoom(card, {...c});
      card.addEventListener("click", ()=>{
        try{
          state = buyFromFlow(state, "player", idx);
          aetherReadout.classList.remove("flash"); void aetherReadout.offsetWidth; aetherReadout.classList.add("flash");
          render();
        }catch(err){ toast(err?.message || "Cannot buy"); }
      });
    }else{
      card.style.opacity = .18;
      card.innerHTML = `<div class="title">Empty</div><div class="type">—</div><div class="textbox"></div>`;
      card.style.pointerEvents = "none";
    }
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ------- render ------- */
function ensureSafetyShape(s){
  if (!Array.isArray(s.flowSlots) || s.flowSlots.length!==5){ s.flowSlots = [null,null,null,null,null]; }
  if (!s.player) s.player = {aether:0,channeled:0,hand:[],slots:[],discardCount:0,deckCount:0,vitality:5};
  if (!Array.isArray(s.player.slots) || s.player.slots.length<4){
    s.player.slots = [
      {hasCard:false,card:null},{hasCard:false,card:null},{hasCard:false,card:null},
      {isGlyph:true,hasCard:false,card:null}
    ];
  }
  if (!s.ai) s.ai = {weaver:{name:"Opponent"}, vitality:5};
  return s;
}

function render(dealNew=false){
  closeZoom();
  peekEl?.classList.remove("show");

  const s = ensureSafetyShape(serializePublic(state) || {});
  playerPortrait.src = s.player?.weaver?.portrait || "./weaver_aria.jpg";
  aiPortrait.src     = s.ai?.weaver?.portrait     || "./weaver_morr.jpg";
  playerName.textContent = s.player?.weaver?.name || "Player";
  aiName.textContent     = s.ai?.weaver?.name || "Opponent";

  aetherReadout.querySelector("span").textContent = String(s.player?.aether ?? 0);
  deckBadge && (deckBadge.textContent    = s.player?.deckCount ?? "—");
  discardBadge && (discardBadge.textContent = s.player?.discardCount ?? 0);

  renderHearts(playerHearts, s.player?.vitality ?? 5);
  renderHearts(aiHearts, s.ai?.vitality ?? 5);

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);
  renderFlow(s.flowSlots);

  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach((c, idx)=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox">${c.text||""}</div>
        ${c.aetherValue>0 ? `
          <div class="aether-chip">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l6.6 5.1-2.5 8.3H7.9L5.4 7.1 12 2zM7.9 15.4L12 22l4.1-6.6H7.9z"/>
            </svg><span class="val">${c.aetherValue}</span>
          </div>
        `:""}
      `;

      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, {...c});
      if (dealNew){ el.style.setProperty("--deal-delay", `${60*idx}ms`); el.classList.add("deal-in"); }
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* ------- Discard drop target (gain Æ) ------- */
function removeFromHandById(id){
  const H = state.players.player.hand;
  const i = H.findIndex(c => c.id === id);
  if (i<0) return null;
  return H.splice(i,1)[0];
}
discardBtn.addEventListener("dragover", (ev)=>{ ev.preventDefault(); discardBtn.classList.add("drop-ready"); });
discardBtn.addEventListener("dragleave", ()=> discardBtn.classList.remove("drop-ready"));
discardBtn.addEventListener("drop", (ev)=>{
  ev.preventDefault(); discardBtn.classList.remove("drop-ready");
  const id = ev.dataTransfer?.getData("text/card-id");
  const card = removeFromHandById(id);
  if (!card) return;
  const gain = Number(card.aetherValue || 0);
  state.players.player.aether = (state.players.player.aether || 0) + gain;
  state.players.player.discardCount += 1;
  aetherReadout.classList.remove("flash"); void aetherReadout.offsetWidth; aetherReadout.classList.add("flash");
  clearPulse();
  render();
});

/* ------- Turn flow (river + animations) ------- */
function doStartTurn(){
  state = startTurn(state);
  render(true); // deal animation for initial hand render
}
function animateDiscardThen(fn){
  // add class to current hand cards
  const cards = Array.from(handEl?.children || []);
  cards.forEach((el,i)=>{ el.classList.add("discarding"); el.style.animationDelay = `${i*40}ms`; });
  setTimeout(fn, 360); // after animation
}

endHudBtn?.addEventListener("click", ()=>{
  // discard hand animation (visual)
  animateDiscardThen(()=>{
    // move all to discard (visual stub for now)
    const H = state.players.player.hand;
    state.players.player.discardCount += H.length;
    H.length = 0;

    // river shift
    state = endTurn(state);
    render();           // show shifted river
    setTimeout(()=>{    // reveal one at start of next turn
      state = startTurn(state);
      render();
    }, 80);
  });
});

/* Misc */
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("DOMContentLoaded", ()=>{
  // first render + reveal first flow card
  state = startTurn(state);
  render(true);
});
