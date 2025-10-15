/* ===== Ensure Grey bus + load animations (idempotent) ===== */
(() => {
  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on = (n, fn) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); };
    const off = (n, fn) => listeners.get(n)?.delete(fn);
    const emit = (n, d) => (listeners.get(n) || []).forEach(fn => { try { fn(d); } catch {} });
    return (window.Grey = { on, off, emit });
  })();
  (async ()=>{ try { await import('./animations.js?v=2571'); } catch {} })();
})();

import {
  initState,
  serializePublic,
  startTurn,
  endTurn,
  aiTakeTurn,
  drawN,
  playCardToSpellSlot,
  setGlyphFromHand,
  buyFromFlow,
  discardForAether,
  withAetherText
} from "./GameLogic.js";

/* =============== utils =============== */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const Emit  = (e,d)=> window.Grey?.emit?.(e,d);

/* =============== refs =============== */
const startBtn      = $("btn-start-turn");
const endBtn        = $("btn-end-turn");
const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");
const turnIndicator = $("turn-indicator");

const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

const playerAeEl    = $("player-aether");
const aiAeEl        = $("ai-aether");

const hudDiscardBtn = $("btn-discard-hud");
const hudDeckBtn    = $("btn-deck-hud");

const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* =============== state =============== */
let state = initState();
let bootDealt = false;
let prevFlowIds = [null,null,null,null,null];
let prevHandIds = [];
let selectedCard = null;
let draggingType = "";

/* =============== visuals helpers =============== */
function heartSVG(size=36){
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <path d="M12 21s-7.2-4.5-9.5-8.1C.5 9.7 1.7 6.6 4.4 5.4 6.3 4.6 8.6 5 10 6.6c1.4-1.6 3.7-2 5.6-1.2 2.7 1.2 3.9 4.3 1.9 7.5C19.2 16.5 12 21 12 21z" fill="#d65151" />
    <path d="M12 8l2 3h-4l-2 0 2-3z" fill="#6b1111"/>
  </svg>`;
}
function renderHearts(el, n=5){
  if (!el) return;
  const count = Math.max(0, n|0);
  el.innerHTML = Array.from({length:count}).map(()=>`<span class="heart">${heartSVG(36)}</span>`).join("");
}
const aeInline = (s)=> withAetherText(s);

/* === New: big gem with centered value (for portraits) === */
function portraitGemSVG(value=0, size=60){
  // diamond shape with inner gradient-ish strokes handled by fill + light stroke
  // value centered using text-anchor + dominant-baseline
  return `
<svg class="aether-gem-portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  <defs>
    <filter id="gemGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(126,182,255,.55)" flood-opacity="1"/>
    </filter>
  </defs>
  <polygon points="32,4 58,30 32,60 6,30" fill="#7eb6ff" stroke="#9cc6ff" stroke-width="2" filter="url(#gemGlow)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        style="font-weight:800; font-size:24px; fill:#0e1420; paint-order:stroke; stroke:#e7f1ff; stroke-width:1.2;">
    ${Number(value|0)}
  </text>
</svg>`.trim();
}

/* Render portrait gem, and place it to the RIGHT of the hearts */
function setPortraitAetherDisplay(aeEl, heartsEl, value){
  if (!aeEl || !heartsEl) return;
  aeEl.className = "aether-inline";       // hook for future CSS if needed
  aeEl.innerHTML = portraitGemSVG(value, 60); // ~2.5x the old 24px
  // ensure layout: put gem as last child of hearts row so it sits to the right
  // and make the hearts row a flex container if not already styled
  heartsEl.style.display = "flex";
  heartsEl.style.alignItems = "center";
  heartsEl.style.gap = heartsEl.style.gap || "8px";
  aeEl.style.display = "inline-flex";
  aeEl.style.alignItems = "center";
  aeEl.style.marginLeft = "6px";
  if (aeEl.parentElement !== heartsEl) heartsEl.appendChild(aeEl);
}

/* =============== hand layout (fan) =============== */
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

/* =============== preview / zoom =============== */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  const pip = Number.isFinite(data.pip) ? Math.max(0, data.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (data.aetherValue>0) ? `<div class="aether-chip"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l6 6-6 14-6-14 6-6z"/></svg><span class="val">${data.aetherValue}</span></div>` : "";
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}${(data.price ?? data.cost) ? ` — Cost ${aeInline("Æ")}${data.price ?? data.cost}` : ""}</div>
    <div class="textbox">${aeInline(data.text||"")}</div>
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

