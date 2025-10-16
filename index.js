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

let AI = null;
(async ()=> { try { AI = await import('./ai.js'); } catch {} })();

/* ---------- utils ---------- */
const $ = id => document.getElementById(id);
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const Emit  = (e,d)=> window.Grey?.emit?.(e,d);
const nextFrame = () => new Promise(requestAnimationFrame);
const onTransitionEnd = (node) => new Promise(res => node.addEventListener("transitionend", res, {once:true}));

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

/* ---------- state ---------- */
let state = initState();
let bootDealt = false;
let prevFlowIds = [null,null,null,null,null];
let prevHandIds = [];
let shuffledOnce = false;

/* ---------- basic event helpers ---------- */
const Bus = window.Grey;
const Events = {
  TURN_START: 'turn.start',
  TURN_END:   'turn.end',
  CARD_PLAYED:'card.played',
  CARD_SET:   'card.set',
  CARD_CAST:  'card.cast',
  CHANNEL:    'card.channel',
  BUY:        'flow.buy',
  AETHER_GAIN:'aether.gain'
};

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

/* ---------- portrait Aether gem + TEMP overlay ---------- */
function setAetherDisplay(el, v=0, temp=0){
  if (!el) return;
  const val = v|0, tv = temp|0;
  el.innerHTML = `
    <span class="gem">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l6 6-6 14-6-14 6-6z"/>
        <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="3">${val}</text>
      </svg>
    </span>
    ${tv>0 ? `
    <span class="gem temp" title="Turn-only Aether">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l6 6-6 14-6-14 6-6z" opacity=".65"/>
        <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="3">${tv}</text>
      </svg>
    </span>` : ``}
  `;
}

/* ---------- hand layout ---------- */
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

/* ---------- card shell / preview ---------- */
function closeZoom(){ document.getElementById("zoom-overlay")?.setAttribute("data-open","false"); }
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
function fillCardShell(div, data){ if (div) div.innerHTML = cardShellHTML(data); }

/* centered hover + press-and-hold preview */
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
      if (peekEl){ fillCardShell(peekEl, data); peekEl.classList.add("show"); }
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

