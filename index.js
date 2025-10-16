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
const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* ---------- state ---------- */
let state = initState();
let bootDealt = false;
let prevFlowIds = [null,null,null,null,null];
let prevHandIds = [];
let draggingType = "";

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
function setAetherDisplay(el, v=0){
  if (!el) return;
  el.innerHTML = `
    <span class="gem">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l6 6-6 14-6-14 6-6z"/>
        <text x="12" y="12" text-anchor="middle" dominant-baseline="central">${v|0}</text>
      </svg>
    </span>
    <strong class="val" aria-hidden="true">${v|0}</strong>
  `;
}

/* ---------- hand layout (MTGA-like fan) ---------- */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;

  // Wider fan & deeper arc (closer to MTGA)
  const MAX_ANGLE = 28, MIN_ANGLE = 10;
  const spread = Math.min(container.clientWidth * 0.90, 980);
  const totalAngle = N===1 ? 0 : clamp(MIN_ANGLE + (N-2)*2.6, MIN_ANGLE, MAX_ANGLE);
  const stepA = N===1 ? 0 : totalAngle/(N-1);
  const startA = -totalAngle/2;
  const stepX = N===1 ? 0 : spread/(N-1);
  const startX = -spread/2;
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
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
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
function fillCardShell(div, data){ if (div) div.innerHTML = cardShellHTML(data); }

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
  document.querySelectorAll(".row.player .slot.spell").forEach(s=> s.classList.toggle("drag-over", !!on && cardType==="SPELL"));
  const g = document.querySelector(".row.player .slot.glyph");
  if (g) g.classList.toggle("drag-over", !!on && cardType==="GLYPH");
  hudDiscardBtn?.classList.toggle("drop-ready", !!on);
}
function applyDrop(target, cardId, cardType){
  if (!target || !cardId) return;
  try {
    if (target === hudDiscardBtn){
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
function wireDesktopDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
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
  const tgt = findValidDropTarget(document.elementFromPoint(e.clientX, e.clientY), "SPELL"); // type checked in mark
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
hudDiscardBtn?.addEventListener('dragover', (e)=>{ e.preventDefault(); hudDiscardBtn.classList.add('drop-ready'); });
hudDiscardBtn?.addEventListener('dragleave', ()=> hudDiscardBtn.classList.remove('drop-ready'));
hudDiscardBtn?.addEventListener('drop', (e)=>{
  e.preventDefault(); hudDiscardBtn.classList.remove('drop-ready');
  const json = e.dataTransfer?.getData('application/x-card') || '{}';
  let payload={}; try{ payload=JSON.parse(json); }catch{}
  const id = payload.id || e.dataTransfer?.getData("text/card-id") || e.dataTransfer?.getData("text/plain");
  const type = payload.type || e.dataTransfer?.getData("text/card-type");
  if (id){ applyDrop(hudDiscardBtn, id, type); }
});

/* ---------- card html ---------- */
function cardHTML(c){ return c ? cardShellHTML(c) : `<div class="title">Empty</div><div class="type">—</div><div class="divider"></div><div class="pip-track"></div><div class="textbox">—</div>`; }

/* ---------- slots / flow ---------- */

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
  } else {
    g.textContent = "";
    const hint = document.createElement("div");
    hint.className = "slot-glyph-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = `
      <svg viewBox="0 0 24 24" width="28" height="28">
        <path d="M12 3l3 4-3 7-3-7 3-4zM5 10l4-1m6 1l4-1M7 16h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <div class="lbl">Glyph Slot</div>
    `;
    g.appendChild(hint);
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
      try { state = setGlyphFromHand(state, "player", id); render(); } catch {}
    };
    g.addEventListener("dragenter", enter);
    g.addEventListener("dragover", over);
    g.addEventListener("dragleave", leave);
    g.addEventListener("drop", drop);
  }
  container.appendChild(g);
} // <-- IMPORTANT: renderSlots ends here

/* --- Flow title helper (left of board, outside grid) --- */
function ensureFlowTitle(){
  const row = document.getElementById("flow-row");
  if (!row) return;

  // ensure a .flow-wrap parent so the title can sit outside the grid
  let wrap = row.closest(".flow-wrap");
  if (!wrap){
    wrap = document.createElement("div");
    wrap.className = "flow-wrap";
    row.parentNode.insertBefore(wrap, row);
    wrap.appendChild(row);
  }

  // add / keep the vertical title rail
  let rail = wrap.querySelector(".flow-title-rail");
  if (!rail){
    rail = document.createElement("div");
    rail.className = "flow-title-rail";
    rail.innerHTML = `<div class="flow-title" aria-hidden="true">AETHER FLOW</div>`;
    wrap.appendChild(rail);
  }
}

/* --- Small fall-off animation for bought flow cards --- */
async function animateFlowFall(node){
  if (!node) return;
  node.classList.add("flow-fall");
  await sleep(280);
}

/* Uses ensureFlowTitle + animateFlowFall */
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

  prevFlowIds = nextIds;
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

  // HUD icons
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
    </div>
  `;
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

  /* ----- HAND: no flash, smoother deal, MTGA spread ----- */
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

      handEl.appendChild(el); domCards.push(el);
    });

    layoutHand(handEl, domCards);

    const addedNodes = domCards.filter(el => !oldIds.includes(el.dataset.cardId));
    if (addedNodes.length){
      handEl.classList.add('dealing');
      addedNodes.forEach(n => { n.classList.add('deal-in'); });   // animate actual cards
      setTimeout(()=>{
        addedNodes.forEach(n=> n.classList.remove('grey-hide-during-flight','deal-in'));
        handEl.classList.remove('dealing');
      }, 400); // short total; CSS runs faster now
      bootDealt = true;
    } else if (!bootDealt && domCards.length){
      handEl.classList.add('dealing');
      domCards.forEach(n=> { n.classList.add('grey-hide-during-flight','deal-in'); });
      setTimeout(()=>{
        domCards.forEach(n=> n.classList.remove('grey-hide-during-flight','deal-in'));
        handEl.classList.remove('dealing');
      }, 400);
      bootDealt = true;
    }


    prevHandIds = newIds;
  }
}

/* --------- deck helpers ---------- */
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



/* ---------- turn loop ---------- */
async function doStartTurn(){
  state = startTurn(state);
  const active = state.activePlayer;

  // ensure we can draw (deck auto-reshuffle from discard if needed)
  reshuffleFromDiscard(active);

  const need = Math.max(0, 5 - (state.players[active].hand?.length||0));
  if (need){
    // if we still need more and deck is empty, reshuffle again (handles multi-draw)
    if ((state.players[active].deck?.length||0) < need) reshuffleFromDiscard(active);
    state = drawN(state, active, need);
  }
  await render();
}

async function doEndTurn(){ state = endTurn(state); await doStartTurn(); }

/* ---------- events ---------- */
$("btn-start-turn")?.addEventListener("click", doStartTurn);
$("btn-end-turn")?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
zoomOverlayEl?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async ()=>{ await doStartTurn(); });
