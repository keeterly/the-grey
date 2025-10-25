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
  // (async ()=>{ try { await import('./animations.js?v=2571'); } catch {} })();
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
export const BRANCH_VERSION = "v2.64";
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



function ensureTopMenu() {
  let m = document.getElementById('game-menu');
  if (!m) {
    m = document.createElement('div');
    m.id = 'game-menu';
    m.className = 'game-menu';
    // minimal styling if you don’t have it already
    m.style.position = 'fixed';
    m.style.left = '10px';
    m.style.top = '10px';
    m.style.zIndex = 3000;
    m.style.display = 'grid';
    m.style.gap = '6px';
    document.body.appendChild(m);
  }
}


function ensureGlyphPlaceholderStyles(){
  if (document.getElementById('glyph-placeholder-style')) return;
  const s = document.createElement('style');
  s.id = 'glyph-placeholder-style';
  s.textContent = `
    /* All slots form their own stacking context */
    .row .slot { position: relative; z-index: 0; }

    /* Empty glyph sits above neighbors so the title is never cropped */
    .slot.glyph[data-empty] { z-index: 5; overflow: hidden; isolation: isolate; }

    /* Placeholder wrapper fills the slot and centers children */
    .slot.glyph .glyph-ph{
      position: absolute; inset: 0;
      display: grid; place-items: center;
      pointer-events: none;
    }

    /* Title centered with full width so it can truly center text */
    .slot.glyph .glyph-ph .ph-title{
      z-index: 2;
      width: 100%;
      text-align: center;
      white-space: nowrap;
      line-height: 1;
      font-size: 16px;
      letter-spacing: .02em;
      opacity: .95;
      text-shadow: 0 1px 0 rgba(0,0,0,.35);
    }

    /* Soft watermark rune behind title */
    .slot.glyph .glyph-ph .ph-rune{
      position: absolute; inset: 0;
      display: grid; place-items: center;
      z-index: 1; opacity: .20;
      filter: drop-shadow(0 0 6px rgba(0,0,0,.25));
      transform: scale(1.06);
    }
    .slot.glyph .glyph-ph .ph-rune svg{
      width: 62%; height: auto; max-width: 70%;
    }

    /* Hide placeholder whenever a glyph card is present */
    .slot.glyph.has-card .glyph-ph { display: none !important; }
  `;
  document.head.appendChild(s);
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


// === AI cinematic helper ===
// Triggers a flight from the AI mini hand if present,
// otherwise falls back to the AI deck icon as the start.
function cineFromAiMini(cardId, to, pose = '', meta = {}) {
  const nodeFromMini = document.querySelector(`#ai-mini-hand .mini-card[data-card-id="${cardId}"]`);
  const fallbackNode = document.getElementById('ai-mini-deck'); // exists in index.html
  const node = nodeFromMini || fallbackNode;

  // We always emit and include cardId so the handler can resolve data
  if (node) {
    Emit('spotlight:cine', { node, to, pose, cardId, ...meta });
  }
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
Grey?.on?.('spotlight:cine', async ({ node, to, pose, slotIndex, cardId }) => {
  try {
    // find data for the ghost
    const id = cardId || node?.dataset?.cardId;
    const pub = serializePublic(state) || {};

    // include both player and AI hands, plus flow
    const pHand = pub.players?.player?.hand || [];
    const aiHand = pub.players?.ai?.hand || [];
    const flow  = (pub.flow || []).filter(Boolean);
    const data = [...pHand, ...aiHand, ...flow].find(c => c.id === id);
    if (!data) return;

    const startRect = rectOf(node) || centerRect();

    // prefer SLOT rect when playing to a slot; choose the correct side
    let destRect;
    if (pose === 'play-spell' && Number.isFinite(slotIndex)) {
      const fromIsAI = !!(node.closest?.('.row.ai') || document.getElementById('ai-mini').contains(node));
      const rowSel = fromIsAI ? '.row.ai' : '.row.player';
      const sel = `${rowSel} .slot.spell[data-slot-index="${slotIndex}"]`;
      destRect = rectOf(document.querySelector(sel)) || rectOfAny(to) || centerRect();
    } else {
      destRect = rectOfAny(to) || centerRect();
    }

    // 🔒 hide the real node so you don't see two
    node.classList.add('grey-hide-during-flight');

    await playCinematic(data, startRect, destRect, { centerScale: 1.16, holdMs: 300, outMs: 260 });

    // if the node still exists (wasn't removed by render), unhide it
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

    const startRect = rectOf(node) || centerRect();
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


function ensureGlyphFlipStyles(){
  if (document.getElementById("glyph-flip-style")) return;
  const s = document.createElement("style");
  s.id = "glyph-flip-style";
  s.textContent = `
    /* Flip scaffold */
    .slot.glyph { position: relative; perspective: 900px; }
    .slot.glyph .glyph-holder {
      position: absolute; inset: 0;
      transform-style: preserve-3d;
      transition: transform .28s ease;
      will-change: transform;
      border-radius: var(--card-radius, 10px);
      outline: 0;
    }

    /* Two faces that occupy the same space */
    .slot.glyph .face {
      position: absolute; inset: 0;
      display: grid; place-items: center;
      border-radius: var(--card-radius, 10px);
      backface-visibility: hidden;
      transform-style: preserve-3d;
    }

    /* Back (the face-down look) */
    .slot.glyph .face.back {
      background: linear-gradient(180deg,#2f271f,#1f1914);
      border: 1px solid #5a4b37;
      color: #ccc;
    }

    /* Front starts rotated 180°, we keep the real card nested to isolate transforms */
    .slot.glyph .face.front { transform: rotateY(180deg); overflow: hidden; }
    .slot.glyph .face.front .front-inner { position:absolute; inset:0; }

    /* Reveal on hover/focus */
    .slot.glyph:hover .glyph-holder,
    .slot.glyph:focus-within .glyph-holder {
      transform: rotateY(180deg);
    }

    /* Prevent hover flicker */
    .slot.glyph .slot-title,
    .slot.glyph .slot-rune,
    .slot::after { pointer-events: none; }

    /* 🔒 When a glyph is present, hide any slot-title so it can’t appear on the revealed face */
    .slot.glyph.has-card .slot-title { display: none !important; }
  `;
  document.head.appendChild(s);
}




function ensureGlyphFlipDownStyles() {
  if (document.getElementById("glyph-flipdown-style")) return;
  const s = document.createElement("style");
  s.id = "glyph-flipdown-style";
  s.textContent = `
    @keyframes glyphFlipDown {
      0%   { transform: rotateY(0deg);   opacity: 1; }
      100% { transform: rotateY(90deg);  opacity: 0.6; }
    }
    @keyframes glyphFlipUp {
      0%   { transform: rotateY(90deg); opacity: 0.6; }
      100% { transform: rotateY(0deg);  opacity: 1; }
    }

    .slot.glyph.flipping-down .card {
      animation: glyphFlipDown 220ms ease forwards;
    }
    .slot.glyph.flipping-up .card {
      animation: glyphFlipUp 220ms ease forwards;
    }
  `;
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

let backdropOn = true; // state holder

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
  const btn = document.getElementById("btn-toggle-backdrop");
  if (btn) btn.textContent = backdropOn ? "Hide Character Backdrop" : "Show Character Backdrop";
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
// AI mini HUD refs
const aiMiniHandEl   = $("ai-mini-hand");
const aiMiniDeckEl   = $("ai-mini-deck");
const aiMiniDiscardEl= $("ai-mini-discard");


/* ---------- Pip track interactions (delegated, one-time) ---------- */
let pipHandlersBound = false;

function canAdvanceSlot(pub, slotIndex) {
  const s = pub?.players?.player?.slots?.[slotIndex];
  const c = s?.card;
  return !!(s?.hasCard && c?.type === "SPELL" && (c.progress|0) < (c.pip|0));
}

function refreshPipAdvanceClasses() {
  const pub = serializePublic(state) || {};
  document
    .querySelectorAll('.row.player .slot.spell')
    .forEach((slot) => {
      const i = Number(slot.dataset.slotIndex || -1);
      const track = slot.querySelector('.pip-track');
      if (track) track.classList.toggle('can-advance', canAdvanceSlot(pub, i));
    });
}

function ensurePipHandlers() {
  if (pipHandlersBound) return;
  pipHandlersBound = true;

  // Delegate from the player slots row so re-renders are safe
  document.getElementById('player-slots')?.addEventListener('click', async (ev) => {
    const track = ev.target.closest('.pip-track');
    if (!track) return;

    const slotEl = track.closest('.slot.spell');
    const i = Number(slotEl?.dataset?.slotIndex ?? -1);
    const pub = serializePublic(state) || {};

    // Guard rails: only advance if it's your turn and the slot can advance
    if (pub.activePlayer !== 'player') return;
    if (!Number.isFinite(i) || i < 0 || i > 2) return;
    if (!canAdvanceSlot(pub, i)) return;

    try {
      state = advanceSpell(state, "player", i, 1); // +1 pip
      await render();
    } catch (_) {}
  }, { passive: true });
}


/* ---------- state ---------- */
let state = initState();
let bootDealt = false;
let prevFlowIds = [null,null,null,null,null];
let prevHandIds = [];
let shuffledOnce = false;
const FLOW_BOUGHT_IDS = new Set();   // remember exact card IDs bought from Flow



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
Grey.on?.(Events.TURN_START, async ({side}) => {
  logLine(`Turn start → ${side}`);
  if (side === 'ai') {
    // slight pause for readability
    await new Promise(r => setTimeout(r, 300));
    state = await aiTakeTurn(state, aiCineBridge);
    await render();
    await new Promise(r => setTimeout(r, 300));
    state = endTurn(state);
    await render();
  }
});

Grey.on?.(Events.TURN_END,   ({side}) => logLine(`Turn end   → ${side}`));
Grey.on?.(Events.CARD_PLAYED, ({side, cardId, cost}) => logLine(`${side} PLAY spell ${cardId} (cost ${cost ?? 0})`));
Grey.on?.(Events.CARD_SET,    ({side, cardId}) => logLine(`${side} SET glyph ${cardId}`));
Grey.on?.(Events.CARD_CAST,   ({side, cardId, cost}) => logLine(`${side} CAST instant ${cardId} (cost ${cost ?? 0})`));
Grey.on?.(Events.CHANNEL,     ({side, cardId, gained}) => logLine(`${side} CHANNEL ${cardId} → +${gained} Æ (temp)`));
Grey.on?.(Events.BUY,         ({side, idx, price}) => logLine(`${side} BOUGHT flow[${idx}] for ${price} Æ`));
Grey.on?.(Events.AETHER_GAIN, ({side, amount, source}) => logLine(`${side} +${amount} Æ (${source||"effect"})`));


// === AI → cinematic bridge ===
function aiCineBridge(evt) {
  // evt.kind can be: ai-instant | ai-glyph | ai-spell | ai-channel
  const discardTarget = '#btn-discard-hud';
  const glyphTarget   = '.row.ai .slot.glyph';

  if (evt.kind === 'ai-spell') {
    cineFromAiMini(
      evt.cardId,
      `.row.ai .slot.spell[data-slot-index="${evt.slotIndex}"]`,
      'play-spell',
      { slotIndex: evt.slotIndex }
    );
  } else if (evt.kind === 'ai-glyph') {
    cineFromAiMini(evt.cardId, glyphTarget, 'set-glyph');
  } else {
    // instant or channel both fly to discard HUD
    cineFromAiMini(
      evt.cardId,
      discardTarget,
      evt.kind === 'ai-instant' ? 'cast-instant' : 'channel'
    );
  }
}



/* ---------- portrait hearts: containers + filled ---------- */
function heartSVG({ filled = true, size = 36 } = {}) {
  const s = size | 0;
  // one path, two styles: filled uses gradient; empty is outline-only
  return `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" class="heart-svg ${filled ? 'filled' : 'empty'}">
      <defs>
        <linearGradient id="heartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="#ff7a7a"/>
          <stop offset="100%" stop-color="#d65151"/>
        </linearGradient>
      </defs>
      <path class="heart-shape"
        d="M12 21s-7.2-4.5-9.5-8.1C.5 9.7 1.7 6.6 4.4 5.4 6.3 4.6 8.6 5 10 6.6c1.4-1.6 3.7-2 5.6-1.2 2.7 1.2 3.9 4.3 1.9 7.5C19.2 16.5 12 21 12 21z"
        fill="${filled ? 'url(#heartGrad)' : 'transparent'}"
        stroke="${filled ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.45)'}"
        stroke-width="${filled ? 0.6 : 1.4}" />
    </svg>`;
}

/**
 * Render hearts as "containers": show `maxHearts` outlines,
 * with the first `hp` hearts filled. Defaults to 5 max.
 */
function renderHearts(el, hp = 5, maxHearts = 5) {
  if (!el) return;
  const cur = Math.max(0, hp | 0);
  const max = Math.max(cur, maxHearts | 0) || 5;

  const nodes = [];
  for (let i = 0; i < max; i++) {
    const filled = i < cur;
    nodes.push(`<span class="heart">${heartSVG({ filled, size: 36 })}</span>`);
  }
  el.innerHTML = nodes.join("");
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

// --- Remove any legacy "Trance ... (Click / Space ...)" help block ---
function removeLegacyTranceText() {
  // 1) If it has a known id/class, remove quickly
  const known = document.querySelector('#trance-help, .trance-help, .trance-legacy');
  if (known) { known.remove(); return; }

  // 2) Fallback: remove any element whose text begins with "Trance" and contains an em-dash (old layout)
  const nodes = Array.from(document.querySelectorAll('body *'));
  for (const n of nodes) {
    const t = (n.textContent || '').trim().replace(/\s+/g, ' ');
    // The old block always had lines like “Trance …” and “I — … / II — …”
    if (/^Trance\b/i.test(t) && /—/.test(t)) {
      // protect real new track rows (they don’t start with "Trance")
      if (!n.closest('.trance-wrap') && !n.closest('.trance-row')) {
        n.remove();
        break;
      }
    }
  }
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

  ensureGlyphPlaceholderStyles();
  
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
        if (FLOW_BOUGHT_IDS.has(slot.card.id)) art.classList.add("flow-bought");
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

// Glyph Slot
const g = document.createElement("div");
g.className = "slot glyph";
g.tabIndex = 0; // for :focus-within keyboard reveal

// current glyph data
const glyphSlot = safe[3] || { isGlyph: true, hasCard: false, card: null };
g.classList.toggle("has-card", !!(glyphSlot.hasCard && glyphSlot.card));

// ---------- EMPTY: placeholder wrapper (title centered over rune) ----------
if (!glyphSlot.hasCard || !glyphSlot.card) {
  g.setAttribute("data-empty", "");  // used by CSS for z-index
  const ph = document.createElement("div");
  ph.className = "glyph-ph";         // placeholder wrapper (fills the slot)

  const t = document.createElement("div");
  t.className = "ph-title";
  t.textContent = "Glyph Slot";

  const r = document.createElement("div");
  r.className = "ph-rune";
  r.innerHTML = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6l4 6-4 12-4-12 4-6zM10 22l8-2M38 22l-8-2M14 32h20"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

  ph.appendChild(t);
  ph.appendChild(r);
  g.appendChild(ph);
}

// ---------- HAS CARD: flip scaffold ----------
if (glyphSlot.hasCard && glyphSlot.card) {
  ensureGlyphFlipStyles();

  const holder = document.createElement("div");
  holder.className = "glyph-holder";
  holder.tabIndex = 0;

  // Back face (face-down)
  const back = document.createElement("div");
  back.className = "face back";
  back.innerHTML = `
    <div class="slot-title">Glyph Set</div>
    <div class="slot-rune">
      <svg class="rune-big" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l6 6-6 14-6-14 6-6z" fill="currentColor"/>
      </svg>
    </div>`;
  holder.appendChild(back);

  // Front face with real card
  const front = document.createElement("div");
  front.className = "face front";
  const frontInner = document.createElement("div");
  frontInner.className = "front-inner";
  const cardNode = document.createElement("article");
  cardNode.className = "card";
  if (FLOW_BOUGHT_IDS.has(glyphSlot.card.id)) cardNode.classList.add("flow-bought");
  cardNode.innerHTML = cardHTML(glyphSlot.card);
  attachPeekAndZoom(cardNode, glyphSlot.card);
  frontInner.appendChild(cardNode);
  front.appendChild(frontInner);
  holder.appendChild(front);

  g.appendChild(holder);
}

// Drag & drop target
if (isPlayer) {
  const enter = ev => {
    const t = ev.dataTransfer?.getData("text/card-type");
    if (t === "GLYPH") { ev.preventDefault(); g.classList.add("drag-over"); ev.dataTransfer.dropEffect = "move"; }
  };
  const over = enter;
  const leave = () => g.classList.remove("drag-over");
  const drop = ev => {
    ev.preventDefault(); g.classList.remove("drag-over");
    const json = ev.dataTransfer?.getData("application/x-card") || "{}";
    let payload = {}; try { payload = JSON.parse(json); } catch {}
    const id = payload.id || ev.dataTransfer?.getData("text/card-id") || ev.dataTransfer?.getData("text/plain");
    const type = payload.type || ev.dataTransfer?.getData("text/card-type");
    if (type !== "GLYPH" || !id) return;
    try { setGlyphFromHandWithTemp("player", id); render(); } catch {}
  };
  g.addEventListener("dragenter", enter);
  g.addEventListener("dragover", over);
  g.addEventListener("dragleave", leave);
  g.addEventListener("drop", drop);
}

container.appendChild(g);





}




function renderAiMini(pub){
  if (!aiMiniHandEl) return;

  // Clear
  aiMiniHandEl.replaceChildren();

  const hand = pub?.players?.ai?.hand || [];
  const N = Math.min(6, hand.length);          // cap visuals at 6 backs
  const step = 12;                               // pixel spread
  const rot  = 6;                                // degrees spread

  for (let i=0;i<N;i++){
    const el = document.createElement("div");
    el.className = "mini-card";
    el.dataset.cardId = hand[i]?.id || "";       // so we can animate by id
    const offset = (i - (N-1)/2);
    el.style.setProperty("--dx", `${offset*step}px`);
    el.style.setProperty("--rot", `${offset*rot}deg`);
    aiMiniHandEl.appendChild(el);
  }

  // deck / discard counts (data is already in your public snapshot)
  const deckN    = (pub?.players?.ai?.deckCount    ?? 0) | 0;
  const discardN = (pub?.players?.ai?.discardCount ?? 0) | 0;
  if (aiMiniDeckEl)    aiMiniDeckEl.setAttribute("data-count", String(deckN));
  if (aiMiniDiscardEl) aiMiniDiscardEl.setAttribute("data-count", String(discardN));
}




/* --- Flow fall-off animation helper --- */
async function animateFlowFall(node){
  if (!node) return;
  node.classList.add("flow-fall");
  await onTransitionEnd(node);
}

// Map flow-slot index → price (4,3,2,2,2)
const FLOW_PRICE_BY_POS = [4, 3, 2, 2, 2];

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

  const nextIds = (flowArray || []).slice(0, 5).map(c => c ? c.id : null);
  row.replaceChildren();

  const playerAe = getTotal("player");

  (flowArray || []).slice(0, 5).forEach((c, idx) => {
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

    // buyable pulse
    if (c && canAfford) card.classList.add("buyable");

    // click to buy
    if (c && canAfford) {
      card.addEventListener("click", async () => {
        // prevent double buy
        if (card.dataset.buying === "1") return;
        card.dataset.buying = "1";
        card.setAttribute("aria-disabled", "true");

        const boughtId = c?.id || null;

        // visually disable the cell immediately
        li.style.pointerEvents = "none";
        li.style.opacity = "0.25";

        const price = FLOW_PRICE_BY_POS[idx] || 0;
        const useTemp = Math.min(price, (state.players.player.tempAether | 0));
        // virtual top-up (logic spends perm first)
        adjustAe("player", useTemp);

        try {
          // cinematic
          Emit("aetherflow:bought", { node: card });

          // commit purchase
          state = buyFromFlow(state, "player", idx);

          // burn the temp that actually contributed
          if (useTemp) addTemp("player", -useTemp);

          Emit(Events.BUY, { side: "player", idx, price });

          // remember for shimmer in hand/slots/spotlight
          if (boughtId) FLOW_BOUGHT_IDS.add(boughtId);
        } catch (e) {
          // rollback
          adjustAe("player", -useTemp);
          li.style.pointerEvents = "";
          li.style.opacity = "";
          card.dataset.buying = "";
          card.removeAttribute("aria-disabled");
        }

        await render();

        // ===== STEP C: clear any stale inline styles/flags if this node still exists
        if (document.body.contains(li)) {
          li.style.pointerEvents = "";
          li.style.opacity = "";
          card.dataset.buying = "";
          card.removeAttribute("aria-disabled");
        }
      });
    }

    // price label under each cell
    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    priceLbl.innerHTML = `
      <span class="flow-price-num" aria-label="${price} Aether to buy">
        <span class="n">${price}</span>
      </span>`;

    li.appendChild(card);
    li.appendChild(priceLbl);
    row.appendChild(li);
  });

  prevFlowIds = nextIds;

  // update measured width for any dependent styles
  queueMicrotask(() => {
    wrap.style.setProperty("--flow-width", `${Math.round(board.getBoundingClientRect().width)}px`);
  });
}






function ensureTranceStyles(){
  if (document.getElementById("trance-strip-style")) return;
  const s = document.createElement("style");
  s.id = "trance-strip-style";
  s.textContent = `
    .trance-strip{
      --tr-size: 40px;            /* diamond size (2× from your first version) */
      --tr-gap: 12px;
      --tr-fg: rgba(230,220,200,.86);
      --tr-dim: rgba(230,220,200,.30);
      --tr-active: #b9f0ff;
      margin-top: 18px;           /* extra space under Aether icons */
      display: grid;
      gap: 12px;
      user-select: none;
    }
    .trance-strip .tr-row{
      display: grid;
      grid-template-columns: var(--tr-size) 1fr;
      align-items: center;
      gap: var(--tr-gap);
      color: var(--tr-fg);
    }
    .trance-strip .badge{
      width: var(--tr-size); height: var(--tr-size);
      display: grid; place-items: center;
    }
    .trance-strip .badge svg{ width:100%; height:100%; display:block; }
    .trance-strip .badge .r{
      font-size: calc(var(--tr-size)*.66); /* Roman 1.5× feel */
      font-weight: 600;
      fill: currentColor;
      dominant-baseline: central;
      text-anchor: middle;
    }
    .trance-strip .meta{ display: grid; gap: 4px; align-content: center; }
    .trance-strip .label{
      font-size: calc(1em * 1.35);        /* title ~1.35× (your “10% less than 1.5×”) */
      letter-spacing: .02em;
      line-height: 1.05;
    }
    .trance-strip .effect{
      font-size: 16px;                     /* subtitle ~20% bigger than typical 13px */
      opacity: .85;
      line-height: 1.2;
    }
    .trance-strip .tr-row:not(.active){ color: var(--tr-dim); }
    .trance-strip .tr-row.active{
      color: var(--tr-active);
      filter: drop-shadow(0 0 6px rgba(110,220,255,.45));
    }
  `;
  document.head.appendChild(s);
}

function ensureFlowBoughtStyles(){
  if (document.getElementById('flow-bought-style')) return;
  const s = document.createElement('style');
  s.id = 'flow-bought-style';
  s.textContent = `
    .card.flow-bought {
      /* no position here — don’t override slot layout */
      filter: brightness(1.12) saturate(1.04);
      box-shadow: 0 0 10px rgba(173,216,230,0.25);
    }

    /* When a Flow-bought card sits inside a board slot, force full fill */
    .row .slot .card.flow-bought {
      position: absolute !important;
      inset: 0 !important;
    }

    /* ✨ Magical border shimmer */
    .card.flow-bought::before {
      content: "";
      position: absolute;
      inset: -2px;
      border-radius: var(--card-radius, 10px);
      background: linear-gradient(130deg, rgba(180,240,255,0.5), rgba(150,220,255,0.15), rgba(80,180,255,0.3));
      filter: blur(1px);
      opacity: 0.55;
      animation: flowBoughtPulse 2.6s ease-in-out infinite;
      z-index: 1;
      pointer-events: none;
    }

    @keyframes flowBoughtPulse {
      0%, 100% { opacity: 0.45; transform: scale(1); }
      50% { opacity: 0.75; transform: scale(1.03); }
    }

    /* keep inner content above glow */
    .card.flow-bought > * {
      position: relative;
      z-index: 2;
    }

    /* Spotlight/ghost cards can stay relatively positioned */
    .cinematic-card.flow-bought {
      filter: brightness(1.12) saturate(1.05);
      position: relative;
    }
    .cinematic-card.flow-bought::before {
      content: "";
      position: absolute;
      inset: -3px;
      border-radius: var(--card-radius, 10px);
      background: linear-gradient(130deg, rgba(160,230,255,0.6), rgba(120,200,255,0.2), rgba(100,180,255,0.35));
      filter: blur(1px);
      opacity: 0.6;
      animation: flowBoughtPulse 2.6s ease-in-out infinite;
      z-index: 1;
      pointer-events: none;
    }
    .cinematic-card.flow-bought > * {
      position: relative;
      z-index: 2;
    }
  `;
  document.head.appendChild(s);
}





// ===== Trance meta for all 5 weavers =====
const TRANCE_BOOK = {
  aria: {
    thresholds: { I: 4, II: 2 },
    stages: {
      I:  { name: "Runic Surge",    blurb: "When you advance a Spell: gain +1 Æ (once/turn)." },
      II: { name: "Spell Unbound",  blurb: "First Advance each turn costs 1 less Æ (min 0) and still grants +1 Æ." },
    },
  },
  enoch: {
    thresholds: { I: 3, II: 1 },
    stages: {
      I:  { name: "Glyph Channel",  blurb: "On set, Channel 1 (once/turn)." },
      II: { name: "Scribe’s Insight", blurb: "When a Glyph reveals, draw 1 card." },
    },
  },
  morr: {
    thresholds: { I: 4, II: 1 },
    stages: {
      I:  { name: "Gravecurrent",   blurb: "When a card leaves a Slot: gain +1 Æ (once/turn)." },
      II: { name: "Tithe of Flow",  blurb: "First Flow purchase each turn costs 1 less Æ and Channel 1." },
    },
  },
  veyra: {
    thresholds: { I: 4, II: 2 },
    stages: {
      I:  { name: "Spiral Spark",   blurb: "When you draw outside Draw Step: gain +1 temporary Æ (once/turn)." },
      II: { name: "Second Sight",   blurb: "On trigger, look at top 2 cards; reorder or put one into Discard." },
    },
  },
  kareth: {
    thresholds: { I: 3, II: 1 },
    stages: {
      I:  { name: "Ember Lash",     blurb: "After spending Æ: deal 1 damage to any target (once/turn)." },
      II: { name: "Furnace Rush",   blurb: "Each time you spend 3+ Æ in a turn, deal +1 extra damage." },
    },
  },
};

function getWeaverKey(weaverName="") {
  const k = String(weaverName || "").trim().toLowerCase();
  if (k.startsWith("aria"))   return "aria";
  if (k.startsWith("enoch"))  return "enoch";
  if (k.startsWith("morr"))   return "morr";
  if (k.startsWith("veyra"))  return "veyra";
  if (k.startsWith("kareth")) return "kareth";
  // default to Aria if unknown
  return "aria";
}



/* One-time CSS for the Trance track (whole-row glow/pulse when active) */
(function ensureTranceTrackStyles(){
  if (document.getElementById("trance-track-style")) return;
  const s = document.createElement("style");
  s.id = "trance-track-style";
  s.textContent = `
    .trance-wrap{ margin-top: 18px; }

    .trance-row{
      display: grid;
      gap: 12px;
      max-width: 520px;
    }

    .trance-step{
      position: relative;            /* needed for the ::before pulse */
      display: grid;
      grid-template-columns: 38px 1fr;
      align-items: center;
      gap: 12px;
      opacity: .82;
      transition: opacity .18s ease, filter .18s ease, transform .18s ease;
      overflow: visible;
    }

    .trance-step .diamond{
      width: 32px; height: 32px;
      border: 2px solid rgba(180,200,230,.85);
      transform: rotate(45deg);
      display: grid; place-items: center;
      border-radius: 5px;
      background: rgba(255,255,255,.02);
    }
    .trance-step .diamond .roman{
      transform: rotate(-45deg);
      font-size: 18px;
      line-height: 1;
    }

    .trance-copy .trance-name{
      font-size: 1.35rem;
      letter-spacing: .02em;
      margin-bottom: 4px;
    }
    .trance-copy .trance-desc{
      font-size: 1.0rem;
      opacity: .88;
    }

    /* Whole-row active styling */
    @keyframes tranceRowPulse {
      0%   { box-shadow: 0 0 0 0 rgba(130,190,255,.22); }
      70%  { box-shadow: 0 0 0 14px rgba(130,190,255,0); }
      100% { box-shadow: 0 0 0 0 rgba(130,190,255,0); }
    }
    .trance-step.active{
      opacity: 1;
      color: #b9f0ff;                       /* tint text when active */
      filter: drop-shadow(0 0 10px rgba(130,190,255,.22));
      transform: translateZ(0);
    }
    /* Pulsing halo behind the entire row (diamond + text) */
    .trance-step.active::before{
      content: "";
      position: absolute;
      inset: -6px -10px;                     /* extend a bit around the row */
      border-radius: 10px;
      background: radial-gradient(ellipse at center,
                  rgba(130,190,255,.12), transparent 70%);
      animation: tranceRowPulse 1.8s ease-out infinite;
      pointer-events: none;
    }

    /* Keep diamond border a touch brighter when active, but no separate pulse */
    .trance-step.active .diamond{
      border-color: rgba(160,210,255,1);
      background: radial-gradient(transparent 35%, rgba(130,190,255,.10));
    }
  `;
  document.head.appendChild(s);
})();







/* Character-specific thresholds, names, and effect text */
const TRANCE_DATA = {
  Aria: {
    thresholds: [4, 2],
    stages: [
      { name: "Runic Surge",   effect: "When you advance a Spell: gain +1 Æ (once/turn)." },
      { name: "Spell Unbound", effect: "First Advance each turn costs 1 less Æ (min 0) and still grants +1 Æ." }
    ]
  },
  Enoch: {
    thresholds: [3, 1],
    stages: [
      { name: "Sigil Primer",      effect: "When you set a Glyph: Channel 1 (once/turn)." },
      { name: "Revealed Insight",  effect: "When a Glyph reveals: draw 1 card." }
    ]
  },
  Morr: {
    thresholds: [4, 1],
    stages: [
      { name: "Gravecurrent Tithe", effect: "When a card leaves a Slot: gain +1 Æ (once/turn)." },
      { name: "Flow Bargain",       effect: "First Flow buy each turn costs 1 less Æ and Channel 1." }
    ]
  },
  Veyra: {
    thresholds: [4, 2],
    stages: [
      { name: "Spiral Spark",    effect: "When you draw outside your Draw Step: gain +1 temporary Æ (once/turn)." },
      { name: "Foresight Weave", effect: "Then look at the top 2 cards of your deck; reorder or put one into Discard." }
    ]
  },
  Kareth: {
    thresholds: [3, 1],
    stages: [
      { name: "Ember Lash",       effect: "After you spend Æ to play/advance: deal 1 damage to any target (once/turn)." },
      { name: "Combustion Rite",  effect: "Each time you spend 3+ Æ in a turn: deal 1 extra damage." }
    ]
  }
};


  

// ========= Trance config per Weaver (names use the first word before the comma) =========
const WEAVER_TRANCE = {
  Aria: {
    tiers: [
      {
        name: "Runic Surge",
        desc: "When you advance a Spell: gain +1 Æ (once/turn).",
        threshold: 4
      },
      {
        name: "Spell Unbound",
        desc: "First Advance each turn costs 1 less Æ (min 0) and still grants +1 Æ.",
        threshold: 2
      }
    ]
  },

  Enoch: {
    tiers: [
      {
        name: "Glyph Spark",
        desc: "When you set a Glyph: Channel 1 (once/turn).",
        threshold: 3
      },
      {
        name: "Studied Reveal",
        desc: "When a Glyph reveals: draw 1 card.",
        threshold: 1
      }
    ]
  },

  Morr: {
    tiers: [
      {
        name: "Gravecurrent",
        desc: "When a card leaves a Slot: gain +1 Æ (once/turn).",
        threshold: 4
      },
      {
        name: "Tithe of the Flow",
        desc: "Your first Aether Flow purchase each turn costs 1 less Æ and Channel 1.",
        threshold: 1
      }
    ]
  },

  Veyra: {
    tiers: [
      {
        name: "Forethought",
        desc: "When you draw outside your Draw Step: gain +1 temporary Æ (once/turn).",
        threshold: 4
      },
      {
        name: "Scry the Spiral",
        desc: "On trigger, look at the top 2 cards of your deck; reorder or discard one.",
        threshold: 2
      }
    ]
  },

  Kareth: {
    tiers: [
      {
        name: "Ember Lash",
        desc: "After you spend Æ to play/advance: deal 1 damage to any target (once/turn).",
        threshold: 3
      },
      {
        name: "Kindled Fury",
        desc: "Each time you spend 3+ Æ in a turn, deal 1 extra damage.",
        threshold: 1
      }
    ]
  }
};

// Map full UI names like "Aria, Runesurge Adept" → "Aria"
function getTranceCfg(weaverFullName = "") {
  const key = String(weaverFullName).split(",")[0].trim();
  return WEAVER_TRANCE[key] || WEAVER_TRANCE.Aria;
}


function renderTranceTrack(side = 'player') {
  const pub        = serializePublic(state) || {};
  const weaverName = pub.players?.[side]?.weaver?.name || 'Aria';
  const vitality   = pub.players?.[side]?.vitality | 0;
   const cfg = getTranceCfg(weaverName);


  const portraitImgEl = document.getElementById(`${side}-portrait`);
  if (!portraitImgEl) return;

  const holder = portraitImgEl.closest('.portrait') || portraitImgEl.parentElement;
  if (!holder) return;

  // ensure container under the aether strip
  let wrap = holder.querySelector('.trance-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'trance-wrap';
    holder.appendChild(wrap);
  }

  // ensure / clear row
  let strip = wrap.querySelector('.trance-row');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'trance-row';
    wrap.appendChild(strip);
  }
  strip.replaceChildren();

  // build tiers
  cfg.tiers.forEach((t, idx) => {
    const step = document.createElement('div');
    step.className = 'trance-step';

    // active when current HP <= threshold
    const isActive = vitality <= (t.threshold | 0);
    if (isActive) step.classList.add('active');

    // show threshold on hover
    step.title = `Activates at \u2264 ${t.threshold} hearts`;

    // diamond + roman
    const diamond = document.createElement('div');
    diamond.className = 'diamond';

    const roman = document.createElement('div');
    roman.className = 'roman';
    roman.textContent = idx === 0 ? 'I' : 'II';
    diamond.appendChild(roman);

    // copy
    const copy = document.createElement('div');
    copy.className = 'trance-copy';
    copy.innerHTML = `
      <div class="trance-name">${t.name}</div>
      <div class="trance-desc">${t.desc}</div>
    `;

    step.appendChild(diamond);
    step.appendChild(copy);
    strip.appendChild(step);
  });
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

    /* price label container */
    .flow-board .price-label {
      margin-top: 6px;
      opacity: .95;
      display: grid; place-items: center;
    }

    /* NEW: number-only circular badge (50% bigger than before) */
    .flow-board .flow-price-num {
      width: 42px; height: 42px;          /* circle */
      border-radius: 50%;
      display: grid; place-items: center;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      line-height: 1;
    }
    .flow-board .flow-price-num .n {
      font-size: 20px;                     /* ~50% bigger than prior 13px */
      letter-spacing: .02em;
    }

    /* pulse for buyable cards (unchanged) */
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


// --- Trance helpers ---
function roman(n){ return (["","I","II","III","IV","V"])[Math.max(0, n|0)] || String(n|0); }

/** Diamond svg with a numeral centered inside */
function diamondSVG(numeral="I", size=28){
  const s = size|0;
  return `
  <svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true" class="trance-diamond">
    <path d="M24 6 L39 21 L24 42 L9 21 Z" fill="none" stroke="currentColor" stroke-width="3" />
    <text x="24" y="24" text-anchor="middle" dominant-baseline="central"
          font-size="16" font-family="serif" class="num">${numeral}</text>
  </svg>`;
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
    }
    #outcome-title {
      font-size: 42px; letter-spacing: .06em; margin: 8px 0 10px;
    }
    #outcome-title.win  { color: #b0ffd0; }
    #outcome-title.lose { color: #ffd0d0; }
    #outcome-btn {
      margin-top: 16px; padding: 10px 16px;
      border-radius: 10px;
      background: rgba(255,255,255,.08);
      color: #eee;
      border: 1px solid rgba(255,255,255,.12);
      cursor: pointer;
    }`;
  document.head.appendChild(s);
}

function ensureOutcomeOverlay() {
  ensureOutcomeOverlayStyles();
  let o = document.getElementById("outcome-overlay");
  if (!o) {
    o = document.createElement("div");
    o.id = "outcome-overlay";
    o.innerHTML = `
      <div id="outcome-sheet">
        <div id="outcome-title"></div>
        <div id="outcome-sub">Tap Retry to start a fresh duel.</div>
        <button id="outcome-btn" type="button">Retry?</button>
      </div>`;
    document.body.appendChild(o);
    o.querySelector("#outcome-btn").addEventListener("click", async () => {
      state = initState();
      await doStartTurn();
      o.classList.remove("open");
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
  o.classList.add("open");
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
function rectOfSelector(sel) {
  const node = document.querySelector(sel);
  return rectOf(node);
}
function centerRect(w = 260, h = 360) {
  const vw = innerWidth, vh = innerHeight;
  return { x: (vw - w)/2, y: (vh - h)/2, w, h, cx: vw/2, cy: vh/2 };
}
// --- cinematic helpers ---
function makeFloatingCard(cardData) {
  const el = document.createElement('article');
  el.className = 'card cinematic-card';
  if (cardData?.id && FLOW_BOUGHT_IDS.has(cardData.id)) {
    el.classList.add('flow-bought');   // ← keep Aetherflow look in spotlight
  }
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

  // stacking options (all optional)
  const stackKey   = opts.stackKey || null;
  const stackIndex = Number.isFinite(opts.stackIndex) ? (opts.stackIndex|0) : 0;
  const stackDx    = Number.isFinite(opts.stackDx) ? opts.stackDx : 26;   // horizontal offset per index
  const stackDy    = Number.isFinite(opts.stackDy) ? opts.stackDy : 18;   // vertical offset per index

  ghost.style.position = "fixed";
  ghost.style.left = `${startRect?.x ?? (innerWidth - 240)/2}px`;
  ghost.style.top  = `${startRect?.y ?? (innerHeight - 336)/2}px`;
  ghost.style.width  = `${startRect?.w ?? 240}px`;
  ghost.style.height = `${startRect?.h ?? 336}px`;
  ghost.style.transformOrigin = "top left";
  ghost.style.willChange = "transform, opacity";

  // ensure the last stack member sits on top visually
  ghost.style.zIndex = String(2000 + stackIndex);

  ghost.classList.add("cine-glow");
  layer.appendChild(ghost);
  await nextFrame();

  // choose the common center pose (anchor) for this stack, so all members overlap nicely
  const baseScale = opts.centerScale ?? 1.16;
  let anchorPose;
  if (stackKey) {
    anchorPose = SPOTLIGHT_STACKS.get(stackKey);
    if (!anchorPose) {
      anchorPose = centerRect((startRect?.w ?? 240) * baseScale, (startRect?.h ?? 336) * baseScale);
      SPOTLIGHT_STACKS.set(stackKey, anchorPose);
    }
  } else {
    anchorPose = centerRect((startRect?.w ?? 240) * baseScale, (startRect?.h ?? 336) * baseScale);
  }

  // apply per-index offset so items are visibly stacked
  const offsetX = stackIndex * stackDx;
  const offsetY = stackIndex * stackDy;

  ghost.style.transform =
    `translate(${(anchorPose.x - (startRect?.x ?? anchorPose.x)) + offsetX}px, ${(anchorPose.y - (startRect?.y ?? anchorPose.y)) + offsetY}px) scale(${baseScale})`;
  ghost.style.opacity = '1';

  await sleep(opts.poseInMs ?? 240);
  ghost.classList.add('pose');
  await sleep(opts.holdMs ?? 360);

  const endX = (destRect?.x ?? anchorPose.x);
  const endY = (destRect?.y ?? anchorPose.y);
  const scaleOut = opts.endScale ?? 0.78;

  ghost.classList.remove('pose');
  await nextFrame();
  ghost.style.transform =
    `translate(${endX - (startRect?.x ?? anchorPose.x)}px, ${endY - (startRect?.y ?? anchorPose.y)}px) scale(${scaleOut})`;
  ghost.style.opacity = '0.001';

  await sleep(opts.outMs ?? 260);
  ghost.remove();

  // let the stack anchor auto-expire shortly after last item flies out
  if (stackKey) {
    setTimeout(() => SPOTLIGHT_STACKS.delete(stackKey), 1200);
  }
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
      // SPELL: board → discard cinematic
       if (e.t === 'resolved' && e.source === 'spell' && Number.isFinite(e.slotIndex)) {
          const rowSel = `.row.${e.side || 'player'}`;
          const slotRect = rectOfSelector(`${rowSel} .slot.spell[data-slot-index="${e.slotIndex}"]`) || centerRect();
          const destRect = domRectOfDiscardHud();
        
          // start (or refresh) a stack key for this resolve sequence
          CURRENT_RESOLVE_STACK.key = `resolve-${Date.now()}`;
          CURRENT_RESOLVE_STACK.at  = performance.now();
        
          await playCinematic(e.cardData, slotRect, destRect, {
            centerScale: 1.16, holdMs: 300,
            stackKey: CURRENT_RESOLVE_STACK.key, stackIndex: 0, stackDx: 26, stackDy: 18
          });
        }


      // GLYPH: board → discard cinematic (camera fly), we’ll also do the flip below
        if (e.t === 'resolved' && e.source === 'glyph') {
          const rowSel = `.row.${e.side || 'player'}`;
          const slotRect = rectOfSelector(`${rowSel} .slot.glyph`) || centerRect();
          const destRect = domRectOfDiscardHud();
        
          const recentMs = performance.now() - (CURRENT_RESOLVE_STACK.at || 0);
          const canStack = recentMs < 1400 && CURRENT_RESOLVE_STACK.key;
        
          await playCinematic(e.cardData, slotRect, destRect, canStack ? {
            centerScale: 1.12, holdMs: 300,
            // glyph goes ON TOP of the thing that triggered it
            stackKey: CURRENT_RESOLVE_STACK.key, stackIndex: 1, stackDx: 26, stackDy: 18
          } : {
            centerScale: 1.12, holdMs: 300
          });
        
          // (keep your existing flip/pulse/remove block that follows)
        }


      // Logging
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
        if (e.cardData?.id) FLOW_BOUGHT_IDS.add(e.cardData.id);
      

        
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

    // ---- Visual-only reactions (DOM effects) ----

    // GLYPH flipdown + pulse + remove (single, canonical handler)
    if (e.t === 'resolved' && e.source === 'glyph') {
      const side = e.side || 'player';
      const rowSel = `.row.${side}`;
      const slot = document.querySelector(`${rowSel} .slot.glyph`);
      if (slot) {
        const art = slot.querySelector('.card');

        // Add backplate once
        if (!slot.querySelector('.glyph-back')) {
          const back = document.createElement('div');
          back.className = 'glyph-back';
          slot.appendChild(back);
        }

        // Flip down, then back up (so next set starts face-up)
        slot.classList.add('flipping-down');
        art?.addEventListener('animationend', () => {
          slot.classList.remove('flipping-down');
          slot.classList.add('flipping-up');
          slot.addEventListener('animationend', () => {
            slot.classList.remove('flipping-up');
          }, { once: true });
        }, { once: true });

        // Purple pulse ring
        const pulse = document.createElement('div');
        pulse.className = 'glyph-trigger-circle';
        slot.appendChild(pulse);
        pulse.addEventListener('animationend', () => pulse.remove(), { once: true });

        // Brief purple highlight around the glyph card
        art?.classList.add('purple-ring');
        art?.addEventListener('animationend', () => art.classList.remove('purple-ring'), { once: true });

        // Remove the glyph card node after the arc
        setTimeout(() => {
          art?.remove();
          slot.classList.remove('has-card');
        }, 800);
      }

      // Optional log for clarity (already logged above too)
      logLine(`${side} → Glyph triggered & discarded.`);
    }

    // FLOW reveal spotlight effect
    if (e.t === 'reveal' && e.source === 'flow' && Number.isFinite(e.flowIndex)) {
      const flowCard = document.querySelector(`.flow-card:nth-child(${e.flowIndex + 1}) .card.market`);
      if (flowCard) {
        flowCard.classList.add('spotlight');
        flowCard.addEventListener('animationend', () => flowCard.classList.remove('spotlight'), { once:true });
      }
    }

    // Heart “hit” wiggle
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
    lastGlyphJustSetFor = side;
    
    const slot = document.querySelector(`.row.${side} .slot.glyph`);
    if (slot) {
      slot.classList.add('flipping-down');
      slot.addEventListener('animationend', () => slot.classList.remove('flipping-down'), { once: true });
    }
    
    Emit(Events.CARD_SET, {side, cardId});

}

// --- Spotlight stack coordination (for spell → glyph resolution pairs)
const SPOTLIGHT_STACKS = new Map();  // key -> anchor pose rect (center size)
let CURRENT_RESOLVE_STACK = { key: null, at: 0 }; // updated when a spell/instant resolves






function ensureGlyphResolveStyles() {
  if (document.getElementById('glyph-resolve-style')) return;
  const s = document.createElement('style');
  s.id = 'glyph-resolve-style';
  s.textContent = `
    @keyframes purpleRing {
      0%   { box-shadow: 0 0 0 0 rgba(180,120,255,.3); }
      70%  { box-shadow: 0 0 0 14px rgba(180,120,255,0); }
      100% { box-shadow: 0 0 0 0 rgba(180,120,255,0); }
    }
    @keyframes glyphTrigger {
      0% { opacity: 0; transform: scale(0.4); }
      40% { opacity: 1; transform: scale(1.1); }
      100% { opacity: 0; transform: scale(0.8); }
    }
    .card.purple-ring { animation: purpleRing 1.1s ease-out; }
    .glyph-trigger-circle {
      position: absolute;
      inset: -10%;
      border: 2px solid rgba(180,120,255,.5);
      border-radius: 50%;
      pointer-events: none;
      animation: glyphTrigger 1.2s ease-out forwards;
      filter: drop-shadow(0 0 6px rgba(180,120,255,.4));
    }
  `;
  document.head.appendChild(s);
}

function ensurePortraitAeNoGlowStyles(){
  if (document.getElementById("ae-noglow-style")) return;
  const s = document.createElement("style");
  s.id = "ae-noglow-style";
  s.textContent = `
    /* Kill any glow/animation on TEMP Æ in portrait readout */
    .ae-line .ae-ico.temp .icon-aether-temp,
    .ae-line .ae-ico.temp svg {
      filter: none !important;
      animation: none !important;
    }
    .ae-line .ae-val.temp {
      text-shadow: none !important;
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





  
  setAetherDisplay(playerAeEl, s.players?.player?.aether ?? 0, s.players?.player?.tempAether ?? 0);
  setAetherDisplay(aiAeEl,     s.players?.ai?.aether ?? 0,     s.players?.ai?.tempAether ?? 0);
  // in render()
renderHearts($("player-hearts"), s.players?.player?.vitality ?? 5, 5);
renderHearts($("ai-hearts"),     s.players?.ai?.vitality     ?? 5, 5);

 removeLegacyTranceText();
  renderTranceTrack('player');
renderTranceTrack('ai');
  ensurePipHandlers();
  refreshPipAdvanceClasses();

 

  


const pv = s.players?.player?.vitality | 0;
const av = s.players?.ai?.vitality | 0;
if ((av <= 0 && pv > 0) || (pv <= 0 && av > 0)) {
  showOutcome(av <= 0 ? "win" : "lose");
}





  
  // HUD
  // inside render(), where you already set the HUD buttons’ innerHTML:
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
  const discardCount = (state?.players?.player?.discard?.length ?? 0);
  hudDiscardBtn.innerHTML = `
    <div class="hud-discard-wrap">
      <svg class="icon discard" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
        <path d="M18 22h28M18 30h28M18 38h28" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="14" y="16" width="36" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity=".8"/>
      </svg>
      <span class="discard-count">${discardCount}</span>
    </div>`;
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
  // (Re)bind pile modal handlers once the buttons exist.
// This function is idempotent; calling it on every render is safe.
if (typeof window.__wirePileModals === 'function') {
  window.__wirePileModals({ getStack });
}

  renderSlots(aiSlotsEl,     s.players?.ai?.slots     || [], false);
  renderAiMini(s);

  ensureGlyphPlaceholderStyles();

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
      
      if (FLOW_BOUGHT_IDS.has(c.id)) el.classList.add("flow-bought");

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
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("click", clearAllActionMenus);

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureTopLeftUI();
  ensureWeaverBackdrop();
  ensureRightHudStrip();
  ensureFlowStyles();
  ensureGlyphFlipStyles();
  ensureGlyphFlipDownStyles();
  ensureGlyphResolveStyles();
  ensureTranceStyles();
  ensureFlowBoughtStyles();
  ensurePortraitAeNoGlowStyles();



  await doStartTurn();
 
  logLine(`Boot on ${BRANCH_VERSION}`);
});







/* ===================== Pile modal (Deck & Discard as real cards) ===================== */
function ensurePileModalStyles(){
  if (document.getElementById('pile-modal-style')) return;
  const s = document.createElement('style');
  s.id = 'pile-modal-style';
  s.textContent = `
    /* Fullscreen layer; outer layer can scroll if needed */
    #pile-modal{ position:fixed; inset:0; z-index:3400; display:none; overflow:auto; }
    #pile-modal.open{ display:block; }

    /* Dim + blur the whole board */
    #pile-modal .backdrop{
      position:absolute; inset:0;
      background:rgba(0,0,0,.45);
      backdrop-filter: blur(6px);
    }

    /* Centered sheet; no inner scrolling (the page scrolls if needed) */
    #pile-modal .sheet{
      position:relative;
      width:min(1100px, calc(100vw - 160px));
      margin:80px auto;
      border-radius:16px;
      background:rgba(18,18,18,.96);
      border:1px solid rgba(255,255,255,.08);
      box-shadow:0 10px 36px rgba(0,0,0,.55);
      display:grid;
      grid-template-rows:auto 1fr;
      overflow:visible;
    }

    /* Header */
    #pile-modal header{
      display:flex; align-items:center; justify-content:space-between;
      gap:8px; padding:10px 12px;
      border-bottom:1px solid rgba(255,255,255,.08);
      font-size:16px; letter-spacing:.02em;
    }
    #pile-modal header .ttl{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #pile-modal header .controls{ display:flex; gap:6px; align-items:center; }
    #pile-modal header .btn{
      height:28px; padding:0 10px; border-radius:8px; border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06); color:#ddd; cursor:pointer; font-size:12px;
    }
    #pile-modal header .btn[aria-pressed="true"]{
      background:rgba(255,255,255,.12); color:#fff;
    }
    #pile-modal header .close{
      border:0; background:transparent; color:#ddd; font-size:20px; line-height:1; cursor:pointer;
      padding:4px 8px; border-radius:8px;
    }

    /* LIST VIEW (no inner scroll) */
    #pile-modal .list{ padding:12px; display:grid; gap:6px; overflow:visible; }
    #pile-modal .row{
      display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center;
      padding:8px 10px; border-radius:10px;
      background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06);
    }
    #pile-modal .row .nm{ font-size:14px; }
    #pile-modal .row .meta{ font-size:12px; opacity:.8; }

    /* CARDS VIEW — true size, centered grid */
    #pile-modal { --pile-card-w: 260px; --pile-card-h: 360px; --pile-cols: 3; --pile-gap: 16px; }
    #pile-modal .grid{
      padding:16px;
      display:grid;
      justify-content:center;
      gap:var(--pile-gap);
      grid-template-columns: repeat(var(--pile-cols), var(--pile-card-w));
    }
    #pile-modal .grid .card{
      width:var(--pile-card-w);
      height:var(--pile-card-h);
      transform:none !important;
      position:relative;
      contain: content;
    }

    /* Mode switching */
    #pile-modal[data-view="list"]  .grid{ display:none; }
    #pile-modal[data-view="cards"] .list{ display:none; }

    /* Phone: wider margins via full-width sheet */
    @media (max-width: 640px){
      #pile-modal .sheet{ width:calc(100vw - 32px); margin:70px auto 80px; }
    }
  `;
  document.head.appendChild(s);
}



(function ensureHeartContainerStyles(){
  if (document.getElementById('heart-container-style')) return;
  const s = document.createElement('style');
  s.id = 'heart-container-style';
  s.textContent = `
    #player-hearts, #ai-hearts {
      display: inline-flex;
      gap: 6px;
      vertical-align: middle;
    }
    .heart-svg.empty .heart-shape {
      opacity: .75;
      filter: drop-shadow(0 0 0 rgba(0,0,0,0));
    }
    .heart-svg.filled .heart-shape {
      filter: drop-shadow(0 1px 0 rgba(0,0,0,.25));
    }
  `;
  document.head.appendChild(s);
})();



/* Measure a “true” card size (prefers live board cards; falls back to an offscreen probe) */
function measureTrueCardSize(sample){
  const pick = sel => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return (r.width>0 && r.height>0) ? {w:Math.round(r.width), h:Math.round(r.height)} : null;
  };

  // 1) Prefer a card in player's spell slots (upright, un-rotated)
  let sz = pick('.row.player .slot.spell .card');
  // 2) Then try a Flow card or a hand card
  if (!sz) sz = pick('.flow-card .card') || pick('#hand .card');

  // 3) Fallback: render a probe card offscreen and measure
  if (!sz) {
    const p = document.createElement('article');
    p.className = 'card';
    p.style.position = 'fixed';
    p.style.left = '-99999px'; p.style.top = '-99999px';
    p.style.transform = 'none';
    p.style.visibility = 'hidden';
    p.innerHTML = cardShellHTML(sample || {name:'', type:'SPELL', text:'', pip:0});
    document.body.appendChild(p);
    const r = p.getBoundingClientRect();
    sz = { w: Math.round(r.width), h: Math.round(r.height) };
    p.remove();
  }
  return sz;
}

let PILE_VIEW = localStorage.getItem('pileViewMode') || 'list'; // 'list' | 'cards'

function openPileModal(title, cards){
  ensurePileModalStyles();

  let m = document.getElementById('pile-modal');
  if (!m){
    m = document.createElement('div');
    m.id = 'pile-modal';
    m.innerHTML = `
      <div class="backdrop"></div>
      <div class="sheet">
        <header>
          <div class="ttl"></div>
          <div class="controls">
            <button class="btn btn-list"  type="button" aria-pressed="false">List</button>
            <button class="btn btn-cards" type="button" aria-pressed="false">Cards</button>
            <button class="close" type="button" aria-label="Close">×</button>
          </div>
        </header>
        <div class="list"></div>
        <div class="grid"></div>
      </div>`;
    document.body.appendChild(m);

    const close = ()=> m.classList.remove('open');
    m.querySelector('.backdrop').addEventListener('click', close);
    m.querySelector('.close').addEventListener('click', close);

    const setView = (v)=>{
      PILE_VIEW = v;
      localStorage.setItem('pileViewMode', v);
      m.dataset.view = v;
      m.querySelector('.btn-list') .setAttribute('aria-pressed', v==='list');
      m.querySelector('.btn-cards').setAttribute('aria-pressed', v==='cards');
    };
    m.querySelector('.btn-list') .addEventListener('click', ()=> setView('list'));
    m.querySelector('.btn-cards').addEventListener('click', ()=> setView('cards'));
    m._setView = setView;

    // Recompute columns on resize
    const onResize = ()=>{
      const sheet = m.querySelector('.sheet');
      if (!sheet) return;
      const gap = 16;
      const w   = sheet.clientWidth - 2*gap;
      const cw  = parseInt(getComputedStyle(m).getPropertyValue('--pile-card-w')) || 260;
      let cols  = Math.floor((w + gap) / (cw + gap));
      cols = Math.min(5, Math.max(3, cols));   // clamp to 3–5
      m.style.setProperty('--pile-cols', cols);
    };
    window.addEventListener('resize', onResize);
    m._onResize = onResize;
  }

  // === Measure a true card size and set CSS vars ===
  const {w, h} = measureTrueCardSize(cards?.[0]);
  m.style.setProperty('--pile-card-w', `${w}px`);
  m.style.setProperty('--pile-card-h', `${h}px`);
  m._onResize?.();

  // Fill content
  m.querySelector('.ttl').textContent = title;
  const list = m.querySelector('.list');
  const grid = m.querySelector('.grid');
  list.replaceChildren();
  grid.replaceChildren();

  // List rows
  cards.forEach(c=>{
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="nm">${c.name}</span>
      <span class="meta">
        ${c.type}${(c.cost|0)?` · cost ${c.cost}`:''}${(c.pip|0)?` · pips ${c.pip}`:''}
      </span>`;
    list.appendChild(row);
  });

  // Full-size card grid (no transforms)
  cards.forEach(c=>{
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = cardShellHTML(c);
    grid.appendChild(el);
  });

  // Apply view + open
  (m._setView || (()=>{}))(PILE_VIEW);
  m.classList.add('open');

  // Ensure columns after open (layout settled)
  queueMicrotask(()=> m._onResize?.());
}






























/* ===================== HUD counts & handlers upgrade ===================== */
/* Replaces the list-style modal usage with the new card-grid modal, and
   shows a live count on the discard HUD button just like the deck. */
(function upgradeHudPileCountsAndHandlers(){
  // style badge for discard count to match deck count
  if (!document.getElementById('hud-pile-count-style')) {
    const s = document.createElement('style');
    s.id = 'hud-pile-count-style';
    s.textContent = `
      .hud-deck-wrap, .hud-discard-wrap { position:relative; }
      .deck-count, .discard-count{
        position:absolute; right:-6px; top:-6px; min-width:22px; height:22px;
        padding:0 6px; border-radius:999px; display:grid; place-items:center;
        background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.15);
        font-size:13px; line-height:1; letter-spacing:.02em;
      }`;
    document.head.appendChild(s);
  }

  // swap the click handlers to open the new modal
  if (typeof window.__wirePileModals === 'function') return; // idempotent guard
  window.__wirePileModals = function({ getStack }){
    const deckBtn = document.getElementById('btn-deck-hud');
    const discBtn = document.getElementById('btn-discard-hud');
    deckBtn?.addEventListener('click', ()=>{
      const cards = getStack(state, 'player', 'deck');
      openPileModal(`Deck (${cards.length})`, cards);
    });
    discBtn?.addEventListener('click', ()=>{
      const cards = getStack(state, 'player', 'discard');
      openPileModal(`Discard (${cards.length})`, cards);
    });
  };
})();





/* ---------- mobile-landscape mode (no external file) ---------- */
(function mobileLandscapeMode(){
  const isPhone = /iPhone|Android.+Mobile|iPod/i.test(navigator.userAgent);
  const apply = () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const enable = isPhone && (isLandscape || shortSide <= 420);
    document.body.classList.toggle("mobile-landscape", !!enable);
  };
  window.addEventListener("resize", apply, {passive:true});
  window.addEventListener("orientationchange", apply, {passive:true});
  document.addEventListener("DOMContentLoaded", apply);
})();


  