/* ---------- action popover ---------- */
function clearAllActionMenus(){ document.querySelectorAll(".action-pop").forEach(n => n.remove()); }
function firstOpenSpellSlotIndexFor(side, pub){
  const slots = pub.players?.[side]?.slots || [];
  for (let i=0;i<3;i++) if (!slots[i]?.hasCard) return i;
  return -1;
}
function firstOpenSpellSlot(pub){ return firstOpenSpellSlotIndexFor("player", pub); }
function canChannel(card){ return (card?.aetherValue|0) > 0; }
function canPlaySpell(pub, card){ return card?.type==="SPELL" && firstOpenSpellSlot(pub) >= 0; }
function canSetGlyph(pub, card){
  if (card?.type!=="GLYPH") return false;
  const slot = (pub.players?.player?.slots || [])[3];
  return slot && !slot.hasCard;
}
function canCastInstant(pub, card){
  if (card?.type!=="INSTANT") return false;
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
  if (canPlaySpell(pub, cardData))  opts.push({k:"play",    label:"Play"});
  if (canSetGlyph(pub, cardData))   opts.push({k:"set",     label:"Set"});
  if (canCastInstant(pub, cardData))opts.push({k:"cast",    label:"Cast"});
  if (canChannel(cardData))         opts.push({k:"channel", label:"Channel"});
  if (!opts.length) return;

  const pop = document.createElement("div");
  pop.className = `action-pop t-${(cardData.type||'X').toLowerCase()}`;
  opts.forEach(o=>{
    const b = document.createElement("button");
    b.type="button"; b.className = `rune-btn act-${o.k}`; b.textContent = o.label;
    b.addEventListener("click", async (ev)=>{
      ev.stopPropagation();
      try{
        if (o.k === "play"){
          const idx = firstOpenSpellSlotIndex(serializePublic(state)||{});
          if (idx>=0){ await playSpellFromHandWithTemp("player", cardData.id, idx); }
        } else if (o.k === "set"){
          await setGlyphFromHandWithTemp("player", cardData.id);
        } else if (o.k === "channel"){
          const before = getAe("player");
          state = discardForAether(state, "player", cardData.id);
          const gained = getAe("player") - before;
          // move gained into temp only
          adjustAe("player", -gained); addTemp("player", gained);
          Emit(Events.CHANNEL, {side:"player", cardId:cardData.id, gained});
        } else if (o.k === "cast"){
          state = await window.castInstantFromHand(state, "player", cardData.id);
        }
      } catch(e){}
      clearAllActionMenus();
      await render();
    });
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  const r = cardEl.getBoundingClientRect();
  pop.style.left = `${r.left + r.width/2}px`;
  pop.style.top  = `${r.top  - 12}px`;
  pop.style.transform = "translate(-50%, -100%)";
}

/* ---------- DnD ---------- */
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
      const before = getAe("player");
      state = discardForAether(state, "player", cardId);
      const gained = getAe("player") - before;
      adjustAe("player", -gained); addTemp("player", gained);
      Emit(Events.CHANNEL, {side:"player", cardId, gained});
      render(); return;
    }
    if (target.classList.contains("glyph") && cardType==="GLYPH"){
      setGlyphFromHandWithTemp("player", cardId); render(); return;
    }
    if (target.classList.contains("spell") && cardType==="SPELL"){
      const idx = Number(target.dataset.slotIndex||0);
      playSpellFromHandWithTemp("player", cardId, idx); render(); return;
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
  el.addEventListener("touchend", (e)=>{ e.stopPropagation(); showCardOptions(el, data); end(e); }, {passive:false});
  el.addEventListener("touchcancel", end, {passive:false});
}

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

/* ---------- slot render ---------- */
function cardHTML(c){ return c ? cardShellHTML(c) : `<div class="title">Empty</div><div class="type">—</div><div class="divider"></div><div class="pip-track"></div><div class="textbox">—</div>`; }

function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];

  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);

    const label = document.createElement("div");
    label.className = "slot-title";
    label.textContent = "Spell Slot";
    d.appendChild(label);

    const slot = safe[i] || {hasCard:false, card:null};
    if (slot.hasCard && slot.card){
      const art = document.createElement("article");
      art.className = "card";
      art.innerHTML = cardHTML(slot.card);
      attachPeekAndZoom(art, slot.card);
      d.appendChild(art);
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
        try { playSpellFromHandWithTemp("player", id, i); render(); } catch {}
      };
      d.addEventListener("dragenter", enter);
      d.addEventListener("dragover", over);
      d.addEventListener("dragleave", leave);
      d.addEventListener("drop", drop);
    }
    container.appendChild(d);
  }

  // Glyph
  const g = document.createElement("div");
  g.className = "slot glyph";

  const gLabel = document.createElement("div");
  gLabel.className = "slot-title";
  gLabel.textContent = "Glyph Slot";
  g.appendChild(gLabel);

  const rune = document.createElement("div");
  rune.className = "slot-rune";
  rune.innerHTML = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6l4 6-4 12-4-12 4-6zM10 22l8-2M38 22l-8-2M14 32h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  g.appendChild(rune);

  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  if (glyphSlot.hasCard && glyphSlot.card){
    const art = document.createElement("article");
    art.className = "card";
    art.innerHTML = cardHTML(glyphSlot.card);
    attachPeekAndZoom(art, glyphSlot.card);
    g.appendChild(art);
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
      try { setGlyphFromHandWithTemp("player", id); render(); } catch {}
    };
    g.addEventListener("dragenter", enter);
    g.addEventListener("dragover", over);
    g.addEventListener("dragleave", leave);
    g.addEventListener("drop", drop);
  }
  container.appendChild(g);
}

/* --- Flow fall-off animation helper --- */
async function animateFlowFall(node){
  if (!node) return;
  node.classList.add("flow-fall");
  await onTransitionEnd(node);
}

// Map flow-slot index → price (4,3,3,2,2)
const FLOW_PRICE_BY_POS = [4,3,3,2,2];

/* Flow scaffold: .flow-wrap → [title-rail][.flow-board → #flow-row] */
function ensureFlowScaffold(){
  const row = document.getElementById("flow-row");
  if (!row) return null;

  let board = row.closest(".flow-board");
  if (!board){
    board = document.createElement("div");
    board.className = "flow-board";
    row.parentNode.insertBefore(board, row);
    board.appendChild(row);
  }

  let wrap = board.closest(".flow-wrap");
  if (!wrap){
    wrap = document.createElement("div");
    wrap.className = "flow-wrap";
    board.parentNode.insertBefore(wrap, board);
    wrap.appendChild(board);
  }

  let rail = wrap.querySelector(".flow-title-rail");
  if (!rail){
    rail = document.createElement("div");
    rail.className = "flow-title-rail";
    rail.innerHTML = `<div class="flow-title" aria-hidden="true">AETHER FLOW</div>`;
    wrap.insertBefore(rail, board);
  }

  return { wrap, board, row };
}

