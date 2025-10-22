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

// add to imports from GameLogic.js
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
  withAetherText,
  advanceSpell,               // ← NEW
  resolveInstantFromHand,     // ← NEW
  drainEvents,                // ← NEW
  dealDamage,
} from "./GameLogic.js";


function withAetherIcons(txt){
  if (!txt) return "";
  return String(txt)
    .replaceAll('[[G]]', svgAetherGem(24))
    .replaceAll('[[A]]', svgAetherTemp(24))
    .replaceAll('[[Æ]]', `
      <span class="ae-generic" title="Aether (uses temporary first)">
        ${svgAetherTemp(21)}${svgAetherGem(21)}
      </span>
    `);
}



// ===== Version / Menu + Log UI =====
export const BRANCH_VERSION = "v2.63";
window.__BRANCH_VERSION__ = BRANCH_VERSION;

let LogStore = [];
const MAX_LOG = 80;
let logEls = { wrap: null, list: null, menuBtn: null, sheet: null };

function ensureTopLeftUI() {
  if (logEls.wrap) return logEls;

  // wrapper (never hide this; it holds the button)
  const wrap = document.createElement("div");
  wrap.className = "tl-wrap";
  // Give it a z-index so HUD/flow layers won’t cover the button
  wrap.style.position = "fixed";
  wrap.style.left = "10px";
  wrap.style.top = "10px";
  wrap.style.zIndex = "4000"; // above HUD (1200) & cinematic (2000)

  // Menu button
  const btn = document.createElement("button");
  btn.className = "menu-btn";
  btn.type = "button";
  btn.innerHTML = `
    <span class="hamburger" aria-hidden="true"></span>
    <span class="lbl">Menu</span>
    <span class="ver">${BRANCH_VERSION}</span>
  `;

  // Menu sheet
  const sheet = document.createElement("div");
  sheet.className = "menu-sheet";
  sheet.innerHTML = `
    <header>
      <strong>Game Menu</strong>
      <span class="ver-badge">Branch ${BRANCH_VERSION}</span>
      <button class="close" type="button" aria-label="Close">×</button>
    </header>
    <div class="menu-body">
      <div class="hint">Debug helpers (safe to ignore):</div>
      <div class="menu-row">
        <button class="mini" type="button" id="dbg-dmg-ai">Hit AI -1</button>
        <button class="mini" type="button" id="dbg-dmg-player">Hit You -1</button>
        <button class="mini" type="button" id="dbg-draw1">Draw 1</button>
      </div>

      <!-- Game Log block lives inside menu (hidden until open) -->
      <div class="game-log">
        <div class="log-title">Game Log</div>
        <div class="log-list" role="log" aria-live="polite"></div>
      </div>
    </div>
  `;

  // open/close handlers
  btn.addEventListener("click", () => sheet.classList.toggle("open"));
  sheet.querySelector(".close")?.addEventListener("click", () => sheet.classList.remove("open"));

  // Debug button wiring (unchanged)
  sheet.querySelector("#dbg-dmg-ai")?.addEventListener("click", async () => { 
    state = dealDamage(state, "ai", 1, { source: "debug" }); 
    await render(); 
  });
  sheet.querySelector("#dbg-dmg-player")?.addEventListener("click", async () => { 
    state = dealDamage(state, "player", 1, { source: "debug" }); 
    await render(); 
  });
  sheet.querySelector("#dbg-draw1")?.addEventListener("click", async () => {
    state = drawN(state, "player", 1);
    await render();
  });

  // Backdrop toggle row (keep as you had)
  sheet.querySelector(".menu-body").insertAdjacentHTML("beforeend", `
    <div class="menu-row">
      <button class="mini" type="button" id="toggle-backdrop">
        ${backdropOn ? 'Hide' : 'Show'} Character Backdrop
      </button>
    </div>
  `);
  sheet.querySelector('#toggle-backdrop')?.addEventListener('click', () => {
    toggleWeaverBackdrop();
    const b = sheet.querySelector('#toggle-backdrop');
    if (b) b.textContent = (backdropOn ? 'Hide' : 'Show') + ' Character Backdrop';
  });

  // Mount
  wrap.appendChild(btn);
  wrap.appendChild(sheet);
  document.body.appendChild(wrap);

  // cache refs to the list inside the menu
  logEls = { wrap, list: sheet.querySelector(".log-list"), menuBtn: btn, sheet };
  return logEls;
}


function logLine(text) {
  ensureTopLeftUI();
  const ts = new Date();
  const hh = String(ts.getHours()).padStart(2,"0");
  const mm = String(ts.getMinutes()).padStart(2,"0");
  const ss = String(ts.getSeconds()).padStart(2,"0");
  const line = `[${hh}:${mm}:${ss}] ${text}`;
  LogStore.push(line);
  if (LogStore.length > MAX_LOG) LogStore.shift();
  renderLogList();
}

function renderLogList() {
  if (!logEls.list) return;
  logEls.list.replaceChildren();
  LogStore.slice(-48).forEach(s => {
    const row = document.createElement("div");
    row.className = "log-row";
    row.textContent = s;
    logEls.list.appendChild(row);
  });
  logEls.list.scrollTop = logEls.list.scrollHeight;
}


// Portrait image sources (declare only once)
const PORTRAIT_SRC = {
  player: "/weaver_aria_Portrait.jpg",
  ai:     "/weaver_morr_Portrait.jpg",
};

// Safe setter (prevents infinite onerror loops)
function setPortrait(imgEl, primaryUrl, fallbackUrl = primaryUrl) {
  if (!imgEl) return;
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = fallbackUrl; };
  imgEl.src = primaryUrl;
}

const WEAVER_ART = {
  player: "./weaver_aria_Transparent.png",
  ai:     "./weaver_morr_Transparent.png",
};




/* optional AI module (safe if missing) */
let AI = null;
(async ()=> { try { AI = await import('./ai.js'); } catch {} })();

/* ---------- utils ---------- */
const $ = id => document.getElementById(id);
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const Emit  = (e,d)=> window.Grey?.emit?.(e,d);
const nextFrame = () => new Promise(requestAnimationFrame);
const onTransitionEnd = (node) => new Promise(res => node.addEventListener("transitionend", res, {once:true}));

// --- cinematic helper: find the live DOM node for a hand card and emit
// to can be a selector string or an Element. meta lets us pass slotIndex, etc.
function cineFromHandCard(cardId, to, pose = '', meta = {}) {
  const node = handEl?.querySelector(`.card[data-card-id="${cardId}"]`);
  if (node) Emit('spotlight:cine', { node, to, pose, ...meta });
}



function svgAetherTemp(size = 36) {
  return `
  <svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" class="icon-aether-temp">
    <path
      d="M7.5 14.5c2.4 2.2 5.7 1.7 7.3-.8 1.1-1.8.5-3.7-1.3-4.8-1.9-1.1-4.4-.7-5.7 1
         .9-3.3 4.7-4.9 7.7-3.3 3.1 1.6 4 5.2 2.1 8-2.1 3.1-6.6 3.6-9.5 1.1l-.6-.6"
      fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>`;
}