/* =============== drag & drop =============== */
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    draggingType = data.type || "";
    el.classList.add("dragging");
    ev.dataTransfer?.setData("application/x-card", JSON.stringify({id:data.id,type:data.type}));
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    ev.dataTransfer?.setData("text/plain", data.id);
    ev.dataTransfer.effectAllowed = "move";
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
    markDropTargets(data.type, true);
  });
  el.addEventListener("dragend", ()=>{
    draggingType = "";
    el.classList.remove("dragging");
    markDropTargets(data.type, false);
  });

  // click-to-place fallback
  el.addEventListener("click", (e)=>{
    e.stopPropagation();
    selectedCard = { id: el.dataset.cardId, type: data.type };
    Array.from(handEl.children).forEach(n=> n.classList.toggle('selected', n===el));
  });
}
function wireTouchDrag(el, data){
  let dragging=false, ghost=null, currentHover=null;
  const start = (ev)=>{
    const t = ev.touches ? ev.touches[0] : ev;
    dragging = true; markDropTargets(data.type, true);
    ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="0"; ghost.style.top="0";
    ghost.style.pointerEvents="none"; ghost.style.transform="translate(-9999px,-9999px)";
    ghost.style.zIndex="99999"; ghost.classList.add("dragging");
    document.body.appendChild(ghost);
    move(t.clientX, t.clientY); ev.preventDefault();
  };
  const move = (x,y)=>{
    if (!dragging || !ghost) return;
    ghost.style.transform = `translate(${x-ghost.clientWidth/2}px, ${y-ghost.clientHeight*0.9}px) rotate(6deg)`;
    const elUnder = document.elementFromPoint(x,y);
    const hoverTarget = findValidDropTarget(elUnder, data.type);
    if (hoverTarget !== currentHover){
      currentHover?.classList.remove("drag-over");
      currentHover = hoverTarget; currentHover?.classList.add("drag-over");
    }
  };
  const end = (ev)=>{
    if (!dragging) return; dragging=false;
    const t = ev.changedTouches ? ev.changedTouches[0] : ev;
    const elUnder = document.elementFromPoint(t.clientX, t.clientY);
    const target = findValidDropTarget(elUnder, data.type);
    currentHover?.classList.remove("drag-over");
    markDropTargets(data.type, false);
    ghost?.remove(); ghost=null;
    if (target) applyDrop(target, el.dataset.cardId, data.type);
  };
  el.addEventListener("touchstart", start, {passive:false});
  el.addEventListener("touchmove", (ev)=>{ const t=ev.touches[0]; move(t.clientX,t.clientY); ev.preventDefault(); }, {passive:false});
  el.addEventListener("touchend", end, {passive:false});
  el.addEventListener("touchcancel", end, {passive:false});
}