async function renderFlow(flowArray){
  if (!flowRowEl) return;
  const scaffold = ensureFlowScaffold(); if (!scaffold) return;
  const { wrap, board, row } = scaffold;

  const nextIds = (flowArray || []).slice(0,5).map(c => c ? c.id : null);
  row.replaceChildren();

  const playerAe = getTotal("player");

  (flowArray || []).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li");
    li.className = "flow-card";

    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c);

    const price = FLOW_PRICE_BY_POS[idx] || 0;
    const canAfford = !!c && playerAe >= price;

    if (!canAfford) card.setAttribute("aria-disabled", "true");
    if (c) attachPeekAndZoom(card, c);

    if (c && canAfford){
      card.addEventListener("click", async ()=>{
        // top-up permanent with temp just before purchase (so GameLogic sees enough),
        // then reduce temp by the amount we virtually topped up.
        const useTemp = Math.min(price, (state.players.player.tempAether|0));
        adjustAe("player", useTemp); // virtual top-up
        try {
          card.classList.add("flow-fall");
          await new Promise(r=>setTimeout(r, 160));
          state = buyFromFlow(state, "player", idx);
          addTemp("player", -useTemp); // spend temp
        } catch(e){
          // undo top-up on failure
          adjustAe("player", -useTemp);
        }
        Emit(Events.BUY, {side:"player", idx, price});
        await render();
      });
    }

    li.appendChild(card);

    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    priceLbl.innerHTML = `${withAetherText("Æ")} ${price} to buy`;
    li.appendChild(priceLbl);

    row.appendChild(li);
  });

  prevFlowIds = nextIds;

  queueMicrotask(()=>{
    wrap.style.setProperty("--flow-width", `${Math.round(board.getBoundingClientRect().width)}px`);
  });
}

/* ---------- trance under gem + pulse ---------- */
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
    if (!t){ t = document.createElement('div'); t.className = 'trance'; }
    t.innerHTML = templateHTML;
    Array.from(t.querySelectorAll('.level')).forEach(el=>{
      const n = Number(el.getAttribute('data-level'));
      el.classList.toggle('active', (level|0) >= n);
    });
    holder.appendChild(t);
  };
  const pub = serializePublic(state) || {};
  apply(playerPortrait, pub.players?.player?.tranceLevel ?? 0);
  apply(aiPortrait,     pub.players?.ai?.tranceLevel ?? 0);
}

function highlightPlayableCards(){
  const pub = serializePublic(state) || {};
  const hand = pub.players?.player?.hand || [];
  const openSpell = firstOpenSpellSlot(pub) >= 0;
  const glyphOpen = canSetGlyph(pub, {type:"GLYPH"});
  const nodes = Array.from(handEl?.children || []);
  nodes.forEach(node=>{
    node.classList.remove("pulse-spell","pulse-glyph","pulse-instant");
    const id = node.dataset.cardId;
    const c = hand.find(h=> h.id===id);
    if (!c) return;
    if (c.type==="SPELL"   && openSpell)               node.classList.add("pulse-spell");
    else if (c.type==="GLYPH" && glyphOpen)           node.classList.add("pulse-glyph");
    else if (c.type==="INSTANT" && canCastInstant(pub,c)) node.classList.add("pulse-instant");
    else if (canChannel(c))                           node.classList.add(`pulse-${c.type?.toLowerCase?.()||"spell"}`);
  });
}

/* ---------- deck helpers ---------- */
function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function reshuffleFromDiscard(side = "player"){
  const p = state?.players?.[side];
  if (!p) return;
  const deck = p.deck || (p.deck = []);
  const disc = p.discard || (p.discard = []);
  if (deck.length === 0 && disc.length > 0){
    deck.push(...disc.splice(0, disc.length));
    shuffleInPlace(deck);
  }
}

/* ---------- temp aether helpers ---------- */
function sideObj(side){ return state?.players?.[side] || {}; }
function getAe(side){ return sideObj(side).aether|0; }
function getTemp(side){ return sideObj(side).tempAether|0; }
function adjustAe(side, delta){ sideObj(side).aether = Math.max(0, getAe(side)+ (delta|0)); }
function addTemp(side, delta){ sideObj(side).tempAether = Math.max(0, getTemp(side)+ (delta|0)); }
function getTotal(side){ return getAe(side) + getTemp(side); }