function svgAetherGem(size = 36){
  return `
  <svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" class="icon-aether-gem">
    <path d="M12 2l6 6-6 14-6-14 6-6z" fill="none" stroke="currentColor" stroke-width="1.8" />
  </svg>`;
}


// --- helpers for slot/node targeting
function rectOfAny(target, fallback) {
  if (!target) return fallback || centerRect();
  if (typeof target === 'string') {
    const n = document.querySelector(target);
    return rectOf(n) || fallback || centerRect();
  }
  return rectOf(target) || fallback || centerRect();
}

// Node-driven cinematics: PLAY/CHANNEL/INSTANT from hand, and Flow buys
Grey?.on?.('spotlight:cine', async ({ node, to, pose, slotIndex }) => {
  try {
    const id = node?.dataset?.cardId;
    const pub = serializePublic(state) || {};
    const hand = pub.players?.player?.hand || [];
    const flow = (pub.flow || []).filter(Boolean);
    const data = [...hand, ...flow].find(c => c.id === id);
    if (!data) return;

    const startRect = cachedRect(node) || centerRect();

    let destRect;
    if (pose === 'play-spell' && Number.isFinite(slotIndex)) {
      const sel = `.row.player .slot.spell[data-slot-index="${slotIndex}"]`;
      destRect = cachedRect(document.querySelector(sel)) || rectOfAny(to) || centerRect();
    } else {
      destRect = rectOfAny(to) || centerRect();
    }

    node.classList.add('grey-hide-during-flight');
    await playCinematic(data, startRect, destRect, { centerScale: 1.16, holdMs: 300, outMs: 260 });
    if (document.body.contains(node)) node.classList.remove('grey-hide-during-flight');
  } catch {}
});


// keep the flow “buy” cinematic consistent if you emit it
Grey?.on?.('aetherflow:bought', ({ node }) => {
  try {
    const flowIndex = Number(node?.dataset?.flowIndex || -1);
    const pub = serializePublic(state) || {};
    const c = (pub.flow || [])[flowIndex];
    if (!c) return;

    const startRect = cachedRect(node) || centerRect();
    const destRect = domRectOfDiscardHud();
    playCinematic(c, startRect, destRect, { centerScale: 1.10, holdMs: 220, outMs: 260 });
  } catch {}
});



/* ==== Weaver Backdrop Toggle ==== */

function ensureWeaverBackdropStyles() {
  if (document.getElementById("weaver-backdrop-style")) return;
  const css = `
    /* container always behind board */
    #weaver-backdrop {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      opacity: 0; transition: opacity .25s ease;
    }
    #weaver-backdrop.active { opacity: 1; }           /* full opacity when on */

    /* each portrait pins to a side, full height, no dimming */
    #weaver-backdrop img {
      position: fixed; bottom: 0;
      height: 100vh; width: auto; max-width: none;
      opacity: 1; filter: none; mix-blend-mode: normal;
      pointer-events: none; user-select: none;
    }
    #weaver-backdrop img.aria { left: 0; }            /* player → left */
    #weaver-backdrop img.morr { right: 0; }           /* opponent → right */
  `;
  const s = document.createElement("style");
  s.id = "weaver-backdrop-style";
  s.textContent = css;
  document.head.appendChild(s);
}


// one-time style for the small opponent portrait
if (!document.getElementById("portrait-mirror-style")) {
  const s = document.createElement("style");
  s.id = "portrait-mirror-style";
  s.textContent = `#ai-portrait{ transform: scaleX(-1); }`;
  document.head.appendChild(s);
}

function ensureWeaverBackdrop() {
  ensureWeaverBackdropStyles();
  let layer = document.getElementById("weaver-backdrop");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "weaver-backdrop";
    layer.innerHTML = `
      <img class="aria" alt="Aria backdrop"/>
      <img class="morr" alt="Morr backdrop"/>
    `;
    document.body.prepend(layer); // keep behind everything else
  }
  return layer;
}

let backdropOn = false; // state holder

function updateWeaverBackdrop() {
  const layer = ensureWeaverBackdrop();
  const aria = layer.querySelector(".aria");
  const morr = layer.querySelector(".morr");

  aria.src = WEAVER_ART.player;
  morr.src = WEAVER_ART.ai;


  layer.classList.toggle("active", !!backdropOn);  // full opacity when true
}

function toggleWeaverBackdrop() {
  backdropOn = !backdropOn;
  updateWeaverBackdrop();

  const btn = document.getElementById("toggle-backdrop");
  if (btn) {
    btn.textContent = backdropOn ? "Hide Character Backdrop" : "Show Character Backdrop";
  }
}









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

// manual damage tester — lets you do: window.dealDamage("ai", 2)
window.dealDamage = async (side, n = 1) => {
  state = dealDamage(state, side, n, { source: "manual" });
  await render();
};

/* ---------- event keys ---------- */
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


// ===== Log Grey bus events to the Game Log =====
Grey.on?.(Events.TURN_START, ({side}) => logLine(`Turn start → ${side}`));
Grey.on?.(Events.TURN_END,   ({side}) => logLine(`Turn end   → ${side}`));
Grey.on?.(Events.CARD_PLAYED, ({side, cardId, cost}) => logLine(`${side} PLAY spell ${cardId} (cost ${cost ?? 0})`));
Grey.on?.(Events.CARD_SET,    ({side, cardId}) => logLine(`${side} SET glyph ${cardId}`));
Grey.on?.(Events.CARD_CAST,   ({side, cardId, cost}) => logLine(`${side} CAST instant ${cardId} (cost ${cost ?? 0})`));
Grey.on?.(Events.CHANNEL,     ({side, cardId, gained}) => logLine(`${side} CHANNEL ${cardId} → +${gained} Æ (temp)`));
Grey.on?.(Events.BUY,         ({side, idx, price}) => logLine(`${side} BOUGHT flow[${idx}] for ${price} Æ`));
Grey.on?.(Events.AETHER_GAIN, ({side, amount, source}) => logLine(`${side} +${amount} Æ (${source||"effect"})`));


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

/* ---------- portrait Aether readout: split permanent vs temporary ---------- */
function setAetherDisplay(el, perm=0, temp=0){
  if (!el) return;
  const p = perm|0, t = temp|0;
  el.innerHTML = `
    <div class="ae-line">
      <span class="ae-ico perm" title="Aether Gem (permanent)">${svgAetherGem(48)}</span>
      <span class="ae-val perm">${p}</span>
    </div>
    <div class="ae-line ${t>0 ? 'show' : ''}">
      <span class="ae-ico temp" title="Aether (temporary; clears at end of turn)">${svgAetherTemp(48)}</span>
      <span class="ae-val temp">${t}</span>
    </div>
  `;
}