document.addEventListener('dragover', (e)=>{
  if (!draggingType) return;
  const tgt = findValidDropTarget(document.elementFromPoint(e.clientX, e.clientY), draggingType);
  if (tgt){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
}, true);

function findValidDropTarget(node, cardType){
  if (!node) return null;
  const slot = node.closest(".slot");
  if (slot){
    const isPlayerSlot = !!slot.closest(".row.player");
    if (!isPlayerSlot) return null;
    if (slot.classList.contains("spell") && cardType==="SPELL") return slot;
    if (slot.classList.contains("glyph") && cardType==="GLYPH") return slot;
  }
  if (hudDiscardBtn && node.closest("#btn-discard-hud")) return hudDiscardBtn;
  return null;
}
function markDropTargets(cardType, on){
  document.querySelectorAll(".row.player .slot.spell").forEach(s=>{
    s.classList.toggle("drag-over", !!on && cardType==="SPELL");
  });
  const g = document.querySelector(".row.player .slot.glyph");
  if (g) g.classList.toggle("drag-over", !!on && cardType==="GLYPH");
  hudDiscardBtn?.classList.toggle("drop-ready", !!on);
}
function applyDrop(target, cardId, cardType){
  if (!target) return;
  try {
    if (target === hudDiscardBtn){
      state = discardForAether(state, "player", cardId);
      render(); return;
    }
    if (target.classList.contains("glyph") && cardType==="GLYPH"){
      state = setGlyphFromHand(state, "player", cardId); render(); return;
    }
    if (target.classList.contains("spell") && cardType==="SPELL"){
      const idx = Number(target.dataset.slotIndex||0);
      state = playCardToSpellSlot(state, "player", cardId, idx); render(); return;
    }
  } catch(e){ toast(e?.message || "Action failed"); }
}

document.addEventListener('drop', (ev)=>{
  if (!draggingType) return;
  const json = ev.dataTransfer?.getData('application/x-card') || '{}';
  let payload={}; try{ payload=JSON.parse(json); }catch{}
  const id = payload.id || ev.dataTransfer?.getData('text/card-id') || ev.dataTransfer?.getData('text/plain');
  const type = payload.type || ev.dataTransfer?.getData('text/card-type') || draggingType;
  if (!id) return;
  const target = findValidDropTarget(ev.target, type);
  if (target){ ev.preventDefault(); ev.stopPropagation(); applyDrop(target, id, type); }
}, true);

hudDiscardBtn?.addEventListener('dragover', (e)=>{ if (draggingType){ e.preventDefault(); hudDiscardBtn.classList.add('drop-ready'); }});
hudDiscardBtn?.addEventListener('dragleave', ()=> hudDiscardBtn.classList.remove('drop-ready'));
hudDiscardBtn?.addEventListener('drop', (e)=>{
  e.preventDefault(); hudDiscardBtn.classList.remove('drop-ready');
  const json = e.dataTransfer?.getData('application/x-card') || '{}';
  let payload={}; try{ payload=JSON.parse(json); }catch{}
  const id = payload.id || e.dataTransfer?.getData("text/card-id") || e.dataTransfer?.getData("text/plain");
  const type = payload.type || e.dataTransfer?.getData("text/card-type");
  if (id){ applyDrop(hudDiscardBtn, id, type); }
});

/* =============== card html / slots =============== */
function cardHTML(c){
  if (!c) return `<div class="title">Empty</div><div class="type">—</div>`;
  const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aetherChip = (c.aetherValue>0) ? `<div class="aether-chip"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l6 6-6 14-6-14 6-6z"/></svg><span class="val">${c.aetherValue}</span></div>` : "";
  const price = (c.price ?? c.cost) | 0;
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price ? ` — Cost ${withAetherText("Æ")}${price}` : ""}</div>
    <div class="textbox">${withAetherText(c.text||"")}</div>
    ${pipDots}
    ${aetherChip}
  `;
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
      const enter = ev => { const t=ev.dataTransfer?.getData("text/card-type"); if (t==="SPELL"){ ev.preventDefault(); d.classList.add("drag-over"); ev.dataTransfer.dropEffect="move"; }};
      const over  = enter;
      const leave = ()=> d.classList.remove("drag-over");
      const drop  = ev => {
        ev.preventDefault(); d.classList.remove("drag-over");
        const json = ev.dataTransfer?.getData('application/x-card') || '{}';
        let payload={}; try{ payload=JSON.parse(json); }catch{}
        const id = payload.id || ev.dataTransfer?.getData("text/card-id") || ev.dataTransfer?.getData("text/plain");
        const type = payload.type || ev.dataTransfer?.getData("text/card-type");
        if (type!=="SPELL" || !id) return;
        try { state = playCardToSpellSlot(state, "player", id, i); render(); } catch(e){ toast(e?.message||"Can't play"); }
      };
      d.addEventListener("dragenter", enter);
      d.addEventListener("dragover", over);
      d.addEventListener("dragleave", leave);
      d.addEventListener("drop", drop);
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
    const enter = ev => { const t=ev.dataTransfer?.getData("text/card-type"); if (t==="GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); ev.dataTransfer.dropEffect="move"; }};
    const over  = enter;
    const leave = ()=> g.classList.remove("drag-over");
    const drop  = ev => {
      ev.preventDefault(); g.classList.remove("drag-over");
      const json = ev.dataTransfer?.getData('application/x-card') || '{}';
      let payload={}; try{ payload=JSON.parse(json); }catch{}
      const id = payload.id || ev.dataTransfer?.getData("text/card-id") || ev.dataTransfer?.getData("text/plain");
      const type = payload.type || ev.dataTransfer?.getData("text/card-type");
      if (type!=="GLYPH" || !id) return;
      try { state = setGlyphFromHand(state, "player", id); render(); } catch(e){ toast(e?.message||"Can't set glyph"); }
    };
    g.addEventListener("dragenter", enter);
    g.addEventListener("dragover", over);
    g.addEventListener("dragleave", leave);
    g.addEventListener("drop", drop);
  }
  container.appendChild(g);
}

/* =============== Flow (with falloff/reveal timing) =============== */
async function renderFlow(flowArray){
  if (!flowRowEl) return;

  const oldCards = Array.from(flowRowEl.children).map(li => li.querySelector('.card'));
  const nextIds = (flowArray || []).slice(0,5).map(c => c ? c.id : null);

  if (prevFlowIds[4] && prevFlowIds[4] !== nextIds[4] && oldCards[4]) {
    Emit('aetherflow:falloff', { node: oldCards[4] });
    await sleep(520);
  }

  flowRowEl.replaceChildren();

  (flowArray || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);

    if (c){ card.innerHTML = cardHTML(c); attachPeekAndZoom(card, c); }
    else { card.innerHTML = `<div class="title">Empty</div><div class="type">—</div>`; }

    if (c){
      card.addEventListener("click", async ()=>{
        Emit('aetherflow:bought', { node: card });
        await sleep(560);
        try { state = buyFromFlow(state, "player", idx); render(); }
        catch(err){ toast(err?.message || "Cannot buy"); }
      });
    }

    li.appendChild(card);

    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    const PRICE_BY_POS = [4,3,3,2,2];
    priceLbl.innerHTML = `${withAetherText("Æ")} ${PRICE_BY_POS[idx]||0} to buy`;
    li.appendChild(priceLbl);

    flowRowEl.appendChild(li);

    if (idx === 0 && !prevFlowIds[0] && c) Emit('aetherflow:reveal', { node: card });
  });

  prevFlowIds = nextIds;
}

/* =============== toast =============== */
let toastEl;
function toast(msg, ms=1100){
  if (!toastEl){ toastEl=document.createElement("div"); toastEl.className="toast"; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), ms);
}

/* =============== safety / render root =============== */
function ensureSafetyShape(s){
  if (!Array.isArray(s.flow)) s.flow = [null,null,null,null,null];
  if (!s.player) s.player = {aether:0, vitality:5, hand:[], slots:[]};
  if (!Array.isArray(s.player.hand)) s.player.hand=[];
  if (!Array.isArray(s.player.slots) || s.player.slots.length<4){
    s.player.slots = [
      {hasCard:false,card:null},{hasCard:false,card:null},{hasCard:false,card:null},
      {isGlyph:true,hasCard:false,card:null}
    ];
  }
  if (!s.ai) s.ai = {aether:0, vitality:5, weaver:{name:"Opponent"}, slots:[{},{},{},{isGlyph:true}]};
  return s;
}

async function render(){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  const s = ensureSafetyShape(serializePublic(state) || {});
  set(turnIndicator, el => el && (el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`));

  set(playerPortrait, el=> el && (el.src = s.players?.player?.weaver?.portrait || "./weaver_aria.jpg"));
  set(aiPortrait,     el=> el && (el.src = s.players?.ai?.weaver?.portrait     || "./weaver_morr.jpg"));
  set(playerName,     el=> el && (el.textContent = s.players?.player?.weaver?.name || "Player"));
  set(aiName,         el=> el && (el.textContent = s.players?.ai?.weaver?.name || "Opponent"));

  // Hearts first
  const playerHeartsEl = $("player-hearts");
  const aiHeartsEl     = $("ai-hearts");
  renderHearts(playerHeartsEl, s.players?.player?.vitality ?? 5);
  renderHearts(aiHeartsEl,     s.players?.ai?.vitality ?? 5);

  // Then render/position the big gem to the RIGHT of hearts
  setPortraitAetherDisplay(playerAeEl, playerHeartsEl, s.players?.player?.aether ?? 0);
  setPortraitAetherDisplay(aiAeEl,     aiHeartsEl,     s.players?.ai?.aether ?? 0);

  // (If you also render smaller inline Æ elsewhere, keep using withAetherText)
  // Remove any placeholder trance text if it exists (left intact if you already implemented trance UI separately)
  document.querySelectorAll('.portrait .trance')?.forEach(t => {
    if (t && t.textContent && t.textContent.trim().toLowerCase().includes("trance 0")) t.textContent = "";
  });

  // HUD icons
  if (hudDeckBtn){
    hudDeckBtn.innerHTML = `<svg class="icon deck" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
      <rect x="10" y="12" width="36" height="40" rx="4"></rect>
      <rect x="14" y="8" width="36" height="40" rx="4"></rect>
      <rect x="18" y="4" width="36" height="40" rx="4"></rect>
    </svg>`;
    hudDeckBtn.classList.add("drop-target");
  }
  if (hudDiscardBtn){
    hudDiscardBtn.innerHTML = `<svg class="icon discard" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
      <rect x="10" y="10" width="44" height="34" rx="6"></rect>
      <path d="M20 22h24M20 30h24M20 38h24" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`;
    hudDiscardBtn.classList.add("drop-target");
  }

  renderSlots(playerSlotsEl, s.players?.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.players?.ai?.slots     || [], false);
  await renderFlow(s.flow);

  /* ---------- HAND (no-flash draw) ---------- */
  if (handEl){
    const oldIds = prevHandIds.slice();
    const newIds = (s.players?.player?.hand || []).map(c => c.id);

    handEl.replaceChildren();
    const domCards = [];
    (s.players?.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
      const pipDots = pip>0 ? `<div class="pip-track">${Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
      const aetherChip = (c.aetherValue>0) ? `<div class="aether-chip"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l6 6-6 14-6-14 6-6z"/></svg><span class="val">${c.aetherValue}</span></div>` : "";
      const price = (c.price ?? c.cost) | 0;

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}${price ? ` — Cost ${withAetherText("Æ")}${price}` : ""}</div>
        <div class="textbox">${withAetherText(c.text||"")}</div>
        ${pipDots}
        ${aetherChip}
      `;

      if (!oldIds.includes(c.id)) el.classList.add('grey-hide-during-flight');

      wireDesktopDrag(el, c);
      wireTouchDrag(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); domCards.push(el);
    });

    layoutHand(handEl, domCards);

    const addedNodes = domCards.filter(el => !oldIds.includes(el.dataset.cardId));

    if (addedNodes.length){
      Emit('cards:deal', { nodes: addedNodes, stagger: 110 });
      bootDealt = true;
    } else if (!bootDealt && domCards.length){
      domCards.forEach(n=> n.classList.add('grey-hide-during-flight'));
      Emit('cards:deal', { nodes: domCards, stagger: 110 });
      bootDealt = true;
    }

    prevHandIds = newIds;
  }
}

/* =============== simple AI =============== */
function aiSimpleTurn(){
  const AI = state.players.ai;
  if (!AI.slots[3].hasCard){
    const g = AI.hand.findIndex(c=>c.type==="GLYPH");
    if (g>=0){ const [card] = AI.hand.splice(g,1); AI.slots[3] = { ...AI.slots[3], hasCard:true, card }; }
  }
  const empty = [0,1,2].find(i => !AI.slots[i].hasCard);
  if (empty!==undefined){
    const sIdx = AI.hand.findIndex(c=>c.type==="SPELL");
    if (sIdx>=0){ const [card] = AI.hand.splice(sIdx,1); AI.slots[empty] = { hasCard:true, card }; }
  }
  if ((AI.aether|0) < 2){
    const aIdx = AI.hand.findIndex(c=> (c.aetherValue|0) > 0);
    if (aIdx>=0){ const [card] = AI.hand.splice(aIdx,1); AI.discard.push(card); AI.aether += (card.aetherValue|0); }
  }
  for (let i=0; i<(state.flow?.length||0); i++){
    const card = state.flow[i]; const price = [4,3,3,2,2][i] || 0;
    if (card && (AI.aether|0) >= price){ try { state = buyFromFlow(state, "ai", i); } catch{} break; }
  }
  return state;
}

/* =============== turn loop =============== */
async function doStartTurn(){
  state = startTurn(state);
  const active = state.activePlayer;
  const need   = Math.max(0, 5 - (state.players[active].hand?.length||0));
  if (need) state = drawN(state, active, need);
  await render();
}

async function doEndTurn(){
  if (state.activePlayer === "player"){
    const handNodes = Array.from(handEl?.children || []);
    if (handNodes.length){
      Emit('cards:discard', { nodes: handNodes });
      await sleep(620);
      const P = state.players.player;
      P.discard.push(...P.hand.splice(0));
    }
  }

  state = endTurn(state);

  if (state.activePlayer === "ai"){
    const needAI = Math.max(0, 5 - (state.players.ai.hand?.length||0));
    if (needAI) state = drawN(state, "ai", needAI);
    await render();
    state = aiSimpleTurn();
    await render();
    state = endTurn(state);
  }

  await doStartTurn();
}

/* =============== events =============== */
startBtn?.addEventListener("click", doStartTurn);
endBtn?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });

/* =============== boot =============== */
document.addEventListener("DOMContentLoaded", async ()=>{
  await doStartTurn();
});