/* ---------- wrappers that honor temp aether + trance ---------- */
function tranceDiscount(side, cost){
  const lvl = sideObj(side).tranceLevel|0;
  if (lvl >= 2) return Math.max(0, (cost|0) - 1);
  return cost|0;
}
async function playSpellFromHandWithTemp(side, cardId, slotIndex){
  const pub = serializePublic(state)||{};
  const hand = pub.players?.[side]?.hand||[];
  const card = hand.find(c=> c.id===cardId);
  const rawCost = card?.cost|0;
  const cost = tranceDiscount(side, rawCost);
  const useTemp = Math.min(cost, getTemp(side));
  adjustAe(side, useTemp); // virtual top-up (GameLogic checks aether)
  try {
    state = playCardToSpellSlot(state, side, cardId, slotIndex);
    if (useTemp) addTemp(side, -useTemp);
    Emit(Events.CARD_PLAYED, {side, cardId, cost});
  } catch(e){
    if (useTemp) adjustAe(side, -useTemp); // undo on failure
    throw e;
  }
}
async function setGlyphFromHandWithTemp(side, cardId){
  // Assume glyphs have no play cost for now; if they do, mirror playSpell logic.
  state = setGlyphFromHand(state, side, cardId);
  Emit(Events.CARD_SET, {side, cardId});
}

/* Instant casting surface available to UI + AI */
window.castInstantFromHand = async function(_state, side, cardId){
  const pub = serializePublic(state)||{};
  const hand = pub.players?.[side]?.hand||[];
  const card = hand.find(c=> c.id===cardId);
  if (!card || card.type!=="INSTANT") return state;
  const rawCost = card.cost|0;
  const cost = tranceDiscount(side, rawCost);
  if (getTotal(side) < cost){ showToast("Not enough Æther."); return state; }
  const useTemp = Math.min(cost, getTemp(side));
  adjustAe(side, useTemp);
  try{
    // If you have a concrete resolver in GameLogic, call it here.
    // For now: simulate by discarding the Instant (gain no aether) and emitting event.
    // If your GameLogic has discardFromHand(state, side, cardId) use that; otherwise play to stack/resolve.
    // Here we reuse discardForAether with a zero gain hack: measure, then roll back gain to temp zero.
    const before = getAe(side);
    state = discardForAether(state, side, cardId);
    const gained = getAe(side) - before;
    if (gained>0){ adjustAe(side, -gained); } // Instants shouldn't generate aether here
    if (useTemp) addTemp(side, -useTemp);
    Emit(Events.CARD_CAST, {side, cardId, cost});
  }catch(e){
    if (useTemp) adjustAe(side, -useTemp);
    throw e;
  }
  return state;
};