/* ---------- hand layout (with mobile tuning) ---------- */
function isMobileLandscape(){
  return document.body.classList?.contains('mobile-landscape');
}
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = isMobileLandscape() ? 14 : 22;
  const MIN_ANGLE = isMobileLandscape() ? 4  : 8;
  const totalAngle = N===1 ? 0 : clamp(MIN_ANGLE + (N-2)*2, MIN_ANGLE, MAX_ANGLE);
  const stepA  = N===1 ? 0 : totalAngle/(N-1);
  const startA = -totalAngle/2;
  const cw = cards[0]?.clientWidth || container.clientWidth / Math.max(1, N);
  const stepX = isMobileLandscape() ? cw * 0.86 : cw * 0.98;
  const startX = -stepX * (N-1) / 2;
  const LIFT = isMobileLandscape() ? 38 : 44;

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
  const pipTotal = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const prog = Math.min(Math.max(0, c.progress|0), pipTotal);
  const pipDots = `<div class="pip-track">${
    pipTotal>0
      ? Array.from({length:pipTotal}).map((_,i)=>`<span class="pip${i<prog?' filled':''}"></span>`).join("")
      : ""
  }</div>`;
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
    <div class="textbox">${withAetherIcons(withAetherText(cleanRulesText(c.text||"")))}</div>
    ${aetherChip}
  `;
}
function fillCardShell(div, data){ if (div) div.innerHTML = cardShellHTML(data); }

/* centered hover + press-and-hhold preview */
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



// Accessibility helper
function makeAccessibleCard(card) {
  card.tabIndex = 0; // makes the card focusable by keyboard
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", card.dataset.name || "Card");
  card.classList.add("cine-hover"); // adds hover animation from Patch 2
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
          const idx = firstOpenSpellSlot(serializePublic(state)||{});
          if (idx>=0){ await playSpellFromHandWithTemp("player", cardData.id, idx); }
        } else if (o.k === "set"){
          await setGlyphFromHandWithTemp("player", cardData.id);
        } else if (o.k === "channel"){
          // cinematic from the clicked hand card → discard HUD
          cineFromHandCard(cardData.id, '#btn-discard-hud', 'channel');
        
          const before = getAe("player");
          state = discardForAether(state, "player", cardData.id);
          const gained = getAe("player") - before;
          adjustAe("player", -gained); 
          addTemp("player", gained);
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
  try {
     if (target === hudDiscardBtn){
        // cinematic from the dragged hand card → discard HUD
        const el = handEl?.querySelector(`.card[data-card-id="${cardId}"]`);
        if (el) el.classList.add('grey-hide-during-flight'); // hide the real node (no local motion)
        cineFromHandCard(cardId, '#btn-discard-hud', 'channel');
      
        const before = getAe("player");
        state = discardForAether(state, "player", cardId);
        const gained = getAe("player") - before;
        adjustAe("player", -gained);
        addTemp("player", gained);
        Emit(Events.CHANNEL, { side:"player", cardId, gained });
        render();
        return;
      }



    if (target.classList.contains("glyph") && cardType==="GLYPH"){
      setGlyphFromHandWithTemp("player", cardId); render(); return;
    }

    if (target.classList.contains("spell") && cardType==="SPELL"){
      const idx = Number(target.dataset.slotIndex||0);
      playSpellFromHandWithTemp("player", cardId, idx); render(); return;
    }
  } catch (e) {}
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

/* Touch drag wiring (+tap to focus) */
function wireTouchDrag(el, data){
  let dragging=false, ghost=null, currentHover=null, focusTimer=null;
  const focusTapMs = 240;

  el.addEventListener("pointerdown", ()=>{ focusTimer = performance.now(); }, {passive:true});
  el.addEventListener("pointerup", ()=>{
    const dt = performance.now() - (focusTimer||0);
    if (dt < focusTapMs){
      Array.from(handEl.children).forEach(n=> n.classList.remove("is-focus"));
      el.classList.add("is-focus");
      const off = ()=>{ el.classList.remove("is-focus"); document.removeEventListener("pointerdown", off, true); };
      document.addEventListener("pointerdown", off, true);
    }
  }, {passive:true});

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

document.addEventListener('dragover', (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);

  // Try to detect the real card type from the drag payload
  let draggedType = e.dataTransfer?.getData('text/card-type') || '';
  if (!draggedType) {
    try {
      const payload = JSON.parse(e.dataTransfer?.getData('application/x-card') || '{}');
      draggedType = payload.type || '';
    } catch {}
  }

  // Fallback: probe both types if we couldn't read it yet
  const tgt = draggedType
    ? findValidDropTarget(el, draggedType)
    : (findValidDropTarget(el, "SPELL") || findValidDropTarget(el, "GLYPH"));

  if (tgt) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }
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

/* spend uses temp first, then perm */
function spendAe(side, amount){
  const need = Math.max(0, amount|0);
  const useTemp = Math.min(need, getTemp(side));
  if (useTemp) addTemp(side, -useTemp);
  const still = need - useTemp;
  if (still) adjustAe(side, -still);
  return need;
}
function getProgress(card){ return Math.max(0, card?.progress|0); }
function setProgress(card, n){ if (card) card.progress = Math.max(0, n|0); }
function advanceSpellAt(side, slotIndex){
  const slot = state?.players?.[side]?.slots?.[slotIndex];
  const c = slot?.card;
  if (!slot?.hasCard || !c || c.type !== "SPELL") return;

  // spend 1 Æ (temp first) — same as before
  if (getTotal(side) < 1){ showToast("Not enough Æther."); return; }
  spendAe(side, 1);

  // advance in logic; it will auto-discard when complete and enqueue an event
  state = advanceSpell(state, side, slotIndex, 1);

  // re-render quickly so the pip fills immediately
  render();
}

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

      // Highlight advanceable spells
      if (canAdvanceSpell(isPlayer ? "player" : "ai", slot)) {
        const track = art.querySelector(".pip-track");
        if (track) track.classList.add("can-advance");
      }


      // make pip track clickable to advance
      if (isPlayer && slot.card.type === "SPELL" && (slot.card.pip|0) > 0){
        const track = art.querySelector('.pip-track');
        if (track){
          const canAdv = canAdvanceSpell('player', slot);
      
          track.classList.toggle('can-advance', canAdv);
          track.title = canAdv ? 'Spend 1 Æther to advance' : '';
          track.tabIndex = canAdv ? 0 : -1;  // focusable only if actionable
          track.setAttribute('role', canAdv ? 'button' : 'presentation');
      
          // replace any previous handlers to avoid duplicates across re-renders
          track.onclick = canAdv ? (ev) => {
            ev.stopPropagation();
            advanceSpellAt('player', i);
            art.innerHTML = cardHTML(slot.card); // repaint pips fast
          } : null;
      
          track.onkeydown = canAdv ? (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              track.click();
            }
          } : null;
        }
      }
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
    
      // If this glyph was just set for this side, flip + spotlight once.
      if (isPlayer && lastGlyphJustSetFor === "player" ||
          !isPlayer && lastGlyphJustSetFor === "ai") {
        const slotNode = g;
        slotNode.classList.add('flip-spotlight');
        art.classList.add('glyph-flip-in');
        art.addEventListener('animationend', () => {
          slotNode.classList.remove('flip-spotlight');
          art.classList.remove('glyph-flip-in');
        }, { once:true });
        // clear the flag so it only triggers once
        lastGlyphJustSetFor = null;
      }
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
  card.dataset.name = c?.name || "Market card";
  card.innerHTML = cardHTML(c);


  const price = FLOW_PRICE_BY_POS[idx] || 0;
  const canAfford = !!c && playerAe >= price;

  if (!canAfford) card.setAttribute("aria-disabled", "true");
  if (c) attachPeekAndZoom(card, c);
    makeAccessibleCard(card);
  // 🔹 Step 4: add the buyable marker so CSS pulse runs
  if (c && canAfford) {
    card.classList.add("buyable");
  }

  if (c && canAfford){
    card.addEventListener("click", async ()=>{
      const useTemp = Math.min(price, (state.players.player.tempAether|0));
      adjustAe("player", useTemp); // virtual top-up
      try {
        // Spotlight & fly this exact DOM node
        Emit('aetherflow:bought', { node: card });

        // proceed with game logic
        state = buyFromFlow(state, "player", idx);
        addTemp("player", -useTemp);
      } catch (e) {
        adjustAe("player", -useTemp);
      }
      await render();
    });
  }

  li.appendChild(card);

  const priceLbl = document.createElement("div");
  priceLbl.className = "price-label";
  priceLbl.innerHTML = `
    <span class="flow-price" aria-label="${price} Aether to buy">
      ${withAetherIcons('[[Æ]]')}
      <span class="n">${price}</span>
    </span>`;
  li.appendChild(priceLbl);

  row.appendChild(li);
});

  prevFlowIds = nextIds;

  queueMicrotask(()=>{
    wrap.style.setProperty("--flow-width", `${Math.round(board.getBoundingClientRect().width)}px`);
  });
}

/* ---------- trance stripe under gem (levels only) ---------- */
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
  apply(aiPortrait, pub.players?.ai?.tranceLevel ?? 0);
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


function ensureFlowStyles(){
  if (document.getElementById('flow-style')) return;
  const s = document.createElement('style');
  s.id = 'flow-style';
  s.textContent = `
    /* rotate the rail title */
    .flow-title-rail .flow-title {
      transform: rotate(180deg);
      transform-origin: center;
    }

    /* cleaner price chip */
    .flow-board .price-label {
      margin-top: 6px;
      font-size: 12px;
      letter-spacing: .02em;
      opacity: .95;
      display: grid; place-items: center;
    }
    .flow-board .flow-price {
      display: inline-grid;
      grid-auto-flow: column;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 10px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.08);
      line-height: 1;
    }
    .flow-board .flow-price svg { display:block; }
    .flow-board .flow-price .n { font-size: 13px; }

    /* pulse for buyable cards */
    @keyframes buyablePulse {
      0%   { box-shadow: 0 0 0 0 rgba(255,255,255,0.22); transform: scale(1.00); }
      70%  { box-shadow: 0 0 0 12px rgba(255,255,255,0);  transform: scale(1.03); }
      100% { box-shadow: 0 0 0 0 rgba(255,255,255,0);     transform: scale(1.00); }
    }
    .flow-card .card.buyable:not([aria-disabled="true"]) {
      animation: buyablePulse 1.6s ease-out infinite;
      will-change: transform, box-shadow;
    }
  `;
  document.head.appendChild(s);
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


function ensureOutcomeOverlayStyles() {
  if (document.getElementById("outcome-style")) return;
  const s = document.createElement("style");
  s.id = "outcome-style";
  s.textContent = `
    /* Screen lock */
    body.modal-open {
      overflow: hidden;
    }
    /* Freeze board interactions while modal is up */
    body.modal-open .card,
    body.modal-open .flow-card,
    body.modal-open .game-menu,
    body.modal-open #hud-right-strip,
    body.modal-open .row,
    body.modal-open #hand {
      pointer-events: none !important;
    }
    body.modal-open .card { --hoverY: 0px; --hoverScale: 1; }

    #outcome-overlay {
      position: fixed; inset: 0; z-index: 3500;
      display: grid; place-items: center;
      backdrop-filter: blur(6px);
      background: rgba(0,0,0,.45);
      opacity: 0; pointer-events: none;
      transition: opacity .25s ease;
    }
    #outcome-overlay.open { opacity: 1; pointer-events: auto; }

    #outcome-sheet {
      min-width: 360px; max-width: 80vw;
      padding: 28px 24px;
      border-radius: 16px;
      background: rgba(18,18,18,.92);
      box-shadow: 0 10px 36px rgba(0,0,0,.55);
      border: 1px solid rgba(255,255,255,.08);
      text-align: center;
      outline: none;
    }

    #outcome-title {
      font-size: 42px; letter-spacing: .06em; margin: 8px 0 10px;
    }
    #outcome-title.win  { color: #b0ffd0; }
    #outcome-title.lose { color: #ffd0d0; }

    #outcome-sub { opacity:.85; margin-top:2px; }

    #outcome-btn {
      margin-top: 16px; padding: 10px 16px;
      border-radius: 10px;
      background: rgba(255,255,255,.08);
      color: #eee;
      border: 1px solid rgba(255,255,255,.12);
      cursor: pointer;
    }
  `;
  document.head.appendChild(s);
}


function ensureOutcomeOverlay() {
  ensureOutcomeOverlayStyles();
  let o = document.getElementById("outcome-overlay");
  if (!o) {
    o = document.createElement("div");
    o.id = "outcome-overlay";
    o.innerHTML = `
      <div id="outcome-sheet" role="dialog" aria-modal="true" aria-labelledby="outcome-title" tabindex="-1">
        <div id="outcome-title"></div>
        <div id="outcome-sub">Tap Retry to start a fresh duel.</div>
        <button id="outcome-btn" type="button">Retry?</button>
      </div>`;
    document.body.appendChild(o);

    const sheet = o.querySelector("#outcome-sheet");
    const btn   = o.querySelector("#outcome-btn");

    // Basic focus trap (one control, so simple)
    const keyHandler = (ev) => {
      if (ev.key === "Escape") closeOutcome();
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); }
      if (ev.key === "Tab") { ev.preventDefault(); btn.focus(); }
    };

    function openOutcome() {
      document.body.classList.add("modal-open");
      o.classList.add("open");
      sheet.focus();
      document.addEventListener("keydown", keyHandler);
    }

    function closeOutcome() {
      o.classList.remove("open");
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", keyHandler);
      // return focus to End Turn if present (reasonable default)
      document.getElementById("btn-endturn-hud")?.focus();
    }

    // expose controls
    o.__openOutcome = openOutcome;
    o.__closeOutcome = closeOutcome;

    btn.addEventListener("click", async () => {
      // reset game cleanly
      state = initState();
      await doStartTurn();
      closeOutcome();
    });
  }
  return o;
}


function showOutcome(type) { // "win" | "lose"
  const o = ensureOutcomeOverlay();
  const title = o.querySelector("#outcome-title");
  title.className = "";
  title.classList.add(type);
  title.textContent = type === "win" ? "YOU WIN" : "YOU LOSE";
  o.__openOutcome?.();
}


// ---------- cinematic helpers ----------
function ensureCinematicLayer() {
  let layer = document.querySelector('.cinematic-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'cinematic-layer';
    // make sure it always renders above board + HUD, but ignores clicks
    layer.style.position = 'fixed';
    layer.style.inset = '0';
    layer.style.zIndex = '2000';
    layer.style.pointerEvents = 'none';
    document.body.appendChild(layer);
  }
  return layer;
}

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top + r.height/2 };
}

// --- Cached rect lookup (performance patch)
let rectCache = new WeakMap();

function cachedRect(el) {
  if (!el) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
  if (!rectCache.has(el)) rectCache.set(el, rectOf(el));
  return rectCache.get(el);
}

function invalidateRectCache() {
  rectCache = new WeakMap();
}



function rectOfSelector(sel) {
  const node = document.querySelector(sel);
  return rectOf(node);
}
function centerRect(w = 260, h = 360) {
  const vw = innerWidth, vh = innerHeight;
  return { x: (vw - w)/2, y: (vh - h)/2, w, h, cx: vw/2, cy: vh/2 };
}
function makeFloatingCard(cardData) {
  const el = document.createElement('article');
  el.className = 'card cinematic-card';
  el.innerHTML = cardHTML(cardData);
  return el;
}


function ensureRightHudStrip() {
  const id = 'hud-right-strip';
  let strip = document.getElementById(id);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = id;
    Object.assign(strip.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '1200',
    });
    document.body.appendChild(strip);
  }

  // desired order top→bottom
  const order = ['btn-endturn-hud', 'btn-discard-hud', 'btn-deck-hud'];

  order.forEach(btnId => {
    const n = document.getElementById(btnId);
    if (!n) return;

    // hard reset any legacy positioning so the flex strip controls layout
    Object.assign(n.style, {
      position: 'static',
      top: '', right: '', bottom: '', left: '',
      margin: '0',
      transform: 'none',
      display: 'grid',
      placeItems: 'center',
      width: '52px',
      height: '52px',
      borderRadius: '12px',
      pointerEvents: 'auto'
    });

    if (n.parentElement !== strip) strip.appendChild(n);
  });
}




/**
 * Animate: startRect → center pose → destRect
 */
async function playCinematic(cardData, startRect, destRect, opts = {}) {
  const layer = ensureCinematicLayer();
  const ghost = makeFloatingCard(cardData);

  ghost.style.position = "fixed";
  ghost.style.left = `${startRect?.x ?? (innerWidth - 240)/2}px`;
  ghost.style.top  = `${startRect?.y ?? (innerHeight - 336)/2}px`;
  ghost.style.width = `${startRect?.w ?? 240}px`;
  ghost.style.height = `${startRect?.h ?? 336}px`;
  ghost.style.transformOrigin = "top left";
  ghost.style.willChange = "transform, opacity";
  ghost.classList.add("cine-glow");

  layer.appendChild(ghost);
  await nextFrame();

  // 👇 unify with board resolves
  const scaleMid = opts.centerScale ?? 1.16;
  const pose = centerRect((startRect?.w ?? 240) * scaleMid, (startRect?.h ?? 336) * scaleMid);
  ghost.style.transform = `translate(${(pose.x - (startRect?.x ?? pose.x))}px, ${(pose.y - (startRect?.y ?? pose.y))}px) scale(${scaleMid})`;
  ghost.style.opacity = '1';

  await sleep(opts.poseInMs ?? 240);
  ghost.classList.add('pose');
  await sleep(opts.holdMs ?? 360);

  const endX = (destRect?.x ?? pose.x);
  const endY = (destRect?.y ?? pose.y);
  const scaleOut = opts.endScale ?? 0.78;

  ghost.classList.remove('pose');
  await nextFrame();
  ghost.style.transform = `translate(${endX - (startRect?.x ?? pose.x)}px, ${endY - (startRect?.y ?? pose.y)}px) scale(${scaleOut})`;
  ghost.style.opacity = '0.001';

  await sleep(opts.outMs ?? 260);
  ghost.remove();
}



/** convenience */
function domRectOfDiscardHud() {
  const node = document.getElementById('btn-discard-hud');
  if (!node) return centerRect(); // fallback
  const r = node.getBoundingClientRect();
  const w = Math.min(r.width * 0.9, 220);
  const h = Math.min(r.height * 1.4, 300);
  return { x: r.left + (r.width - w)/2, y: r.top + (r.height - h)/2, w, h, cx: r.left + r.width/2, cy: r.top + r.height/2 };
}



/* ---------- temp aether helpers ---------- */
function sideObj(side){ return state?.players?.[side] || {}; }
function getAe(side){ return sideObj(side).aether|0; }
function getTemp(side){ return sideObj(side).tempAether|0; }
function adjustAe(side, delta){ sideObj(side).aether = Math.max(0, getAe(side)+ (delta|0)); }
function addTemp(side, delta){ sideObj(side).tempAether = Math.max(0, getTemp(side)+ (delta|0)); }
function getTotal(side){ return getAe(side) + getTemp(side); }



function canAdvanceSpell(side, slot){
  const c = slot?.card;
  if (!slot?.hasCard || !c || c.type !== "SPELL") return false;
  const need = Math.max(0, (c.pip|0) - (c.progress|0));
  return need > 0 && getTotal(side) >= 1;
}

function spotlightFromEvents(state){
  const evts = drainEvents(state) || [];

  evts.forEach(async (e) => {
    try {
      // ✅ Board-originated cards: we don’t have a node, so we use the slot rect.
      if (e.t === 'resolved' && e.source === 'spell' && Number.isFinite(e.slotIndex)) {
        const rowSel = `.row.${e.side || 'player'}`;
        const slotRect = rectOfSelector(`${rowSel} .slot.spell[data-slot-index="${e.slotIndex}"]`) || centerRect();
        const destRect = domRectOfDiscardHud();
        await playCinematic(e.cardData, slotRect, destRect, { centerScale: 1.16, holdMs: 300 });
      }

      if (e.t === 'resolved' && e.source === 'glyph') {
        const rowSel = `.row.${e.side || 'player'}`;
        const slotRect = rectOfSelector(`${rowSel} .slot.glyph`) || centerRect();
        const destRect = domRectOfDiscardHud();
        await playCinematic(e.cardData, slotRect, destRect, { centerScale: 1.12, holdMs: 300 });
      }

      if (e.t === "reveal" && e.source === "flow") {
      logLine(`Flow reveal → ${e.cardData?.name || e.cardId}`);
    } else if (e.t === "resolved" && e.source === "spell") {
      logLine(`${e.side} RESOLVED spell → ${e.cardData?.name || e.cardId}`);
    } else if (e.t === "resolved" && e.source === "instant") {
      logLine(`${e.side} RESOLVED instant → ${e.cardData?.name || e.cardId}`);
    } else if (e.t === "resolved" && e.source === "glyph") {
      logLine(`${e.side} RESOLVED glyph → ${e.cardData?.name || e.cardId}`);
    } else if (e.t === "resolved" && e.source === "buy") {
      logLine(`${e.side} BOUGHT → ${e.cardData?.name || e.cardId}`);
    } else if (e.t === "resolved" && (e.source === "discard-aether" || e.source === "hand-discard")) {
      logLine(`${e.side} DISCARD → ${e.cardData?.name || e.cardId}`);
    } else if (e.t === "damage") {
      logLine(`DAMAGE → ${e.side} -${e.amount}`);
    } else if (e.t === "draw") {
      logLine(`${e.side} draws ${e.amount}`);
    } else if (e.t === "aether") {
      logLine(`${e.side} gains ${e.amount} Æ`);
    }

    } catch (_) {}

  

    if (e.t === 'resolved' && e.source === 'glyph'){
      const rowSel = `.row.${e.side || 'player'}`;
      const slot = document.querySelector(`${rowSel} .slot.glyph`);
      if (slot){
        slot.classList.add('spotlight');
        slot.addEventListener('animationend', () => slot.classList.remove('spotlight'), { once:true });
      }
    }

    if (e.t === 'reveal' && e.source === 'flow' && Number.isFinite(e.flowIndex)){
      const flowCard = document.querySelector(`.flow-card:nth-child(${e.flowIndex + 1}) .card.market`);
      if (flowCard){
        flowCard.classList.add('spotlight');
        flowCard.addEventListener('animationend', () => flowCard.classList.remove('spotlight'), { once:true });
      }
    }

    if (e.t === 'damage' && (e.side === 'player' || e.side === 'ai')) {
      const id = e.side === 'player' ? 'player-hearts' : 'ai-hearts';
      const hearts = document.getElementById(id);
      if (hearts) {
        hearts.classList.add('hit');
        hearts.addEventListener('animationend', () => hearts.classList.remove('hit'), { once: true });
      }
    }
  });
}




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

  // 🔸 Use the SLOT as the destination (selector), not the inner .card
  const destSel = `.row.player .slot.spell[data-slot-index="${slotIndex}"]`;
  cineFromHandCard(cardId, destSel, 'play-spell', { slotIndex });

  try {
    state = playCardToSpellSlot(state, side, cardId, slotIndex);
    const slot = state?.players?.[side]?.slots?.[slotIndex];
    if (slot?.card && slot.card.type === "SPELL") setProgress(slot.card, 0);
    if (useTemp) addTemp(side, -useTemp);
    Emit(Events.CARD_PLAYED, {side, cardId, cost});
  } catch(e){
    if (useTemp) adjustAe(side, -useTemp);
    throw e;
  }
}

let lastGlyphJustSetFor = null;  // ← put near other module-level state

async function setGlyphFromHandWithTemp(side, cardId){
  // fly the card to the glyph slot
  const destSel = `.row.${side} .slot.glyph`;
  cineFromHandCard(cardId, destSel, 'set-glyph');

  state = setGlyphFromHand(state, side, cardId);
  lastGlyphJustSetFor = side;               // remember for flip effect on next render
  Emit(Events.CARD_SET, {side, cardId});
}


function ensureGlyphFlipStyles(){
  if (document.getElementById('glyph-flip-style')) return;
  const s = document.createElement('style');
  s.id = 'glyph-flip-style';
  s.textContent = `
    /* flip keyframes */
    @keyframes glyphFlipIn {
      0%   { transform: rotateY(0deg); }
      50%  { transform: rotateY(90deg); }
      100% { transform: rotateY(0deg); }
    }
    /* spotlight pulse already exists in your code; add a gentle outline for glyph sets */
    .slot.glyph.flip-spotlight { box-shadow: 0 0 0 2px rgba(255,255,255,.12) inset; }

    /* apply on the card node that just got set */
    .card.glyph-flip-in {
      transform-style: preserve-3d;
      animation: glyphFlipIn .45s ease both;
    }
    /* small “card back” flash midway (pseudo) */
    .card.glyph-flip-in::after {
      content:"";
      position:absolute; inset:0;
      background: radial-gradient(120% 120% at 50% 50%, rgba(255,255,255,.06), rgba(0,0,0,.6));
      border-radius: inherit;
      opacity: 0;
      animation: glyphBackReveal .45s ease both;
      pointer-events:none;
    }
    @keyframes glyphBackReveal {
      0%   { opacity: 0; }
      40%  { opacity: .9; }
      60%  { opacity: .9; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}




/* ---------- simple stack viewer modal ---------- */
function openStackModal(title, cards){
  let m = document.getElementById('stack-modal');
  if (!m){
    m = document.createElement('div');
    m.id = 'stack-modal';
    m.innerHTML = `
      <div class="stack-backdrop"></div>
      <div class="stack-sheet">
        <header><h3></h3><button type="button" class="close">×</button></header>
        <div class="stack-list"></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('.stack-backdrop').addEventListener('click', ()=> m.classList.remove('open'));
    m.querySelector('.close').addEventListener('click', ()=> m.classList.remove('open'));
  }
  m.querySelector('h3').textContent = title;
  const list = m.querySelector('.stack-list');
  list.replaceChildren();
  if (!cards.length){
    const empty = document.createElement('div');
    empty.className = 'stack-empty';
    empty.textContent = 'Empty';
    list.appendChild(empty);
  } else {
    cards.forEach(c=>{
      const row = document.createElement('div');
      row.className = 'stack-row';
      row.innerHTML = `
        <span class="nm">${c.name}</span>
        <span class="meta">${c.type}${(c.cost|0)?` · cost ${c.cost}`:''}${(c.pip|0)?` · pips ${c.pip}`:''}</span>`;
      list.appendChild(row);
    });
  }
  m.classList.add('open');
}

/* ---------- HUD: wire buttons ---------- */
import { getStack } from './GameLogic.js';

hudDeckBtn?.addEventListener('click', ()=>{
  const cards = getStack(state, 'player', 'deck');
  openStackModal(`Deck (${cards.length})`, cards);
});
hudDiscardBtn?.addEventListener('click', ()=>{
  const cards = getStack(state, 'player', 'discard');
  openStackModal(`Discard (${cards.length})`, cards);
});


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
    if (useTemp) addTemp(side, -useTemp);
  
    // cinematic from the hand card → discard HUD
    cineFromHandCard(cardId, '#btn-discard-hud', 'instant');
  
    // resolve to discard + event for spotlight
    state = resolveInstantFromHand(state, side, cardId);
    Emit(Events.CARD_CAST, {side, cardId, cost});
    await render();
  } catch(e) {
    if (useTemp) adjustAe(side, -useTemp);
    throw e;
  }

  return state;
};

/* ---------- render root ---------- */
function ensureSafetyShape(s){
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

    setPortrait(
      playerPortrait,
      (s.players?.player?.weaver?.portrait) ?? PORTRAIT_SRC.player,
      PORTRAIT_SRC.player
    );
    setPortrait(
      aiPortrait,
      (s.players?.ai?.weaver?.portrait) ?? PORTRAIT_SRC.ai,
      PORTRAIT_SRC.ai
    );

  playerName     && (playerName.textContent = s.players?.player?.weaver?.name || "Player");
  aiName         && (aiName.textContent     = s.players?.ai?.weaver?.name || "Opponent");

  invalidateRectCache();
  setAetherDisplay(playerAeEl, s.players?.player?.aether ?? 0, s.players?.player?.tempAether ?? 0);
  setAetherDisplay(aiAeEl,     s.players?.ai?.aether ?? 0,     s.players?.ai?.tempAether ?? 0);
  renderHearts($("player-hearts"), s.players?.player?.vitality ?? 5);
  renderHearts($("ai-hearts"),     s.players?.ai?.vitality ?? 5);

  ensureTranceUI();


const pv = s.players?.player?.vitality | 0;
const av = s.players?.ai?.vitality | 0;
if ((av <= 0 && pv > 0) || (pv <= 0 && av > 0)) {
  showOutcome(av <= 0 ? "win" : "lose");
}





  
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
  
  ensureRightHudStrip();
  renderSlots(playerSlotsEl, s.players?.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.players?.ai?.slots     || [], false);
  await renderFlow(s.flow);
  updateWeaverBackdrop();
  
  /* ----- HAND ----- */
  if (handEl){
    const oldIds = prevHandIds.slice();
    const newIds = (s.players?.player?.hand || []).map(c => c.id);

    handEl.replaceChildren();
    const domCards = [];

    (s.players?.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id;
      el.dataset.cardType = c.type;
      el.dataset.name = c.name || c.type || "Card";
      el.innerHTML = cardHTML(c);


      if (!oldIds.includes(c.id)) el.classList.add('grey-hide-during-flight');

      wireDesktopDrag(el, c);
      wireTouchDrag(el, c);
      attachPeekAndZoom(el, c);
      makeAccessibleCard(el);

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

  // inside your async function render() { ... } — at the very end, after all sub-renders:
spotlightFromEvents(state);
  
}

/* ---------- turn loop ---------- */
async function doStartTurn(){
  state = startTurn(state);

  if (!shuffledOnce){
    shuffleInPlace(state.players.player.deck || []);
    shuffleInPlace(state.players.ai.deck || []);
    shuffledOnce = true;
  }

  // clear temp aether at start
  state.players.player.tempAether = 0;
  state.players.ai.tempAether = 0;

  // Trance L1: +1 opening draw
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
  const nodes = Array.from(handEl?.children || []);
  nodes.forEach(n=> n.classList.add('discarding'));
  await sleep(220);

  Emit(Events.TURN_END, {side: state.activePlayer});

  // to AI
  state = endTurn(state);
  await doStartTurn();

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

  // back to player
  state = endTurn(state);
  await doStartTurn();
}

/* ---------- events ---------- */
$("btn-start-turn")?.addEventListener("click", doStartTurn);
$("btn-end-turn")?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
document.getElementById("zoom-overlay")?.addEventListener("click", closeZoom);

window.addEventListener("resize", () => {
  invalidateRectCache();
  layoutHand(handEl, Array.from(handEl?.children || []));
}, { passive: true });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeZoom();
});

document.addEventListener("click", clearAllActionMenus);




/* ---------- hand hover style fix (compose transforms) ---------- */
function ensureHandHoverStyles() {
  if (document.getElementById("hand-hover-style")) return;
  const s = document.createElement("style");
  s.id = "hand-hover-style";
  s.textContent = `
    /* Baseline composed transform (matches JS layoutHand) */
    #hand .card {
      --hoverY: 0px;
      --hoverScale: 1;
      transform:
        translate3d(var(--tx,0px), var(--ty,0px), 0)
        rotate(var(--rot,0deg))
        translateY(var(--hoverY))
        scale(var(--hoverScale));
      transition: transform 0.22s cubic-bezier(.25,.8,.3,1), box-shadow 0.2s ease;
      will-change: transform;
      backface-visibility: hidden;
      transform-origin: center bottom;
    }

    /* Hover raise + scale */
    #hand .card.cine-hover:hover,
    #hand .card.is-focus {
      --hoverY: -14px;
      --hoverScale: 1.05;
      z-index: 1000;
      box-shadow: 0 10px 26px rgba(0,0,0,.35);
    }

    /* Disable transition mid-drag or during deal-in animation */
    #hand .card.dragging,
    #hand .card.deal-in {
      transition: none !important;
    }

    /* Avoid transform flicker when hidden during cinematic */
    #hand .card.grey-hide-during-flight {
      opacity: 0;
      pointer-events: none;
      transform: translate3d(var(--tx,0px), var(--ty,40px), 0) scale(0.92);
    }
  `;
  document.head.appendChild(s);
}






/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureTopLeftUI();
  ensureWeaverBackdrop();     // make sure the backdrop exists before first render
  ensureRightHudStrip();
  ensureFlowStyles();
  ensureGlyphFlipStyles();    // ← existing
  ensureHandHoverStyles();    // ← NEW: compose transforms on hover

  await doStartTurn();
  logLine(`Boot on ${BRANCH_VERSION}`);
});


/* ---------- mobile-landscape mode ---------- */
(function mobileLandscapeMode() {
  const isPhone = /iPhone|Android.+Mobile|iPod/i.test(navigator.userAgent);
  const apply = () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const enable = isPhone && (isLandscape || shortSide <= 420);
    document.body.classList.toggle("mobile-landscape", !!enable);
  };
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply, { passive: true });
  document.addEventListener("DOMContentLoaded", apply);
})();



  


/* ========================================================================
   The Grey — v2.63 Patch 2 (append-only, minimal)
   Adds: hand staggered deal-in, flat temp Æ icon, advanceSpellAt()
   Skips: outcome modal, flow buyability (already present)
   ======================================================================== */

(function Patch2_Minimal_v263(){
  if (window.__GREY_PATCH2_MIN_APPLIED__) return;
  window.__GREY_PATCH2_MIN_APPLIED__ = true;

  // ---------- tiny utils ----------
  const $ = (id)=>document.getElementById(id);
  const nextFrame = ()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  function ensureStyle(id, cssText){
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('style');
    el.id = id;
    el.textContent = cssText.trim();
    document.head.appendChild(el);
    return el;
  }

  // ---------- CSS: flatten temporary Æ icon only ----------
  ensureStyle('grey-patch2-temp-ae-flat', `
    .icon-aether-temp, .ae-ico.temp {
      filter: none !important;
      text-shadow: none !important;
      box-shadow: none !important;
      opacity: 1 !important;
    }
  `);

  // ---------- Temp Æ icon: flat override (safe, idempotent) ----------
  (function ensureFlatSvgTemp(){
    const flatFn = function(size = 36){
      return `
        <svg viewBox="0 0 24 24" width="\${size}" height="\${size}" aria-hidden="true" class="icon-aether-temp">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>`;
    };
    // If a custom svgAetherTemp already exists and is “flat”, skip; else replace.
    try {
      const probe = (typeof window.svgAetherTemp === 'function') ? window.svgAetherTemp(24) : '';
      const hasGlow = /filter|feGaussian|radialGradient|stop-color|shadow/i.test(probe||'');
      if (typeof window.svgAetherTemp !== 'function' || hasGlow) {
        window.svgAetherTemp = flatFn;
      }
    } catch {
      window.svgAetherTemp = flatFn;
    }
  })();

  // ---------- Hand stagger pass ----------
  function staggerHand(){
    const hand = $("hand");
    if (!hand) return;
    const cards = Array.from(hand.querySelectorAll('.card'));
    let i = 0;
    cards.forEach(el=>{
      if (el.dataset && el.dataset.patch2Staggered) return;
      el.style.animationDelay = `${i*70}ms`; // 70ms steps
      el.dataset.patch2Staggered = "1";
      i++;
    });
    // Optional: let any cine listeners know
    try { window.Grey?.emit?.('cards:deal', { nodes: cards, stagger: 70 }); } catch {}
  }

  // ---------- advanceSpellAt helper (engine bridge) ----------
  if (typeof window.advanceSpellAt !== 'function'){
    window.advanceSpellAt = async function(slotIndex, steps=1){
      try{
        if (typeof window.advanceSpell !== 'function') throw new Error('advanceSpell missing');
        window.state = window.advanceSpell(window.state, "player", slotIndex|0, steps|0);
        if (typeof window.drainEvents === 'function'){
          let pending = window.drainEvents(window.state);
          while (pending && pending.length){
            pending = window.drainEvents(window.state);
          }
        }
        if (typeof window.render === 'function') await window.render();
        return true;
      } catch(e){
        console.warn('[Patch2 minimal] advanceSpellAt failed:', e);
        return false;
      }
    };
  }

  // ---------- Wrap render to run only the stagger pass (avoid outcome/buyability) ----------
  if (!window.__GREY_PATCH2_RENDER_WRAP_MIN__ && typeof window.render === 'function'){
    window.__GREY_PATCH2_RENDER_WRAP_MIN__ = true;
    const _render = window.render;
    window.render = async function(...args){
      const res = await _render.apply(this, args);
      try {
        staggerHand();
      } catch {}
      return res;
    };
  }

  // ---------- One-time bootstrap (in case script loads post-first-render) ----------
  (async function bootstrap(){
    await nextFrame();
    staggerHand();
  })();
})();



/* ========================================================================
   The Grey — v2.63  |  Turn + Hand Animations (append-only)
   - Soft animate-out on turn end / animate-in on next turn
   - Per-card draw animate-in (staggered)
   - Per-card discard animate-out (ghost clone)
   ======================================================================== */
(function HandTurnAnims_v263(){
  if (window.__GREY_TURN_HAND_ANIMS__) return;
  window.__GREY_TURN_HAND_ANIMS__ = true;

  const $ = (id)=>document.getElementById(id);
  const nextFrame = ()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  // ---------------- CSS ----------------
  (function ensureCSS(){
    if (document.getElementById('grey-turn-hand-anims')) return;
    const s = document.createElement('style');
    s.id = 'grey-turn-hand-anims';
    s.textContent = `
      /* Turn transition */
      .soft-turn-out { transition: opacity 240ms ease, transform 240ms ease; opacity:.75; transform: scale(.995); }
      .soft-turn-in  { animation: softTurnIn 260ms ease-out both; }
      @keyframes softTurnIn {
        0% { opacity:.6; transform: scale(.995); }
        100% { opacity:1; transform: scale(1); }
      }

      /* Card enter (draw) */
      .card--enter   { opacity:0; transform: translateY(8px); }
      .card--enter.card--entered { transition: opacity 220ms ease, transform 220ms ease; opacity:1; transform: translateY(0); }

      /* Card exit (discard) ghost */
      .card-ghost-exit {
        position:fixed; margin:0; z-index:9999; pointer-events:none;
        will-change: transform, opacity, filter;
        transition: transform 220ms ease, opacity 220ms ease, filter 220ms ease;
        opacity:1;
      }
      .card-ghost-exit.to-dust { opacity:0; filter: blur(2px); transform: translateY(-8px) scale(.98); }
    `.trim();
    document.head.appendChild(s);
  })();

  // ---------------- Turn soft animate in/out ----------------
  (function wireTurnTransition(){
    let prevSide = null;
    try {
      // If your bus exposes Events.* constants, use them; otherwise listen by name.
      const onFn = window.Grey?.on || window.Grey?.addEventListener || null;
      const Events = window.Events || {};
      const TURN_EVENT = Events.TURN_START || 'TURN_START';

      if (onFn){
        onFn(TURN_EVENT, ({side})=>{
          // Animate out when the last side ends; animate in for the new side
          const root = $("hand")?.parentElement || document.body;
          if (!root) return;
          // quick out->in sequence
          root.classList.add('soft-turn-out');
          setTimeout(()=>{
            root.classList.remove('soft-turn-out');
            root.classList.add('soft-turn-in');
            setTimeout(()=>root.classList.remove('soft-turn-in'), 300);
          }, 120);
          prevSide = side;
        });
      }
    } catch {}
  })();

  // ---------------- Hand animations: per-card enter/exit ----------------
  (function wireHandObserver(){
    const hand = $("hand");
    if (!hand) return;

    // Track currently present card ids (by data-card-id or a fallback hash)
    const idOf = (el)=> el?.dataset?.cardId || el?.getAttribute?.('data-id') || el?.querySelector?.('[data-card-id]')?.dataset?.cardId || null;

    // Fade/slide removed cards using a ghost clone at the same screen position
    function animateRemovalGhost(node){
      try{
        const rect = node.getBoundingClientRect();
        const ghost = node.cloneNode(true);
        ghost.classList.add('card-ghost-exit');
        ghost.style.left = rect.left + 'px';
        ghost.style.top  = rect.top  + 'px';
        ghost.style.width  = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        document.body.appendChild(ghost);
        // Force reflow then animate
        // eslint-disable-next-line no-unused-expressions
        ghost.offsetHeight;
        ghost.classList.add('to-dust');
        setTimeout(()=>ghost.remove(), 260);
      } catch {}
    }

    // Animate newly added cards with stagger
    function animateAddedCards(addedNodes){
      let i = 0;
      addedNodes.forEach(node=>{
        if (!(node instanceof HTMLElement)) return;
        if (!node.classList.contains('card')) return;
        node.classList.add('card--enter');
        node.style.transitionDelay = `${i*70}ms`;
        // ensure stagger applies after DOM paint
        requestAnimationFrame(()=>{
          node.classList.add('card--entered');
        });
        i++;
      });
      // Optional: let your cine pipeline know
      try { window.Grey?.emit?.('cards:deal', { nodes: addedNodes.filter(n=>n?.classList?.contains('card')), stagger: 70 }); } catch {}
    }

    // Observe additions/removals
    const obs = new MutationObserver((mutations)=>{
      const added = [];
      mutations.forEach(m=>{
        // For removals: animate a ghost for each removed .card
        m.removedNodes && m.removedNodes.forEach(node=>{
          if (!(node instanceof HTMLElement)) return;
          if (!node.classList?.contains('card')) return;
          animateRemovalGhost(node);
        });
        // For additions: collect new .card nodes for enter animation
        m.addedNodes && m.addedNodes.forEach(node=>{
          if (node instanceof HTMLElement && node.classList?.contains('card')) added.push(node);
        });
      });
      if (added.length) animateAddedCards(added);
    });
    obs.observe(hand, { childList:true, subtree:false });

    // Also run a pass after each render to ensure any freshly mounted cards get the enter treatment
    if (!window.__GREY_WRAP_RENDER_TURN_HAND__ && typeof window.render === 'function'){
      window.__GREY_WRAP_RENDER_TURN_HAND__ = true;
      const _render = window.render;
      window.render = async function(...args){
        const res = await _render.apply(this, args);
        try{
          // Any newly mounted cards without the marker get an immediate enter (no big delay)
          const newbies = Array.from(hand.querySelectorAll('.card:not([data-enter-mark])'));
          let i = 0;
          newbies.forEach(el=>{
            el.dataset.enterMark = '1';
            el.classList.add('card--enter');
            el.style.transitionDelay = `${i*70}ms`;
            requestAnimationFrame(()=>el.classList.add('card--entered'));
            i++;
          });
        }catch{}
        return res;
      };
    }
  })();

})();
