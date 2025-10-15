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
  drawN,
  playCardToSpellSlot,
  setGlyphFromHand,
  buyFromFlow,
  discardForAether,
  withAetherText
} from "./GameLogic.js";

/* ---------- utils ---------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const Emit  = (e,d)=> window.Grey?.emit?.(e,d);
const nextFrame = () => new Promise(requestAnimationFrame);

/* ---------- refs ---------- */
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
const hudEndBtn     = $("btn-endturn-hud");
const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* ---------- state ---------- */
let state = initState();
let bootDealt = false;
let prevFlowIds = [null,null,null,null,null];
let prevHandIds = [];

/* ---------- portraits ---------- */
function heartSVG(size=36){
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <path d="M12 21s-7.2-4.5-9.5-8.1C.5 9.7 1.7 6.6 4.4 5.4 6.3 4.6 8.6 5 10 6.6c1.4-1.6 3.7-2 5.6-1.2 2.7 1.2 3.9 4.3 1.9 7.5C19.2 16.5 12 21 12 21z" fill="#d65151" />
    <path d="M12 8l2 3h-4l-2 0 2-3z" fill="#6b1111"/>
  </svg>`;
}
function renderHearts(el, n=5){
  if (!el) return;
  el.innerHTML = Array.from({length:Math.max(0,n|0)}).map(()=>`<span class="heart">${heartSVG(36)}</span>`).join("");
}

/* ---------- portrait Aether gem: text at 12.5% (half of prior 25%) ---------- */
function setAetherDisplay(el, v=0){
  if (!el) return;
  const val = v|0;
  el.innerHTML = `
    <span class="gem">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l6 6-6 14-6-14 6-6z"/>
        <text x="12" y="12" text-anchor="middle" dominant-baseline="central">${val}</text>
      </svg>
    </span>
    <strong class="val" aria-hidden="true">${val}</strong>
  `;
  const t = el.querySelector("svg text");
  if (t) t.setAttribute("font-size", "3"); // 12.5% of 24 viewBox
}

/* ---------- hand layout (edge-to-edge fanned) ---------- */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;

  const MAX_ANGLE = 22, MIN_ANGLE = 8;
  const totalAngle = N===1 ? 0 : clamp(MIN_ANGLE + (N-2)*2, MIN_ANGLE, MAX_ANGLE);
  const stepA  = N===1 ? 0 : totalAngle/(N-1);
  const startA = -totalAngle/2;

  const cw = cards[0]?.clientWidth || container.clientWidth / Math.max(1, N);
  const stepX = cw * 0.98;
  const startX = -stepX * (N-1) / 2;

  const LIFT = 44;

  cards.forEach((el,i)=>{
    const a = startA + stepA*i;
    const rad = a * Math.PI/180;
    const x = startX + stepX*i;
    const y = LIFT - Math.cos(rad)*(LIFT*0.78);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
  });
}

/* ---------- preview / zoom ---------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function cleanRulesText(s){ return s ? String(s).replace(/^\s*On\s+Resolve\s*[:\-]\s*/i, "") : ""; }
function cardShellHTML(c){
  const pip = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const pipDots = `<div class="pip-track">${pip>0 ? Array.from({length:pip}).map(()=>'<span class="pip"></span>').join("") : ""}</div>`;
  const playCost = (c.cost|0) > 0 ? (c.cost|0) : null;
  const aetherChip = (c.aetherValue>0)
    ? `<div class="aether-chip">
         <svg viewBox="0 0 24 24" aria-hidden="true">
           <path d="M12 2l6 6-6 14-6-14 6-6z"/>
           <text x="12" y="12" text-anchor="middle" dominant-baseline="central">${c.aetherValue}</text>
         </svg>
       </div>` : "";
  return `
    <div class="title">${c.name}</div>
    <div class="type" data-k="${c.type||""}">${c.type||""}</div>
    ${playCost ? `<div class="play-cost-badge"><span class="v">${playCost}</span></div>` : ``}
    <div class="divider"></div>
    ${pipDots}
    <div class="textbox">${withAetherText(cleanRulesText(c.text||""))}</div>
    ${aetherChip}
  `;
}

/* ---------- preview / zoom (centered) ---------- */
let longPressTimer = null, pressStart = {x:0,y:0};
const LONG_PRESS_MS = 350, MOVE_CANCEL_PX = 8;



function attachPeekAndZoom(el, data){
  // Desktop hover peek
  const peekEl = document.getElementById("peek-card");
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }

  // Press & hold -> centered preview (uses #peek-card as well)
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const t = ev.clientX!==undefined?ev:(ev.touches?.[0]??{clientX:0,clientY:0});
    pressStart = {x:t.clientX,y:t.clientY};
    longPressTimer = setTimeout(()=>{
      if (peekEl){
        fillCardShell(peekEl, data);
        peekEl.classList.add("show"); // CSS positions it at screen center
      }
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=>{ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } peekEl?.classList.remove("show"); };
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

function fillCardShell(div, data){ if (div) div.innerHTML = cardShellHTML(data); }

/* ---------- action menu ---------- */
function clearAllActionMenus(){
  document.querySelectorAll(".action-pop").forEach(n => n.remove());
}
function firstOpenSpellSlotIndex(pub){
  const slots = pub.players?.player?.slots || [];
  for (let i=0;i<3;i++){
    const s = slots[i];
    if (!s?.hasCard) return i;
  }
  return -1;
}
function canChannel(card){ return (card?.aetherValue|0) > 0; }
function canPlaySpell(pub, card){
  if (card?.type!=="SPELL") return false;
  return firstOpenSpellSlotIndex(pub) >= 0;
}
function canSetGlyph(pub, card){
  if (card?.type!=="GLYPH") return false;
  const slot = (pub.players?.player?.slots || [])[3];
  return slot && !slot.hasCard;
}
function canCastInstant(pub, card){
  if (card?.type!=="INSTANT") return false;
  // Only enable if the engine exposes a cast hook on window (future-proof).
  return typeof window.castInstantFromHand === "function";
}
function showToast(msg, ms=1400){
  let t = document.querySelector(".toast");
  if (!t){ t = document.createElement("div"); t.className="toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  setTimeout(()=> t.classList.remove("show"), ms);
}
function showCardOptions(cardEl, cardData){
  clearAllActionMenus();
  const pub = serializePublic(state) || {};
  const opts = [];

  if (canPlaySpell(pub, cardData)) opts.push({k:"play", label:"Play"});
  if (canSetGlyph(pub, cardData))  opts.push({k:"set",  label:"Set"});
  if (canCastInstant(pub, cardData)) opts.push({k:"cast", label:"Cast"});
  if (canChannel(cardData))         opts.push({k:"channel", label:"Channel"});

  if (!opts.length) return;

  const pop = document.createElement("div");
  pop.className = `action-pop t-${(cardData.type||'X').toLowerCase()}`;

  opts.forEach(o=>{
    const b = document.createElement("button");
    b.type="button";
    b.className = `rune-btn act-${o.k}`;
    b.textContent = o.label;
    b.addEventListener("click", async (ev)=>{
      ev.stopPropagation();
      try{
        if (o.k === "play"){
          const idx = firstOpenSpellSlotIndex(serializePublic(state)||{});
          if (idx>=0){ state = playCardToSpellSlot(state, "player", cardData.id, idx); }
        } else if (o.k === "set"){
          state = setGlyphFromHand(state, "player", cardData.id);
        } else if (o.k === "channel"){
          // animate discard then apply
          cardEl.classList.add("discarding");
          await sleep(320);
          state = discardForAether(state, "player", cardData.id);
        } else if (o.k === "cast"){
          if (typeof window.castInstantFromHand === "function"){
            state = await window.castInstantFromHand(state, "player", cardData.id);
          } else {
            showToast("Casting for Instants not available yet.");
          }
        }
      } catch(e){}
      clearAllActionMenus();
      await render();
    });
    pop.appendChild(b);
  });

  document.body.appendChild(pop);

  // position above the card
  const r = cardEl.getBoundingClientRect();
  pop.style.left = `${r.left + r.width/2}px`;
  pop.style.top  = `${r.top  - 12}px`;
  pop.style.transform = "translate(-50%, -100%)";
}

/* ---------- DnD (desktop + touch) ---------- */
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
  document.querySelectorAll(".row.player .slot.spell")
    .forEach(s=> s.classList.toggle("drag-over", !!on && cardType==="SPELL"));
  const g = document.querySelector(".row.player .slot.glyph");
  if (g) g.classList.toggle("drag-over", !!on && cardType==="GLYPH");
  hudDiscardBtn?.classList.toggle("drop-ready", !!on);
}
function applyDrop(target, cardId, cardType){
  if (!target || !cardId) return;
  try {
    if (target === hudDiscardBtn){
      const el = handEl?.querySelector(`.card[data-card-id="${cardId}"]`);
      if (el){ el.classList.add("discarding"); setTimeout(()=>{}, 0); }
      state = discardForAether(state, "player", cardId); render(); return;
    }
    if (target.classList.contains("glyph") && cardType==="GLYPH"){
      state = setGlyphFromHand(state, "player", cardId); render(); return;
    }
    if (target.classList.contains("spell") && cardType==="SPELL"){
      const idx = Number(target.dataset.slotIndex||0);
      state = playCardToSpellSlot(state, "player", cardId, idx); render(); return;
    }
  } catch(e){}
}

/* Desktop drag wiring */
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    clearAllActionMenus();
    el.classList.add("dragging");
    const payload = JSON.stringify({id:data.id,type:data.type});
    ev.dataTransfer?.setData("application/x-card", payload);
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
    el.classList.remove("dragging");
    markDropTargets(data.type, false);
  });
  // Click/tap menu
  el.addEventListener("click", (e)=>{ e.stopPropagation(); showCardOptions(el, data); });
}

/* Touch drag wiring */
function wireTouchDrag(el, data){
  let dragging=false, ghost=null, currentHover=null;
  const start = (ev)=>{
    clearAllActionMenus();
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

/* Global listeners */
document.addEventListener('dragover', (e)=>{
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tgt = findValidDropTarget(el, "SPELL");
  if (tgt){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
}, true);
document.addEventListener('drop', (ev)=>{
  const json = ev.dataTransfer?.getData('application/x-card') || '{}';
  let payload={}; try{ payload=JSON.parse(json); }catch{}
  const id = payload.id || ev.dataTransfer?.getData('text/card-id') || ev.dataTransfer?.getData('text/plain');
  const type = payload.type || ev.dataTransfer?.getData('text/card-type');
  if (!id || !type) return;
  const target = findValidDropTarget(ev.target, type);
  if (target){ ev.preventDefault(); ev.stopPropagation(); applyDrop(target, id, type); }
}, true);
document.addEventListener("click", clearAllActionMenus);

/* ---------- slots / flow ---------- */
function cardHTML(c){ return c ? cardShellHTML(c) : `<div class="title">Empty</div><div class="type">—</div><div class="divider"></div><div class="pip-track"></div><div class="textbox">—</div>`; }

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
    } else { d.textContent = "Spell Slot"; }

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
        try { state = playCardToSpellSlot(state, "player", id, i); render(); } catch {}
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
  } else { g.textContent = "Glyph Slot"; }

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
      try { state = setGlyphFromHand(state, "player", id); render(); } catch {}
    };
    g.addEventListener("dragenter", enter);
    g.addEventListener("dragover", over);
    g.addEventListener("dragleave", leave);
    g.addEventListener("drop", drop);
  }
  container.appendChild(g);
}

/* --- Flow title helper (left of board, outside grid) --- */
function ensureFlowTitle(){
  const wrap = document.querySelector(".flow-wrap");
  if (!wrap) return;
  let rail = wrap.querySelector(".flow-title-rail");
  if (!rail){
    rail = document.createElement("div");
    rail.className = "flow-title-rail";
    rail.innerHTML = `<div class="flow-title" aria-hidden="true">AETHER FLOW</div>`;
    wrap.appendChild(rail);
  }
}

async function animateFlowFall(node){
  if (!node) return;
  node.classList.add("flow-fall");
  await sleep(280);
}

async function renderFlow(flowArray){
  if (!flowRowEl) return;
  ensureFlowTitle();

  const nextIds = (flowArray || []).slice(0,5).map(c => c ? c.id : null);
  flowRowEl.replaceChildren();

  (flowArray || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c);
    if (c) attachPeekAndZoom(card, c);

    if (c){
      card.addEventListener("click", async ()=>{
        Emit('aetherflow:bought', { node: card });
        // fall off animation on the clicked card
        await animateFlowFall(card);
        try { state = buyFromFlow(state, "player", idx); await render(); } catch {}
      });
    }

    li.appendChild(card);

    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    const PRICE_BY_POS = [4,3,3,2,2];
    priceLbl.innerHTML = `${withAetherText("Æ")} ${PRICE_BY_POS[idx]||0} to buy`;
    li.appendChild(priceLbl);

    flowRowEl.appendChild(li);
  });

  /* --- End Turn Card after last slot --- */
  const endLi = document.createElement("li");
  endLi.className = "flow-card end-turn-holder";
  const endCard = document.createElement("article");
  endCard.className = "card end-turn";
  endCard.innerHTML = `
    <div class="title">End Turn</div>
    <div class="type" data-k="UTILITY">—</div>
    <div class="divider"></div>
    <div class="textbox">Pass priority and draw up next turn.</div>
  `;
  endCard.addEventListener("click", async ()=>{
    // small drop/fade for feedback
    endCard.classList.add("flow-fall");
    await sleep(240);
    await doEndTurn();
  });
  endLi.appendChild(endCard);
  flowRowEl.appendChild(endLi);

  prevFlowIds = nextIds;
}

/* ---------- trance UI ---------- */
function ensureTranceUI(){
  const templateHTML = `
    <div class="level" data-level="1">◇ I — Runic Surge</div>
    <div class="level" data-level="2">◇ II — Spell Unbound</div>
  `;
  const apply = (portraitImgEl, level=0)=>{
    if (!portraitImgEl) return;
    const holder = portraitImgEl.closest('.portrait');
    if (!holder) return;
    let t = holder.querySelector('.trance');
    if (!t){
      t = document.createElement('div');
      t.className = 'trance';
      holder.appendChild(t);
    }
    t.innerHTML = templateHTML;
    Array.from(t.querySelectorAll('.level')).forEach(el=>{
      const n = Number(el.getAttribute('data-level'));
      el.classList.toggle('active', (level|0) >= n);
    });
  };
  const pub = serializePublic(state) || {};
  const pLevel = pub.players?.player?.tranceLevel ?? 0;
  const aLevel = pub.players?.ai?.tranceLevel ?? 0;
  apply(playerPortrait, pLevel);
  apply(aiPortrait, aLevel);
}

/* ---------- playable pulse ---------- */
function highlightPlayableCards(){
  const pub = serializePublic(state) || {};
  const hand = pub.players?.player?.hand || [];
  const openSpell = firstOpenSpellSlotIndex(pub) >= 0;
  const glyphOpen = canSetGlyph(pub, {type:"GLYPH"}); // just checks glyph slot empty

  // map id -> class
  const pulseFor = (c)=>{
    const t = c.type;
    if (t==="SPELL" && openSpell) return "pulse-spell";
    if (t==="GLYPH" && glyphOpen) return "pulse-glyph";
    if (t==="INSTANT" && canCastInstant(pub, c)) return "pulse-instant";
    if (canChannel(c)) return `pulse-${t?.toLowerCase?.()||"spell"}`; // channelable
    return "";
  };

  const nodes = Array.from(handEl?.children || []);
  nodes.forEach(node=>{
    node.classList.remove("pulse-spell","pulse-glyph","pulse-instant");
    const id = node.dataset.cardId;
    const data = hand.find(h=> h.id===id);
    const cls = data ? pulseFor(data) : "";
    if (cls) node.classList.add(cls);
  });
}

/* ---------- render root ---------- */
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
  const s = ensureSafetyShape(serializePublic(state) || {});
  set(turnIndicator, el => el && (el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`));

  set(playerPortrait, el=> el && (el.src = s.players?.player?.weaver?.portrait || "./weaver_aria.jpg"));
  set(aiPortrait,     el=> el && (el.src = s.players?.ai?.weaver?.portrait     || "./weaver_morr.jpg"));
  set(playerName,     el=> el && (el.textContent = s.players?.player?.weaver?.name || "Player"));
  set(aiName,         el=> el && (el.textContent = s.players?.ai?.weaver?.name || "Opponent"));

  setAetherDisplay(playerAeEl, s.players?.player?.aether ?? 0);
  setAetherDisplay(aiAeEl,     s.players?.ai?.aether ?? 0);
  renderHearts($("player-hearts"), s.players?.player?.vitality ?? 5);
  renderHearts($("ai-hearts"),     s.players?.ai?.vitality ?? 5);

  ensureTranceUI();

  // HUD icons (kept)
  if (hudDeckBtn){
    hudDeckBtn.innerHTML = `
      <svg class="icon deck" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
        <rect x="18" y="14" width="28" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
        <rect x="14" y="10" width="28" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity=".85"/>
        <rect x="10" y="6"  width="28" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"/>
      </svg>`;
  }
  if (hudDiscardBtn){
    hudDiscardBtn.innerHTML = `
      <svg class="icon discard" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
        <path d="M18 22h28M18 30h28M18 38h28" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="14" y="16" width="36" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity=".8"/>
      </svg>`;
  }
  if (hudEndBtn){
    hudEndBtn.innerHTML = `
      <svg class="icon end" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
        <path d="M18 32h28" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M34 22l12 10-12 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;
  }

  renderSlots(playerSlotsEl, s.players?.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.players?.ai?.slots     || [], false);
  await renderFlow(s.flow);

  /* ----- HAND ----- */
  if (handEl){
    const oldIds = prevHandIds.slice();
    const newIds = (s.players?.player?.hand || []).map(c => c.id);

    handEl.replaceChildren();
    const domCards = [];

    (s.players?.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;
      el.innerHTML = cardHTML(c);

      if (!oldIds.includes(c.id)) el.classList.add('grey-hide-during-flight');

      wireDesktopDrag(el, c);
      wireTouchDrag(el, c);
      attachPeekAndZoom(el, c);

      // Click/tap (desktop listener already set)
      el.addEventListener("touchend", (e)=>{ e.stopPropagation(); showCardOptions(el, c); }, {passive:false});

      handEl.appendChild(el); domCards.push(el);
    });

    layoutHand(handEl, domCards);
    await nextFrame(); layoutHand(handEl, domCards);

    const addedNodes = domCards.filter(el => !oldIds.includes(el.dataset.cardId));
    if (addedNodes.length){
      handEl.classList.add('dealing');
      Emit('cards:deal', { nodes: addedNodes, stagger: 90 });
      setTimeout(()=>{
        addedNodes.forEach(n=> n.classList.remove('grey-hide-during-flight'));
        handEl.classList.remove('dealing');
      }, 800);
      bootDealt = true;
    } else if (!bootDealt && domCards.length){
      handEl.classList.add('dealing');
      domCards.forEach(n=> n.classList.add('grey-hide-during-flight'));
      Emit('cards:deal', { nodes: domCards, stagger: 90 });
      setTimeout(()=>{
        domCards.forEach(n=> n.classList.remove('grey-hide-during-flight'));
        handEl.classList.remove('dealing');
      }, 800);
      bootDealt = true;
    }

    prevHandIds = newIds;
  }

  highlightPlayableCards();
}


/* --------- discard & draw helpers ---------- */

// Animate discarding all cards in a side's hand, then clear the hand in state
async function discardHandAndAnimate(side = "player"){
  const container = side === "player" ? handEl : null;
  if (container){
    const nodes = Array.from(container.children);
    nodes.forEach(n => n.classList.add("discarding"));
    await sleep(340);
  }
  // true discard: no aether gain
  try {
    if (state?.players?.[side]){
      state.players[side].hand = [];
    }
  } catch(e){}
  await render();
}

// Simple AI turn: start -> draw to 5 -> (future: play) -> end
async function doAiTurn(){
  state = startTurn(state);
  const need = Math.max(0, 5 - (state.players.ai?.hand?.length || 0));
  if (need) state = drawN(state, "ai", need);
  await render();

  // (hook real AI plays here later)

  state = endTurn(state);
  await render();
}

/* ---------- turn loop ---------- */
async function doStartTurn(){
  state = startTurn(state);
  const active = state.activePlayer;
  const need   = Math.max(0, 5 - (state.players[active].hand?.length||0));
  if (need) state = drawN(state, active, need);
  await render();
}


// Full “end turn” that discards hand, runs AI, then returns to player with a fresh draw
async function doEndTurn(){
  // 1) player discards entire hand (no aether gain)
  await discardHandAndAnimate("player");

  // 2) pass to AI and run its turn
  state = endTurn(state);      // give priority to AI
  await doAiTurn();            // AI draws to 5 and ends turn

  // 3) back to player: start and draw a NEW hand up to 5
  await doStartTurn();
}


/* ---------- events ---------- */
$("btn-start-turn")?.addEventListener("click", doStartTurn);
$("btn-end-turn")?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async ()=>{ await doStartTurn(); });