/* ---------- render root ---------- */
function ensureSafetyShape(s){
  // add temp pools + trance level defaults
  for (const who of ["player","ai"]){
    s.players = s.players || {};
    s.players[who] = s.players[who] || {};
    if (typeof s.players[who].tempAether !== "number") s.players[who].tempAether = 0;
    if (typeof s.players[who].tranceLevel !== "number") s.players[who].tranceLevel = 0;
  }
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
  turnIndicator && (turnIndicator.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`);

  playerPortrait && (playerPortrait.src = s.players?.player?.weaver?.portrait || "./weaver_aria.jpg");
  aiPortrait     && (aiPortrait.src     = s.players?.ai?.weaver?.portrait     || "./weaver_morr.jpg");
  playerName     && (playerName.textContent = s.players?.player?.weaver?.name || "Player");
  aiName         && (aiName.textContent     = s.players?.ai?.weaver?.name || "Opponent");

  setAetherDisplay(playerAeEl, s.players?.player?.aether ?? 0, s.players?.player?.tempAether ?? 0);
  setAetherDisplay(aiAeEl,     s.players?.ai?.aether ?? 0,     s.players?.ai?.tempAether ?? 0);
  renderHearts($("player-hearts"), s.players?.player?.vitality ?? 5);
  renderHearts($("ai-hearts"),     s.players?.ai?.vitality ?? 5);

  ensureTranceUI();

  // HUD
  if (hudDeckBtn){
    const deckCount = (state?.players?.player?.deck?.length ?? 0);
    hudDeckBtn.innerHTML = `
      <div class="hud-deck-wrap">
        <svg class="icon deck" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
          <rect x="18" y="14" width="28" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
          <rect x="14" y="10" width="28" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity=".85"/>
          <rect x="10" y="6"  width="28" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"/>
        </svg>
        <span class="deck-count">${deckCount}</span>
      </div>`;
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

      el.addEventListener("touchend", (e)=>{ e.stopPropagation(); showCardOptions(el, c); }, {passive:false});

      handEl.appendChild(el); domCards.push(el);
    });

    layoutHand(handEl, domCards);
    await nextFrame(); layoutHand(handEl, domCards);

    const addedNodes = domCards.filter(el => !oldIds.includes(el.dataset.cardId));
    if (addedNodes.length){
      handEl.classList.add('dealing');
      addedNodes.forEach(n => n.classList.add('deal-in'));
      setTimeout(()=>{
        addedNodes.forEach(n=> n.classList.remove('grey-hide-during-flight','deal-in'));
        handEl.classList.remove('dealing');
      }, 400);
      bootDealt = true;
    } else if (!bootDealt && domCards.length){
      handEl.classList.add('dealing');
      domCards.forEach(n=> n.classList.add('grey-hide-during-flight','deal-in'));
      setTimeout(()=>{
        domCards.forEach(n=> n.classList.remove('grey-hide-during-flight','deal-in'));
        handEl.classList.remove('dealing');
      }, 400);
      bootDealt = true;
    }

    prevHandIds = newIds;
  }

  highlightPlayableCards();
}

/* ---------- trance progression (simple placeholder) ---------- */
function updateTranceFor(side){
  // Example trigger: if player spent ≥6 total aether this turn => Level 1; ≥10 => Level 2.
  // Track spend on the bus; here we just keep the state value stable.
  // Hook: If desired, attach bus .on handlers accumulating per-turn spend.
}

/* ---------- turn loop ---------- */
async function doStartTurn(){
  state = startTurn(state);

  // one-time randomize both decks at the very start
  if (!shuffledOnce){
    shuffleInPlace(state.players.player.deck || []);
    shuffleInPlace(state.players.ai.deck || []);
    shuffledOnce = true;
  }

  // clear temp aether at TURN START
  state.players.player.tempAether = 0;
  state.players.ai.tempAether = 0;

  // Trance L1: +1 opening draw for active player
  const side = state.activePlayer;
  const tranceL = (state.players[side].tranceLevel|0);
  const baseNeed = Math.max(0, 5 - (state.players[side].hand?.length||0));
  const bonus = tranceL >= 1 ? 1 : 0;
  const need = baseNeed + bonus;

  const active = side;
  reshuffleFromDiscard(active);
  if (need){
    if ((state.players[active].deck?.length||0) < need) reshuffleFromDiscard(active);
    state = drawN(state, active, need);
  }

  Emit(Events.TURN_START, {side});
  await render();
}

async function doEndTurn(){
  // discard animation on current player's hand
  const nodes = Array.from(handEl?.children || []);
  nodes.forEach(n=> n.classList.add('discarding'));
  await sleep(220);

  Emit(Events.TURN_END, {side: state.activePlayer});

  // Pass to AI
  state = endTurn(state);
  await doStartTurn(); // AI start/draw

  // Let AI act (one action per AI turn keeps things snappy)
  if (AI?.runAiTurn){
    const api = {
      getPublic: ()=> serializePublic(state)||{},
      getSideState: (side)=> state.players[side],
      findFirstOpenSpellSlot: (side)=> firstOpenSpellSlotIndexFor(side, serializePublic(state)||{}),
      canPay: (side, cost)=> getTotal(side) >= tranceDiscount(side, cost|0),
      pay: (side, cost)=> {
        const c = tranceDiscount(side, cost|0);
        const useTemp = Math.min(c, getTemp(side));
        adjustAe(side, useTemp);
        addTemp(side, -useTemp);
        adjustAe(side, -(c - useTemp));
      },
      playSpellFromHand: (side, id, i)=> (playSpellFromHandWithTemp(side, id, i), state),
      setGlyphFromHand:  (side, id)=> (setGlyphFromHandWithTemp(side, id), state),
      castInstantFromHand: (side, id)=> window.castInstantFromHand(state, side, id),
      channelFromHand: (side, id)=> {
        const before = getAe(side);
        state = discardForAether(state, side, id);
        const gained = getAe(side) - before;
        adjustAe(side, -gained); addTemp(side, gained);
        Emit(Events.CHANNEL, {side, cardId:id, gained});
        return state;
      },
      buyFromFlowIndex: (side, idx, price)=>{
        const useTemp = Math.min(price, getTemp(side));
        adjustAe(side, useTemp);
        state = buyFromFlow(state, side, idx);
        addTemp(side, -useTemp);
        Emit(Events.BUY, {side, idx, price});
        return state;
      },
      flowPriceAt: (i)=> FLOW_PRICE_BY_POS[i]||0
    };
    try { state = await AI.runAiTurn(state, api); } catch {}
    await render();
  }

  // Pass back to player
  state = endTurn(state);
  await doStartTurn();
}

/* ---------- events ---------- */
$("btn-start-turn")?.addEventListener("click", doStartTurn);
$("btn-end-turn")?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
document.getElementById("zoom-overlay")?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("click", clearAllActionMenus);

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async ()=>{ await doStartTurn(); });