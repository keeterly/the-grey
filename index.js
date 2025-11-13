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
  payAndAdvanceOne,          // ← use this for paid pip clicks
  resolveInstantFromHand,     // ← NEW
  drainEvents,                // ← NEW
  dealDamage
  // clearReactionWindow,        // Reaction windows are cleared directly on state
  // resolveReactionFromHand      // Reaction resolver handled via resolveInstantFromHand

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
export const BRANCH_VERSION = "v2.66";
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

// --- draw-step sentinel (used only for Veyra I logic) ---
let __IN_DRAW_STEP = false;





function ensureCardMotionStyles(){
  if (document.getElementById('card-motion-style')) return;
  const s = document.createElement('style');
  s.id = 'card-motion-style';
  s.textContent = `
    .card-fx {
      position: fixed;
      width: 90px; height: 130px;   /* visual proxy, not real card */
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(240,240,240,.85));
      box-shadow: 0 6px 16px rgba(0,0,0,.25);
      transform: translate(-9999px,-9999px) scale(.9);
      opacity: 0;
      z-index: 10000;
      pointer-events: none;
    }
    .card-fx.player { filter: hue-rotate(0deg) saturate(1.05); }
    .card-fx.ai     { filter: hue-rotate(-8deg) saturate(.95); }

    @keyframes card-in {
      0%   { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(.86) rotate(var(--r0)); }
      60%  { opacity: 1; transform: translate(var(--mx), var(--my)) scale(1.02) rotate(var(--r1)); }
      100% { opacity: 1; transform: translate(var(--dx), var(--dy)) scale(1.00) rotate(0deg);   }
    }
    @keyframes card-out {
      0%   { opacity: 1; transform: translate(var(--sx), var(--sy)) scale(1.00) rotate(0deg); }
      80%  { opacity: .9; transform: translate(var(--mx), var(--my)) scale(.94) rotate(var(--r1)); }
      100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.90) rotate(var(--r2)); }
    }
  `;
  document.head.appendChild(s);
}





// ---- Hand animation helper (sequential fade+slide+tilt; softer timing) ----
let handAnimRunId = 0;

async function animateHandCardsSequential(
  nodes,
  {
    // softer defaults
    slidePx = 26,                 // was ~22; a bit more drift from the right
    tiltDeg = 5,                  // was ~4; slightly more character
    fadeMs  = 360,                // was ~260
    moveMs  = 220,                // was ~360
    gapMs   = 160,                // was ~80; adds gentle spacing when multiple cards enter
    easing  = 'cubic-bezier(0.22, 0.61, 0.36, 1)' // smooth ease-out (feels natural)
  } = {}
) {
  const runId = ++handAnimRunId;

  const animateOne = (n) => new Promise((resolve) => {
    if (runId !== handAnimRunId) return resolve();

    // Read final fan pose (layoutHand already set CSS vars for this)
    const cs  = getComputedStyle(n);
    const tx  = parseFloat(cs.getPropertyValue('--tx'))  || 0;
    const rot = parseFloat(cs.getPropertyValue('--rot')) || 0;

    // Start: slightly to the right + gentle extra tilt; fully transparent
    n.classList.add('deal-in');            // perf hint (optional)
    n.style.setProperty('--tx',  (tx + slidePx) + 'px');
    n.style.setProperty('--rot', (rot + tiltDeg) + 'deg');
    n.style.opacity    = '0';
    n.style.transition = 'none';

    // Reveal THIS card only (others remain hidden until their turn)
    n.classList.remove('grey-hide-during-flight');

    // Commit start pose
    void n.getBoundingClientRect();
    if (runId !== handAnimRunId) return resolve();

    // Double-RAF to avoid any “pop” on slower paints
    requestAnimationFrame(() => {
      if (runId !== handAnimRunId) return resolve();
      requestAnimationFrame(() => {
        if (runId !== handAnimRunId) return resolve();

        // Softer, longer easing for both opacity + transform
        n.style.transition =
          `opacity ${fadeMs}ms ${easing}, transform ${moveMs}ms ${easing}`;

        // Animate to the final fan pose
        n.style.setProperty('--tx',  tx + 'px');
        n.style.setProperty('--rot', rot + 'deg');
        n.style.opacity = '1';

        // Cleanup after this card finishes
        setTimeout(() => {
          if (runId !== handAnimRunId) return resolve();
          n.style.transition = '';
          n.style.opacity    = '';
          n.classList.remove('deal-in');
          resolve();
        }, moveMs + 60);
      });
    });
  });

  // Sequential—so batches (turn-start draw-up-to-5, end-turn) feel like repeated Draw 1
  for (let i = 0; i < nodes.length; i++) {
    if (runId !== handAnimRunId) break;
    await animateOne(nodes[i]);
    if (i < nodes.length - 1) await new Promise(r => setTimeout(r, gapMs));
  }
}






// === Additional reaction styles and helpers ===
function ensureReactionStyles() {
  if (document.getElementById('reaction-style')) return;
  const s = document.createElement('style');
  s.id = 'reaction-style';
  s.textContent = `
    /* During a reaction window, keep the player’s hand (and player row) above the
       dimming overlay so that cards remain fully visible. This targets
       both class-based and id-based containers as well as the entire
       player row. */
    body.reaction-mode .hand,
    body.reaction-mode #hand,
    body.reaction-mode .row.player {
      filter: none !important;
      position: relative;
      z-index: 3501;
    }
    /* A reaction card stays in the hand and glows with a pulsing golden outline.
       We avoid overriding its transform here so the card stays anchored to its slot. */
  .card.reaction-candidate {
    z-index: 3600;
    filter: none;
    /* golden box-shadow pulses instead of saturating the whole card */
    box-shadow: 0 0 8px 2px rgba(255,215,0,0.7);
    animation: reaction-pulse 2s infinite;
    transition: box-shadow 0.2s ease;
  }
  /* Pulse the box-shadow for the golden glow */
  @keyframes reaction-pulse {
    0%, 100% {
      box-shadow: 0 0 8px 2px rgba(255,215,0,0.5);
    }
    50% {
      box-shadow: 0 0 16px 4px rgba(255,215,0,0.9);
    }
  }
    .reaction-overlay {
      position: fixed;
      inset: 0;
      z-index: 3500;
      background: rgba(0,0,0,0.35);
      display: grid;
      place-items: start center;
      padding-top: 14vh;
      pointer-events: none;
    }
    .reaction-pass {
      pointer-events: auto;
      padding: 8px 14px;
      border-radius: 8px;
      background: rgba(30,30,30,0.85);
      color: #eee;
      border: 1px solid rgba(255,255,255,0.15);
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    }
  `;
  document.head.appendChild(s);
}

// Determine if a hand card can react to a trigger right now
function canPlayReactionCard(state, defenderSide, card, trigger) {
  // Only true reaction cards can trigger a reaction window
  if (!card || card.type !== 'REACTION') return false;
  const P = state.players?.[defenderSide];
  // Ensure the player can pay the play cost for this reaction card
  const available = ((P?.aether | 0) + (P?.tempAether | 0));
  const playCost = card.playCost | 0;
  if (available < playCost) return false;
  const text = String(card.text || '').toLowerCase();
  if (trigger === 'onAdvance') {
    // Cards that negate spell advancement should include "negate" in their text
    return text.includes('negate');
  }
  if (trigger === 'onCast') {
    // Cards that cancel spells should include keywords like "cancel" or "snuff"
    return text.includes('cancel') || text.includes('snuff');
  }
  if (trigger === 'onDamage') {
    // Cards that prevent or reduce damage should include these keywords
    return text.includes('reduce') || text.includes('prevent') || text.includes('shield');
  }
  return false;
}

// Get list of playable reaction cards in defender's hand
function getPlayableReactions(state, defenderSide, trigger) {
  const hand = state.players?.[defenderSide]?.hand || [];
  return hand.filter(c => canPlayReactionCard(state, defenderSide, c, trigger));
}

// Reaction UI state
let reactionUI = { open: false, overlay: null, trigger: null, defender: null, playable: [] };

// Open a reaction window. Returns true if opened, false if no card is playable.
function openReactionWindow(trigger, defenderSide) {
  // Ensure styles exist
  ensureReactionStyles();
  const playable = getPlayableReactions(state, defenderSide, trigger);
  if (!playable.length) return false;
  // Raise the hand above the overlay and highlight candidates
  document.body.classList.add('reaction-mode');
  const handRoot = defenderSide === 'player' ? handEl : document.getElementById('ai-mini-hand');
  if (handRoot) {
    const ids = new Set(playable.map(c => c.id));
    handRoot.querySelectorAll('.card').forEach(el => {
      const id = el.getAttribute('data-card-id');
      if (ids.has(id)) el.classList.add('reaction-candidate');
    });
  }
  // Create overlay (no pass button here; pass appears via card popover)
  const ov = document.createElement('div');
  ov.className = 'reaction-overlay';
  document.body.appendChild(ov);
  // Store UI state
  reactionUI = { open: true, overlay: ov, trigger, defender: defenderSide, playable };
  // Automatically open popovers for each playable reaction card with React/Pass options
  if (handRoot) {
    playable.forEach(card => {
      const cardEl = handRoot.querySelector(`.card[data-card-id="${card.id}"]`);
      if (cardEl) showCardOptions(cardEl, card);
    });
  }
  return true;
}

// Close reaction window. If passed=true, indicates the player passed on reacting.
function closeReactionWindow(passed = false) {
  document.body.classList.remove('reaction-mode');
  document.querySelectorAll('.reaction-candidate').forEach(el => el.classList.remove('reaction-candidate'));
  if (reactionUI.overlay) reactionUI.overlay.remove();
  reactionUI = { open: false, overlay: null, trigger: null, defender: null, playable: [] };
  // If player passed, clear the reaction window in state
  if (passed && state && state.reactionWindow) {
    state.reactionWindow = null;
  }
}

// Click handler for reaction cards
document.addEventListener('click', async (ev) => {
  if (!reactionUI.open) return;
  const cardEl = ev.target.closest('.card.reaction-candidate');
  if (!cardEl) return;
  ev.stopPropagation();
  const cardId = cardEl.getAttribute('data-card-id');
  const card = reactionUI.playable.find(c => c.id === cardId);
  if (!card) return;
  // Use castInstantFromHand to handle cost payment and resolution for reaction cards
  state = await window.castInstantFromHand(state, reactionUI.defender, cardId);
  closeReactionWindow(false);
  // Resume any queued events that were paused when the reaction window opened
  await spotlightFromEvents(state);
  await render();
});



// Create the overlay element and attach pass handler
// (Old overlay helpers removed.)




function ensureShuffleStyles(){
  if (document.getElementById('shuffle-style')) return;
  const s = document.createElement('style');
  s.id = 'shuffle-style';
  s.textContent = `
  .shuffle-fx {
    position: fixed; left:0; top:0; width:12px; height:18px;
    border-radius: 2px;
    background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(240,240,240,.8));
    box-shadow: 0 2px 6px rgba(0,0,0,.5);
    transform: translate(-9999px,-9999px);
    z-index: 9999; pointer-events:none;
  }
  @keyframes shuffle-fly {
    0%   { opacity:0; transform: translate(var(--sx), var(--sy)) rotate(var(--r0)); }
    10%  { opacity:1; }
    60%  { opacity:1; transform: translate(var(--mx), var(--my)) rotate(var(--r1)); }
    100% { opacity:0; transform: translate(var(--dx), var(--dy)) rotate(var(--r2)); }
  }`;
  document.head.appendChild(s);
}






/** Run a block while we're *inside* the official Draw Step. */
async function withDrawStep(fn){
  const prev = __IN_DRAW_STEP;
  __IN_DRAW_STEP = true;
  try { return await fn(); }
  finally { __IN_DRAW_STEP = prev; }
}


// Fill the Flow row to 5 visible cells on first boot.
// Relies on GameLogic turning any falsy cells into reveals on the next render.
// If your GameLogic does not auto-fill, replace the body with your own
// reveal call(s) that put real card objects into state.flow[0..4].
function seedFlowToFiveOnBoot() {
  // Only do this one time if flow is empty/partial:
  const f = state?.flow || [];
  const visible = f.slice(0,5).filter(Boolean).length;
  if (visible >= 5) return;

  // Hint to logic/UI: ensure array exists with 5 placeholders so render path paints 5 cells.
  // Your renderFlow already takes first 5. If your GameLogic has a "revealFlow()" function,
  // you can call it 5 times instead of this placeholder approach.
  state.flow = [null, null, null, null, null];
}



function heartsElFor(side) {
  return document.getElementById(side === 'player' ? 'player-hearts' : 'ai-hearts');
}

function animateDamage(side, amount = 1) {
  const host = heartsHost(side) || document.body;
  if (!host) return;

  // flash + shake the portrait (or hearts wrapper)
  host.classList.add('hit');
  host.classList.add('hit-shake');
  setTimeout(() => host.classList.remove('hit'), 320);
  setTimeout(() => host.classList.remove('hit-shake'), 360);

  // floating “-N” centered above the hearts
  const floater = document.createElement('div');
  floater.className = 'damage-float red';
  floater.textContent = `-${amount|0 || 1}`;
  host.appendChild(floater);
  floater.addEventListener('animationend', () => floater.remove(), { once:true });

  // glass crack overlay (SVG path)
  const crack = document.createElement('div');
  crack.className = 'heart-crack';
  crack.innerHTML = `
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
      <path d="M60 110 C 40 96, 16 80, 10 60 4 42, 12 26, 28 20 40 16, 54 20, 60 30
               66 20, 80 16, 92 20 108 26, 116 42, 110 60 104 78, 80 96, 60 110z"
            fill="none" stroke="rgba(255,160,160,.9)" stroke-width="2"/>
      <path d="M60 30 L52 52 L70 64 L58 78"
            fill="none" stroke="rgba(255,210,210,.9)" stroke-width="2"/>
    </svg>`;
  host.appendChild(crack);
  crack.addEventListener('animationend', () => crack.remove(), { once:true });

  // radial shards bursting from the heart row center
  const hearts = document.getElementById(side === 'player' ? 'player-hearts' : 'ai-hearts');
  const anchor = hearts || host;
  const r = anchor.getBoundingClientRect();
  const cx = (r.left + r.right) / 2 - host.getBoundingClientRect().left;
  const cy = (r.top + r.bottom) / 2 - host.getBoundingClientRect().top;

  const shardCount = 12 + Math.min(10, (amount|0) * 3);
  for (let i = 0; i < shardCount; i++) {
    const p = document.createElement('div');
    p.className = 'shard';
    p.style.left = `${cx}px`;
    p.style.top  = `${cy}px`;
    const ang = (i / shardCount) * Math.PI * 2 + (Math.random()*0.6 - 0.3);
    const dist = 26 + Math.random() * 42;
    const dur  = 420 + Math.random() * 380;

    host.appendChild(p);
    // web animations → small burst outwards, then fade
    p.animate([
      { transform: `translate(0px,0px) rotate(${ang}rad) scale(1)`, opacity: .95 },
      { transform: `translate(${Math.cos(ang)*dist}px, ${Math.sin(ang)*dist}px) rotate(${ang}rad) scale(.8)`, opacity: .0 }
    ], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
     .addEventListener('finish', () => p.remove());
  }
}






// put near your other ensure*Styles helpers
function ensureBoardDimStyles(){
  if (document.getElementById('board-dim-style')) return;
  const s = document.createElement('style');
  s.id = 'board-dim-style';
  s.textContent = `
    /* Dim player/AI boards by default */
    .row .slot.spell,
    .row .slot.glyph {
      opacity: .5;
      transition: opacity .18s ease;
    }

    /* When a slot actually holds a card, restore full opacity */
    .row .slot.spell.has-card,
    .row .slot.glyph.has-card {
      opacity: 1;
    }

    /* Leave the Aether Flow area untouched (full opacity) */
    .flow-board { opacity: 1; }
  `;
  document.head.appendChild(s);
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



function findSideContainer(side) {
  // Prefer a side wrapper; fallbacks if structure differs.
  return document.querySelector(`.side.${side}`)
      || (side === 'player' ? document.querySelector('#player-slots')?.closest('.side') : null)
      || (side === 'ai'     ? document.querySelector('#ai-slots')?.closest('.side')     : null)
      || document.body;
}


function heartsHost(side) {
  const hearts = document.getElementById(side === 'player' ? 'player-hearts' : 'ai-hearts');
  // prefer the portrait wrapper if present, else the hearts node itself
  const portrait = hearts?.closest('.portrait');
  return portrait || hearts || findSideContainer(side);
}


function refreshHeartsShatter(side) {
  const wrap = heartsWrap(side);
  if (!wrap) return;
  const hearts = Array.from(wrap.querySelectorAll('.heart'));
  const cur = (state?.players?.[side]?.vitality | 0) ?? 0;
  for (let i = cur; i < hearts.length; i++) {
    hearts[i].classList.add('shattered');
  }
}



function heartsWrap(side) {
  return document.getElementById(side === 'player' ? 'player-hearts' : 'ai-hearts');
}

/** Mark the newest lost heart (rightmost empty) as 'shattered'. */
function markNewestLostHeartShattered(side) {
  const wrap = heartsWrap(side);
  if (!wrap) return;

  // We assume hearts render left→right with full hearts first.
  // Find all hearts and the current vitality from state.
  const hearts = Array.from(wrap.querySelectorAll('.heart'));
  const cur = (state?.players?.[side]?.vitality | 0) ?? 0;

  // Hearts at index >= cur are empty. The "newly lost" is at index (cur), if it exists.
  const idx = cur; // right after the last full one
  if (hearts[idx] && !hearts[idx].classList.contains('shattered')) {
    hearts[idx].classList.add('shattered');
  }
}




function pileAnchor(side, pile) { // pile: 'deck' | 'discard'
  // 1) Primary explicit ids (if you ever add them)
  const explicit = side === 'player'
    ? (pile === 'deck' ? '#player-deck'   : '#player-discard')
    : (pile === 'deck' ? '#ai-deck'       : '#ai-discard');

  let el = document.querySelector(explicit);

  // 2) HUD / mini-HUD fallbacks that you actually have in the DOM
  if (!el) {
    if (side === 'player') {
      el = document.querySelector(pile === 'deck' ? '#btn-deck-hud' : '#btn-discard-hud');
    } else {
      el = document.querySelector(pile === 'deck' ? '#ai-mini-deck' : '#ai-mini-discard');
    }
  }

  // 3) Side-scoped [data-pile="..."] (optional markup you might add later)
  if (!el) {
    const sideScope = document.querySelector(
      side === 'player' ? '#player-area, #player-slots, .portrait.player'
                        : '#ai-area, #ai-slots, .portrait.ai'
    ) || document.body;
    el = sideScope.querySelector(`[data-pile="${pile}"]`) || sideScope;
  }

  const r = el.getBoundingClientRect();
  return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
}



function animateReshuffle(side, count = 12) {
  ensureShuffleStyles();

  const isPlayer = side === 'player';
  const SR = slotsRect(side);

  // Work entirely inside the spell-slot band
  // Y-band: a little above the slots to avoid covering cards too much
  const yBase = SR.y + (isPlayer ? SR.h * 0.15 : SR.h * 0.20);
  const ySpan = SR.h * 0.35;

  // X-band: left→right for player, right→left for AI (feels like "gather → stack")
  const xStartBand = isPlayer ? [SR.x + SR.w * 0.15, SR.x + SR.w * 0.35]
                              : [SR.x + SR.w * 0.65, SR.x + SR.w * 0.85];
  const xEndBand   = isPlayer ? [SR.x + SR.w * 0.55, SR.x + SR.w * 0.85]
                              : [SR.x + SR.w * 0.15, SR.x + SR.w * 0.45];

  // Midpoint arches higher for a nice "riffle" feel
  const archBoost = (isPlayer ? -1 : 1) * Math.max(80, SR.h * 0.5);

  const n = Math.min(28, Math.max(10, count | 0));
  for (let i = 0; i < n; i++) {
    const chip = document.createElement('div');
    chip.className = 'shuffle-fx';
    document.body.appendChild(chip);

    // Larger + slight variety
    const scale = 1.6 + Math.random() * 0.5;
    chip.style.width = `${12 * scale}px`;
    chip.style.height = `${18 * scale}px`;

    // Randomize within bands
    const xS = xStartBand[0] + Math.random() * (xStartBand[1] - xStartBand[0]);
    const xD = xEndBand[0]   + Math.random() * (xEndBand[1]   - xEndBand[0]);
    const yS = yBase + Math.random() * ySpan;
    const yD = yBase + Math.random() * ySpan;

    // Arch mid point roughly above the center between start and end
    const midX = (xS + xD) / 2 + (Math.random() * 40 - 20);
    const midY = (yS + yD) / 2 + archBoost + (Math.random() * 20 - 10);

    // Rotations
    const r0 = (Math.random() * 80 - 40) + 'deg';
    const r1 = (Math.random() * 140 - 70) + 'deg';
    const r2 = (Math.random() * 200 - 100) + 'deg';

    // Set path variables for the keyframes
    chip.style.setProperty('--sx', `${xS}px`);
    chip.style.setProperty('--sy', `${yS}px`);
    chip.style.setProperty('--mx', `${midX}px`);
    chip.style.setProperty('--my', `${midY}px`);
    chip.style.setProperty('--dx', `${xD}px`);
    chip.style.setProperty('--dy', `${yD}px`);
    chip.style.setProperty('--r0', r0);
    chip.style.setProperty('--r1', r1);
    chip.style.setProperty('--r2', r2);

    // Slower + bigger cascade so it reads clearly
    const dur = 900 + Math.random() * 450;
    const delay = i * 36;
    chip.style.animation = `shuffle-fly ${dur}ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`;
    chip.addEventListener('animationend', () => chip.remove(), { once: true });
  }
}





function slotsRect(side) {
  const el = document.querySelector(side === 'player' ? '#player-slots' : '#ai-slots');
  const r = (el || document.body).getBoundingClientRect();
  return { el, x: r.left, y: r.top, w: r.width, h: r.height };
}



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

// --- Spotlight anchor cache (used by VFX to source from the floating card)
let LAST_SPOTLIGHT_ANCHOR = { rect: null, at: 0 };

function getRecentSpotlightRect(maxAgeMs = 900) {
  const age = performance.now() - (LAST_SPOTLIGHT_ANCHOR.at || 0);
  return age <= maxAgeMs ? LAST_SPOTLIGHT_ANCHOR.rect : null;
}

/**
 * Try to emit particles from the *current spotlight* (floating ghost card).
 * If the spotlight isn't ready yet, we wait a few frames; if it never appears,
 * we fall back to the provided startRect.
 */
async function emitParticlesFromSpotlightOr(fallbackStartRect, destRect, count = 28) {
  const deadline = performance.now() + 160; // ~10 frames
  let anchor = getRecentSpotlightRect();
  while (!anchor && performance.now() < deadline) {
    await new Promise(r => setTimeout(r, 16));
    anchor = getRecentSpotlightRect();
  }
  emitTempAetherParticles(anchor || fallbackStartRect, destRect, count);
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



function ensureDamageVFXStyles() {
  if (document.getElementById('damage-vfx-style')) return;
  const s = document.createElement('style');
  s.id = 'damage-vfx-style';
  s.textContent = `
    /* Host gets positioned so overlays/floater place correctly */
    .portrait { position: relative; }

    /* brief flash */
    @keyframes heartHitFlash { 
      0% { filter: brightness(1); } 
      10% { filter: brightness(1.6) saturate(1.1); } 
      100% { filter: brightness(1); } 
    }
    /* micro shake */
    @keyframes heartHitShake {
      0%{ transform: translate(0,0) }
      20%{ transform: translate(-2px,0) }
      40%{ transform: translate(2px,0) }
      60%{ transform: translate(-1px,0) }
      80%{ transform: translate(1px,0) }
      100%{ transform: translate(0,0) }
    }
    .hit       { animation: heartHitFlash 320ms ease; }
    .hit-shake { animation: heartHitShake 360ms ease; }

    /* floating damage number anchored near hearts */
    .damage-float {
      position: absolute;
      left: 0; right: 0;               /* center horizontally in host */
      top: -6px;                        /* just above the hearts row */
      margin: 0 auto; width: max-content;
      font-weight: 700; font-size: 22px;
      text-shadow: 0 1px 0 rgba(0,0,0,.5), 0 0 8px rgba(255,60,60,.45);
      opacity: 0; transform: translateY(0);
      animation: dmgFloat 900ms ease-out forwards;
      pointer-events: none;
    }
    .damage-float.red { color: #ff9b9b; }
    @keyframes dmgFloat {
      0%   { opacity: 0; transform: translateY(6px) scale(.96); }
      12%  { opacity: 1; transform: translateY(0)    scale(1.00); }
      80%  { opacity: 1; transform: translateY(-18px) scale(1.00); }
      100% { opacity: 0; transform: translateY(-28px) scale(1.00); }
    }

    /* glass crack overlay */
    .heart-crack {
      position:absolute; inset:0; pointer-events:none;
      display:block; opacity:.0;
      animation: crackFade 520ms ease-out forwards;
      filter: drop-shadow(0 0 12px rgba(255,120,120,.25));
    }
    @keyframes crackFade {
      0%   { opacity:.0; transform: scale(.96); }
      30%  { opacity:.9; transform: scale(1.02); }
      100% { opacity:.0; transform: scale(1.00); }
    }

    /* radial shards (tiny triangles) */
    .shard {
      position:absolute; width: 8px; height: 8px;
      background: conic-gradient(from 0deg, rgba(255,180,180,.95), rgba(255,120,120,.85) 60%, transparent 60%);
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
      opacity: .9; transform-origin: 50% 100%;
      filter: drop-shadow(0 0 6px rgba(255,120,120,.5));
      pointer-events:none;
    }
  `;
  document.head.appendChild(s);
}




/* ---------- Trance runtime (per-turn flags + helpers) ---------- */
function sideWeaverKey(side){
  const nm = state?.players?.[side]?.weaver?.name || "";
  const k = String(nm).trim().toLowerCase();
  if (k.startsWith("aria"))   return "aria";
  if (k.startsWith("enoch"))  return "enoch";
  if (k.startsWith("morr"))   return "morr";
  if (k.startsWith("veyra"))  return "veyra";
  if (k.startsWith("kareth")) return "kareth";
  return "aria";
}
function tranceLevel(side){ return (state?.players?.[side]?.tranceLevel|0) || 0; }
function enemyOf(side){ return side === "player" ? "ai" : "player"; }

/* Per-turn one-shot flags + accounting */
function ensureTranceFlags(){
  for (const s of ["player","ai"]) {
    const p = state.players[s];
    p._trFlags ??= {
      // Aria
      ariaL1GainUsed: false,
      ariaL2DiscountUsed: false,
      // Enoch
      enochL1Used: false,
      // Morr
      morrL1Used: false,
      morrL2DiscountUsed: false,

      // Veyra
      veyraL1Used: false,
      
      // Kareth
      karethL1Used: false,
      spentThisTurn: 0,
    };
  }
}
function resetTranceFlagsFor(side){
  ensureTranceFlags();
  const f = state.players[side]._trFlags;
  f.ariaL1GainUsed = false;
  f.ariaL2DiscountUsed = false;
  f.enochL1Used = false;
  f.morrL1Used = false;
  f.morrL2DiscountUsed = false;
  f.veyraL1Used = false;
  f.karethL1Used = false;
  f.spentThisTurn = 0;
}

// Allow each spell to advance once per turn (cleared at the *start* of that side's turn)
function resetAdvanceFlagsFor(side) {
  const slots = state.players?.[side]?.slots || [];
  for (let i = 0; i < 3; i++) {
    if (slots[i]) {
      slots[i].advancedThisTurn = false;
    }
  }
}


// Draw one card using the SAME visual path as the menu button
async function drawOneLikeMenu(side) {
  await withDrawStep(async () => {
    if ((state.players?.[side]?.deck?.length || 0) < 1) {
      reshuffleFromDiscard(side);
    }
    // engine draw (1)
    state = drawN(state, side, 1);

    // visual: deck -> hand chip for this single card
    animateDrawCards(side, 1);

    // IMPORTANT: render while draw-step is active so hand runs deal-in anim
    await render();
  });

  // small stagger between sequential draws (feel free to tweak 80–140 ms)
  await sleep(110);
}




async function doStartTurn(){
  state = startTurn(state);

  const side = state.activePlayer;

  // Clear per-turn flags for this side only
  resetTranceFlagsFor(side);
  resetAdvanceFlagsFor(side);     // ← NEW: per-slot once-per-turn flag reset

  if (!shuffledOnce){
    shuffleInPlace(state.players.player.deck || []);
    shuffleInPlace(state.players.ai.deck || []);
    shuffledOnce = true;
  }

  // clear temp aether at start
  state.players.player.tempAether = 0;
  state.players.ai.tempAether = 0;

  // Draw up to 5 + Trance L1 bonus
  const tranceL = (state.players[side].tranceLevel|0);
  const baseNeed = Math.max(0, 5 - (state.players[side].hand?.length||0));
  const bonus    = tranceL >= 1 ? 1 : 0;
  const need     = baseNeed + bonus;

  const active = side;
  reshuffleFromDiscard(active);

  // IMPORTANT: run the draw-up sequence *inside* the official Draw Step
  await withDrawStep(async () => {
    const HAND_CAP = 5;
    if (need) {
      // Same path as the menu "Draw 1", but with a gentle stagger so it reads clearly
      let guard = 12;
      while ((state.players?.[active]?.hand?.length || 0) < HAND_CAP && guard-- > 0) {
        await drawOneLikeMenu(active);
        await sleep(165); // make the entry feel like the menu Draw 1
      }
    } else {
      await render();
    }
  });

  Emit(Events.TURN_START, { side });
}

async function doEndTurn() {
  Emit(Events.TURN_END, { side: state.activePlayer });

 // count what's about to be discarded (most rulesets ditch the whole hand)
  const prevSide = state.activePlayer;
  const prevHandN = (serializePublic(state)?.players?.[prevSide]?.hand?.length) | 0;
  
  state = endTurn(state);

if (prevHandN > 0) {
    // visual only: hand -> discard chips
    animateDiscardCards(prevSide, prevHandN);
  }
  
  await doStartTurn();   // loops cleanly into next side’s Start Turn
}



/* Central hook for Kareth (“after you spend Æ …”) */
function karethAfterSpend(side, spentNow){
  if (!spentNow) return;
  ensureTranceFlags();
  const key = sideWeaverKey(side);
  const lvl = tranceLevel(side);
  const f = state.players[side]._trFlags;

  if (key === "kareth") {
    // L1: once/turn ping for any play/advance spend
    if (lvl >= 1 && !f.karethL1Used) {
      state = dealDamage(state, enemyOf(side), 1, { source:"kareth-L1" });
      f.karethL1Used = true;
    }
    // L2: if a single spend is 3+ Æ, deal +1 more
    if (lvl >= 2 && (spentNow|0) >= 3) {
      state = dealDamage(state, enemyOf(side), 1, { source:"kareth-L2" });
    }
    // running total in case you want to extend later
    f.spentThisTurn += (spentNow|0);
  }
}

/* Flow price helper for Morr L2 (“first Flow buy costs 1 less and Channel 1”) */
function effectiveFlowPrice(side, base){
  ensureTranceFlags();
  if (sideWeaverKey(side) !== "morr") return base|0;
  if (tranceLevel(side) < 2) return base|0;
  const f = state.players[side]._trFlags;
  return (f.morrL2DiscountUsed ? base|0 : Math.max(0, (base|0) - 1));
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
      const aiMini = document.getElementById('ai-mini');
      const fromIsAI = !!(node.closest?.('.row.ai') || (aiMini && aiMini.contains(node)));

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
  const btn = document.getElementById("toggle-backdrop");
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

// =====================================================
// Pip track interactions (delegated, one-time) — FIXED
// =====================================================

// true if this slot can advance right now (once/turn + enough Æ)
function canAdvanceSlot(side, slotIndex, stepCost) {
  const P = state.players?.[side];
  const slot = P?.slots?.[slotIndex];
  const c    = slot?.card;

  if (!P || !slot || !slot.hasCard || !c || c.type !== "SPELL") return false;

// NEW: placement lock — cannot advance the same turn it was played
  if ((c._enteredTurn|0) === (state.turn|0)) return false;

  
  // enforce "once per spell per turn"
  if (slot.advancedThisTurn) return false;

  const need = Number(stepCost || 1);

  // spend temp Æ first, then regular Æ
  const haveTemp = Number(P.tempAether || 0);
  const have     = Number(P.aether || 0);

  return (haveTemp + have) >= need;
}

// build pip HTML with the cost INSIDE each circle
function buildPipTrackHTML({ pip = 1, progress = 0, stepCost = 1 }) {
  const p = Number(pip);
  const prog = Number(progress);
  const cost = String(stepCost);

  let dots = "";
  for (let i = 0; i < p; i++) {
    const filled = i < prog ? " filled" : "";
    // number is inside the circle
    dots += `<span class="pip${filled}"><span class="v">${cost}</span></span>`;
  }
  return `<div class="pip-track" role="button" tabindex="0" aria-label="Advance Spell">${dots}</div>`;
}

// refreshes .can-advance on all visible tracks
function refreshPipAdvanceClasses() {
  // Player row only (AI doesn’t click)
  document.querySelectorAll('#player-slots .slot.spell .card').forEach((el, i) => {
   const pub = serializePublic(state) || {};
    const canNow = !!pub.players?.player?.slots?.[i]?.canAdvance;
    const track     = el.querySelector('.pip-track');
    if (track) track.classList.toggle('can-advance', !!canNow);
  });
}

// click handler: pay cost and advance exactly 1 step
function ensurePipHandlers() {
  // Delegate on the player slot row
  const host = document.getElementById('player-slots');
  if (!host) return;

  host.addEventListener('click', async (ev) => {
    const track = ev.target.closest('.pip-track');
    if (!track) return;

    // find the enclosing card
    const cardEl = track.closest('.card');
    if (!cardEl) return;

    const side      = 'player';
    const slotIndex = Number(cardEl.dataset.slotIndex || track.dataset.slotIndex || 0);
     // Trust the engine’s serialized flag, then do guard+spend atomically
    const pub = serializePublic(state) || {};
    if (!pub.players?.player?.slots?.[slotIndex]?.canAdvance) return;
    state = payAndAdvanceOne(state, side, slotIndex);

    // re-render UI and classes
    await render();
    refreshPipAdvanceClasses();
  });

  // keyboard (Enter/Space) on focused track
  host.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const track = ev.target.closest('.pip-track');
    if (!track) return;
    ev.preventDefault();
    track.click();
  });
}

// call once after you’ve rendered the player slots
function initPipTrackUIOnce() {
  ensurePipHandlers();
  refreshPipAdvanceClasses();
}




/* ---------- state ---------- */
let state = initState();
let bootDealt = false;
let prevFlowIds = [null,null,null,null,null];
let prevHandIds = [];
let prevAiHandIds = [];
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
Grey.on?.(Events.TURN_START, async ({ side }) => {
  logLine(`Turn start → ${side}`);

  // Player turn – nothing special here.
  if (side !== 'ai') return;

  // AI turn: act like a real player — play step-by-step with small pauses.
  const api = makeAiApi();

  // Short pause so the player can see AI’s fresh draw
  await sleep(350);
  await render();

  // Safety: up to N actions max so the AI can’t “lock” a turn
  let safety = 20;
  while (safety-- > 0) {
    // Wait if the player’s reaction popover is open.
  while (reactionUI?.open) await sleep(40);
    const before = serializePublic(state);
    const beforeKey = JSON.stringify({
      hand: before?.players?.ai?.hand?.map(c => c.id) || [],
      slots: (before?.players?.ai?.slots || []).map(s => s?.card?.id || null),
       // Include progress so a free advance counts as a change.
    slotsProg: (before?.players?.ai?.slots || []).map(s => s?.card?.progress || 0),
      ae: {
        p: before?.players?.ai?.aether || 0,
        t: before?.players?.ai?.tempAether || 0
      },
      flow: (before?.flow || []).map(c => c?.id || null),
    });

    // ask AI to take exactly one action
    try {
      if (AI?.runAiTurn) state = await AI.runAiTurn(state, api);
    } catch { /* ignore a single AI error and bail */ break; }

    // Repaint so mini hand / counts / board reflect the action
    await render();
    // Small beat so humans can follow
    await sleep(420);

    // Detect “no-op” (nothing changed) → AI is done
    const after = serializePublic(state);
    const afterKey = JSON.stringify({
      hand: after?.players?.ai?.hand?.map(c => c.id) || [],
      slots: (after?.players?.ai?.slots || []).map(s => s?.card?.id || null),
      slotsProg: (after?.players?.ai?.slots || []).map(s => s?.card?.progress || 0),
      ae: {
        p: after?.players?.ai?.aether || 0,
        t: after?.players?.ai?.tempAether || 0
      },
      flow: (after?.flow || []).map(c => c?.id || null),
    });
    if (beforeKey === afterKey) break;
  }

  // Discard the AI hand at end of AI turn (mirror the player experience)
  await sleep(300);
  Emit(Events.TURN_END, { side: 'ai' });
  state = endTurn(state);
  await render();

  // Kick off the player’s next turn
  await doStartTurn();
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
  // evt.kind: 'ai-instant' | 'ai-glyph' | 'ai-spell' | 'ai-channel'
  const discardTarget = '#ai-mini-discard';
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

    // If it was a channel, emit particles from AI mini hand (or deck fallback) → AI TEMP crescent
    if (evt.kind === 'ai-channel') {
  const nodeFromMini = document.querySelector(`#ai-mini-hand .mini-card[data-card-id="${evt.cardId}"]`);
  const fallbackNode = document.getElementById('ai-mini-deck');
  const fallbackStart = rectOf(nodeFromMini || fallbackNode) || centerRect();
  const destRect  = domRectOfTempCrescent('ai');
  emitParticlesFromSpotlightOr(fallbackStart, destRect, 28);
}

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

/** Display-only: in on-card rules text, show "Crystalize" instead of "Channel" for SPELLs.
 *  (Does NOT touch the action button above the card, which stays "Channel".) */
function resolveTerminologyForDisplay(card, rawText){
  if (!rawText) return "";
  // Normalize custom terminology in card rules for display.  The game now uses
  // unified Aether terminology: “Store X Aether” instead of “Crystallize X” or
  // “Channel X”.  This replacement is applied to all card types, not only
  // spells.
  // Capture the keyword (crystallize/crystalize or channel) and the number that
  // follows it and replace with "Store <n> Aether".  The regex is case
  // insensitive and matches both spell and non‑spell cards.
  return rawText.replace(/\b(crystali[sz]e|channel)\s+(\d+)/gi, (_m, _kw, n) => {
    return `Store ${n} Aether`;
  });
}

function cardShellHTML(c){
  const pipTotal = Number.isFinite(c.pip) ? Math.max(0, c.pip|0) : 0;
  const prog = Math.min(Math.max(0, c.progress|0), pipTotal);

 const stepCost = Number.isFinite(c.advanceCost) ? c.advanceCost
               : Number.isFinite(c.stepCost)     ? c.stepCost
               : 1;

const pipDots = `<div class="pip-track">${
  pipTotal > 0
    ? Array.from({length:pipTotal}).map((_,i)=>`
        <span class="pip${i<prog?' filled':''}">
          <span class="n">${stepCost}</span>
        </span>`).join("")
    : ""
}</div>`;



 // Determine the play cost badge value.  Prefer playCost if present; fall
  // back to the legacy cost field.  Do not display the badge when the
  // play cost is zero.
  let pcRaw;
  if (Number.isFinite(c.playCost)) {
    pcRaw = c.playCost;
  } else if (Number.isFinite(c.cost)) {
    pcRaw = c.cost;
  } else {
    pcRaw = 0;
  }
  const playCost = pcRaw > 0 ? pcRaw : null;

  // ⬇️ Crescent TEMP Æ chip (replaces the old gem chip)
  const aetherChip =
    (c.aetherValue > 0)
      ? `<div class="aether-chip temp" title="Channels temporary Æ">
           <span class="v">${c.aetherValue|0}</span>
           <span class="ico" aria-hidden="true">${svgAetherTemp(28)}</span>
         </div>`
      : "";

  // Build rules text, then apply display-only terminology swap for SPELL cards
  const rulesRaw = withAetherText(cleanRulesText(c.text || ""));
  const rulesForDisplay = resolveTerminologyForDisplay(c, rulesRaw);

  return `
    <div class="title">${c.name}</div>
    <div class="type" data-k="${c.type||""}">${c.type||""}</div>
    ${playCost !== null ? `<div class="play-cost-badge"><span class="v">${playCost}</span></div>` : ``}
    <div class="divider"></div>
    ${pipDots}
    <div class="textbox">${withAetherIcons(rulesForDisplay)}</div>
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
function clearAllActionMenus(){
  // Do not remove the React/Pass popover while a reaction window is open.
  if (reactionUI && reactionUI.open) return;
  document.querySelectorAll('.action-pop').forEach(n => n.remove());
}
function firstOpenSpellSlotIndexFor(side, pub){
  const slots = pub.players?.[side]?.slots || [];
  for (let i=0;i<3;i++) if (!slots[i]?.hasCard) return i;
  return -1;
}
function firstOpenSpellSlot(pub){ return firstOpenSpellSlotIndexFor("player", pub); }
function canChannel(card){
  // Allow discarding any card; cards with zero aetherValue yield 0 Æ.
  return true;
}
function canPlaySpell(pub, card){ return card?.type==="SPELL" && firstOpenSpellSlot(pub) >= 0; }
function canSetGlyph(pub, card){
  if (card?.type!=="GLYPH") return false;
  const slot = (pub.players?.player?.slots || [])[3];
  return slot && !slot.hasCard;
}
function canCastInstant(pub, card){
  // Only allow normal instants to be cast via the popover. Reaction cards
  // are played during reaction windows via a separate "React" button.
  if (card?.type !== "INSTANT") return false;
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
  // Only offer cast on true INSTANTs; Reaction cards are handled via "React" when a reaction window is active
  if (canCastInstant(pub, cardData) && cardData.type !== 'REACTION') opts.push({k:"cast",    label:"Cast"});
  if (canChannel(cardData)){
    // Label as "Discard" if the card doesn't grant any Æ when channeled
    const label = ((cardData?.aetherValue|0) > 0) ? "Channel" : "Discard";
    opts.push({k:"channel", label});
  }
  // If this is a Reaction card and a reaction window is open for the player,
  // show a "React" option instead of "Cast". Reaction windows specify which side
  // may respond. We ignore the trigger match here and leave effect resolution
  // to the game logic. Reaction windows are stored on state.
  // If this is a Reaction card and a reaction window is open for the player,
  // override normal options and show only React and Pass
// Show React/Pass only if this is a reaction window for the current player.
  // state.reactionWindow.defender stores the player index (0 = local player).
  // For reaction cards, override normal actions and show React/Pass only when a reaction window
  // is open for the player.  reactionUI.defender will be 'player' when it's the player's turn to respond.
  if (
    cardData.type === 'REACTION' &&
    reactionUI &&
    reactionUI.open &&
    reactionUI.defender === 'player'
  ) {
    opts.length = 0;
    opts.push({ k: "react", label: "React" });
    opts.push({ k: "pass", label: "Pass" });
  }
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
          const idx = firstOpenSpellSlot(serializePublic(state)||{});
          if (idx>=0){ await playSpellFromHandWithTemp("player", cardData.id, idx); }
        } else if (o.k === "set"){
          await setGlyphFromHandWithTemp("player", cardData.id);

        } else if (o.k === "channel"){
          // 1) Cine: hand card → discard HUD
          cineFromHandCard(cardData.id, '#btn-discard-hud', 'channel');

          // 2) Particles: prefer spotlight anchor; fall back to the hand card rect
const fromNode = cardEl;
const fallbackStart = rectOf(fromNode) || centerRect();
const destRect  = domRectOfTempCrescent('player');
emitParticlesFromSpotlightOr(fallbackStart, destRect, 28);

          // 3) Payoff
          const before = getAe("player");
          state = discardForAether(state, "player", cardData.id);
          const gained = getAe("player") - before;
          adjustAe("player", -gained);
          addTemp("player", gained);
          Emit(Events.CHANNEL, {side:"player", cardId:cardData.id, gained});

        } else if (o.k === "cast"){
          state = await window.castInstantFromHand(state, "player", cardData.id);
        } else if (o.k === "react"){
          // Playing a reaction card in a reaction window: delegate to castInstantFromHand,
          // which resolves Reactions via GameLogic
          state = await window.castInstantFromHand(state, "player", cardData.id);
          closeReactionWindow(false);
          // Resume any queued events that were paused by the reaction window
          await spotlightFromEvents(state);
        } else if (o.k === "pass"){
          // Player chooses to pass on reacting. Clear window and continue
          closeReactionWindow(true);
          // Resume any queued events when passing
          await spotlightFromEvents(state);
        }
      } catch(e){}
      clearAllActionMenus();
      await render();
    });

    pop.appendChild(b);
  });

  document.body.appendChild(pop);
  // Ensure reaction popovers appear above the dimming overlay and other UI
  pop.style.zIndex = 3600;
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
  const el = handEl?.querySelector(`.card[data-card-id="${cardId}"]`);
  if (el) el.classList.add('grey-hide-during-flight');

  // Fly card and emit particles from the spotlight (or the dragged card) → player TEMP crescent
  cineFromHandCard(cardId, '#btn-discard-hud', 'channel');
  const fallbackStart = rectOf(el) || centerRect();
  const dest = domRectOfTempCrescent('player');
  emitParticlesFromSpotlightOr(fallbackStart, dest, 28);

  // Payoff
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
  // Use engine guard+spend+advance atomically
 const pub = serializePublic(state) || {};
  // Only enforce canAdvance for the player’s side; AI uses engine rules.
  if (side === 'player') {
    if (!pub.players?.[side]?.slots?.[slotIndex]?.canAdvance) return;
  }
  state = payAndAdvanceOne(state, side, slotIndex);
  render();
}


// Expose for AI (signature matches what ai.js calls)
if (typeof window !== 'undefined') window.advanceSpell = (side, slotIndex) => advanceSpellAt(side, slotIndex);


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
    // reflect occupancy so CSS can undim when a card is present
d.classList.toggle('has-card', !!(slot.hasCard && slot.card));
    if (slot.hasCard && slot.card){
      const art = document.createElement("article");
        art.className = "card";
        if (FLOW_BOUGHT_IDS.has(slot.card.id)) art.classList.add("flow-bought");
        art.innerHTML = cardHTML(slot.card);

      attachPeekAndZoom(art, slot.card);
      d.appendChild(art);

      // (Pulse handled below via engine snapshot slot.canAdvance)


      // make pip track clickable to advance
      if (isPlayer && slot.card.type === "SPELL" && (slot.card.pip|0) > 0){
        const track = art.querySelector('.pip-track');
        if (track){
          // Trust the engine snapshot
          const pubSnap = serializePublic(state) || {};
          const canAdv = !!pubSnap.players?.player?.slots?.[i]?.canAdvance;
          track.classList.toggle('can-advance', canAdv);
          track.title = canAdv ? 'Spend 1 Æther to advance' : '';
          track.tabIndex = canAdv ? 0 : -1;  // focusable only if actionable
          track.setAttribute('role', canAdv ? 'button' : 'presentation');
      
          // replace any previous handlers to avoid duplicates across re-renders
          track.onclick = canAdv ? async (ev) => {
            ev.stopPropagation();
            state = payAndAdvanceOne(state, 'player', i);
            await render();
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

  // Back face (always visible)
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

  if (isPlayer) {
    // Player: show real glyph front face (can flip)
    const front = document.createElement("div");
    front.className = "face front";
    const frontInner = document.createElement("div");
    frontInner.className = "front-inner";

    const cardNode = document.createElement("article");
    cardNode.className = "card";
    if (FLOW_BOUGHT_IDS.has(glyphSlot.card.id))
      cardNode.classList.add("flow-bought");

    cardNode.innerHTML = cardHTML(glyphSlot.card);
    attachPeekAndZoom(cardNode, glyphSlot.card);
    frontInner.appendChild(cardNode);
    front.appendChild(frontInner);
    holder.appendChild(front);
  } else {
    // AI: conceal glyph entirely, no front face and no pointer events
    holder.setAttribute("data-concealed", "ai");
    holder.style.pointerEvents = "none";
  }

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

  // True AI hand from public snapshot
  const hand = Array.isArray(pub?.players?.ai?.hand) ? pub.players.ai.hand : [];

  // Build a list of ids (cap visible fan at 6 so it stays compact)
  const newIds = hand.slice(0, 6).map(c => c?.id).filter(Boolean);

  // Rebuild DOM
  aiMiniHandEl.replaceChildren();
  const step = 10;   // horizontal spread
  const rot  = 5;    // degree spread

  const nodes = [];

  newIds.forEach((id, i) => {
    const el = document.createElement("div");
    el.className = "mini-card";
    el.dataset.cardId = id;

    const offset = i - (newIds.length - 1) / 2;
    el.style.setProperty("--dx", `${offset * step}px`);
    el.style.setProperty("--rot", `${offset * rot}deg`);

    // If this id did not exist last frame, mark for a deal-in anim
    if (!prevAiHandIds.includes(id)) el.classList.add("deal-in");

    aiMiniHandEl.appendChild(el);
    nodes.push(el);
  });

  // If any were new, kick the one-shot animation and then clean the flags
  const hadNew = nodes.some(n => n.classList.contains("deal-in"));
  if (hadNew) {
    aiMiniHandEl.classList.add("dealing");
    // allow CSS to pick up 'dealing' before removing classes
    requestAnimationFrame(() => {
      setTimeout(() => {
        aiMiniHandEl.classList.remove("dealing");
        nodes.forEach(n => n.classList.remove("deal-in"));
      }, 380);
    });
  }

  // Update pile counts exactly
  const deckN    = (pub?.players?.ai?.deckCount    ?? 0) | 0;
  const discardN = (pub?.players?.ai?.discardCount ?? 0) | 0;
  if (aiMiniDeckEl)    aiMiniDeckEl.setAttribute("data-count", String(deckN));
  if (aiMiniDiscardEl) aiMiniDiscardEl.setAttribute("data-count", String(discardN));

  // remember for next render
  prevAiHandIds = newIds;
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

   const basePrice = FLOW_PRICE_BY_POS[idx] || 0;
    const effPrice  = effectiveFlowPrice('player', basePrice);
    const canAfford = !!c && playerAe >= effPrice;

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

        const basePrice = FLOW_PRICE_BY_POS[idx] || 0;
        const price = effectiveFlowPrice('player', basePrice);
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


// Morr II: on the FIRST Flow buy each turn, Channel 1 and mark discount used
          ensureTranceFlags();
          if (sideWeaverKey('player') === 'morr' && tranceLevel('player') >= 2) {
           const f = state.players.player._trFlags;
            if (!f.morrL2DiscountUsed) {
             addTemp('player', 1);
              f.morrL2DiscountUsed = true;
              Emit(Events.AETHER_GAIN, { side: 'player', amount:1, source:'Morr L2 (Channel 1)' });
            }
          }

          
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
      <span class="flow-price-num" aria-label="${effPrice} Aether to buy">
        <span class="n">${effPrice}</span>
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




function ensureCrescentChipStyles(){
  if (document.getElementById('crescent-chip-style')) return;
  const s = document.createElement('style');
  s.id = 'crescent-chip-style';
  s.textContent = `
    /* Bottom-left TEMP Æ chip on cards */
    .aether-chip.temp{
      position:absolute; left:10px; bottom:10px;
      display:inline-flex; align-items:center; gap:8px;
      padding:6px 10px; border-radius:999px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.10);
      line-height: 1;
    }
    /* 2× number size vs typical small badge text */
    .aether-chip.temp .v{
      font-size: 22px;        /* bump as needed; this is a clear 2× from the old ~11px */
      font-weight: 600;
      letter-spacing:.02em;
      transform: translateY(1px);
    }
    /* Remove any glow from the crescent icon inside the chip */
    .aether-chip.temp .ico .icon-aether-temp,
    .aether-chip.temp .ico svg{
      filter: none !important;
      opacity: .95;
      animation: none !important;
    }
  `;
  document.head.appendChild(s);
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






function centerOf(el){
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2 };
}

function handAnchor(side){
  // Prefer the actual hand container if present
  const el = document.querySelector(side === 'player' ? '#player-hand' : '#ai-hand')
         || document.querySelector(side === 'player' ? '#player-area' : '#ai-area')
         || document.body;
  return { el, ...centerOf(el) };
}

function fanTargetInHand(side, index, total){
  const { el } = handAnchor(side);
  const r = el.getBoundingClientRect();
  // fan across ~70% of hand width
  const span = r.width * 0.7;
  const cx = r.left + r.width/2;
  const start = cx - span/2;
  const x = start + (total <= 1 ? span/2 : (index / (total - 1)) * span);
  const y = r.top + r.height * (side==='player' ? 0.15 : 0.20);
  return { x, y };
}

function deckAnchor(side){
  // Uses the same helper you added earlier
  return pileAnchor(side, 'deck');
}
function discardAnchor(side){
  return pileAnchor(side, 'discard');
}


function animateDrawCards(side, count=1){
  ensureCardMotionStyles();
  const src = deckAnchor(side);
  const hand = handAnchor(side);
  const total = Math.max(1, count|0);

  for (let i = 0; i < total; i++){
    const chip = document.createElement('div');
    chip.className = `card-fx ${side}`;
    document.body.appendChild(chip);

    const target = fanTargetInHand(side, i, total);
    const midX = (src.x + target.x)/2 + (Math.random()*40 - 20);
    const midY = (src.y + target.y)/2 + (side==='player' ? -60 : 60) + (Math.random()*20 - 10);

    chip.style.setProperty('--sx', `${src.x}px`);
    chip.style.setProperty('--sy', `${src.y}px`);
    chip.style.setProperty('--mx', `${midX}px`);
    chip.style.setProperty('--my', `${midY}px`);
    chip.style.setProperty('--dx', `${target.x}px`);
    chip.style.setProperty('--dy', `${target.y}px`);
    chip.style.setProperty('--r0', `${Math.random()*16-8}deg`);
    chip.style.setProperty('--r1', `${Math.random()*10-5}deg`);

    const dur = 420 + Math.random()*120;
    const delay = i * 70; // gentle stagger
    chip.style.animation = `card-in ${dur}ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`;
    chip.addEventListener('animationend', () => chip.remove(), { once:true });
  }
}

function animateDiscardCards(side, count=1){
  ensureCardMotionStyles();
  const dst = discardAnchor(side);
  const hand = handAnchor(side);
  const total = Math.max(1, count|0);

  for (let i = 0; i < total; i++){
    const chip = document.createElement('div');
    chip.className = `card-fx ${side}`;
    document.body.appendChild(chip);

    // start somewhere within hand fan; toss toward discard
    const start = fanTargetInHand(side, i, Math.max(total, 3));
    const midX = (start.x + dst.x)/2 + (Math.random()*40 - 20);
    const midY = (start.y + dst.y)/2 + (side==='player' ? -40 : 40) + (Math.random()*20 - 10);

    chip.style.setProperty('--sx', `${start.x}px`);
    chip.style.setProperty('--sy', `${start.y}px`);
    chip.style.setProperty('--mx', `${midX}px`);
    chip.style.setProperty('--my', `${midY}px`);
    chip.style.setProperty('--dx', `${dst.x}px`);
    chip.style.setProperty('--dy', `${dst.y}px`);
    chip.style.setProperty('--r1', `${Math.random()*20-10}deg`);
    chip.style.setProperty('--r2', `${Math.random()*80-40}deg`);

    const dur = 380 + Math.random()*140;
    const delay = i * 60;
    chip.style.animation = `card-out ${dur}ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`;
    chip.addEventListener('animationend', () => chip.remove(), { once:true });
  }
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

  const stackKey   = opts.stackKey || null;
  const stackIndex = Number.isFinite(opts.stackIndex) ? (opts.stackIndex|0) : 0;
  const stackDx    = Number.isFinite(opts.stackDx) ? opts.stackDx : 26;
  const stackDy    = Number.isFinite(opts.stackDy) ? opts.stackDy : 18;

  ghost.style.position = "fixed";
  ghost.style.left = `${startRect?.x ?? (innerWidth - 240)/2}px`;
  ghost.style.top  = `${startRect?.y ?? (innerHeight - 336)/2}px`;
  ghost.style.width  = `${startRect?.w ?? 240}px`;
  ghost.style.height = `${startRect?.h ?? 336}px`;
  ghost.style.transformOrigin = "top left";
  ghost.style.willChange = "transform, opacity";
  ghost.style.zIndex = String(2000 + stackIndex);
  ghost.classList.add("cine-glow");
  layer.appendChild(ghost);
  await nextFrame();

  // Compute (and remember) the shared center pose for this stack
  const baseScale = opts.centerScale ?? 1.16;
  let anchorPose;
  if (opts.stackKey) {
    anchorPose = SPOTLIGHT_STACKS.get(opts.stackKey);
    if (!anchorPose) {
      anchorPose = centerRect((startRect?.w ?? 240) * baseScale, (startRect?.h ?? 336) * baseScale);
      SPOTLIGHT_STACKS.set(opts.stackKey, anchorPose);
    }
  } else {
    anchorPose = centerRect((startRect?.w ?? 240) * baseScale, (startRect?.h ?? 336) * baseScale);
  }

  // 🔵 Record spotlight anchor for particle VFX
  LAST_SPOTLIGHT_ANCHOR = { rect: anchorPose, at: performance.now() };

  // Apply per-index offset so items are visibly stacked
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

  if (opts.stackKey) setTimeout(() => SPOTLIGHT_STACKS.delete(opts.stackKey), 1200);
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


function domRectOfAiDiscardHud() {
  const node = document.getElementById('ai-mini-discard'); // small discard pile in the AI mini HUD
  if (!node) return centerRect(); // fallback
  const r = node.getBoundingClientRect();
  const w = Math.min(r.width * 0.9, 180);
  const h = Math.min(r.height * 1.3, 220);
  return {
    x: r.left + (r.width - w) / 2,
    y: r.top  + (r.height - h) / 2,
    w, h,
    cx: r.left + r.width / 2,
    cy: r.top  + r.height / 2
  };
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

 // NEW: placement lock — no pulse the turn it’s played
  if ((c._enteredTurn|0) === (state.turn|0)) return false;

  
  // deny if this spell already advanced this turn
  if (slot.advancedThisTurn) return false;

  const pipTotal = (c.pip|0);
  const prog     = (c.progress|0);
  if (prog >= pipTotal) return false;

  const stepCost = Number.isFinite(c.advanceCost) ? c.advanceCost
                 : Number.isFinite(c.stepCost)     ? c.stepCost
                 : 1;

  return getTotal(side) >= stepCost;
}


async function spotlightFromEvents(state){
  const evts = drainEvents(state) || [];
  if (!evts.length) return;

  // NEW: group draw/discard so animations stagger cleanly per frame
  const drawCounts = { player: 0, ai: 0 };
  const discardCounts = { player: 0, ai: 0 };

  // Iterate sequentially so awaits (cinematics) actually run in order
  for (let i = 0; i < evts.length; i++) {
    const e = evts[i];
    try {
      // ===== Reaction window handler =====
     if (e.t === 'reaction_window') {
        const side = e.side || 'player';
        const trig = e.trigger || 'spell_cast';
        // Ensure engine + UI agree that a window is open
        if (!state.reactionWindow) {
          state.reactionWindow = { side, trigger: trig, defender: (side === 'player' ? 0 : 1) };
        }
        if (side === 'ai') {
          // AI reaction: pick first affordable reaction card and cast it automatically
          const hand = state.players?.ai?.hand || [];
          const reactionCards = hand.filter(c => c.type === 'REACTION' && ((c.playCost ?? c.cost ?? 0) <= getTotal('ai')));
          if (reactionCards.length > 0) {
            const card = reactionCards[0];
            state = await window.castInstantFromHand(state, 'ai', card.id);
          }
          // After AI reacts (or if it cannot), close the reaction window and continue
          state.reactionWindow = null;
          closeReactionWindow(true);
        } else if (side === 'player') {
          // Map engine triggers to UI identifiers and open the reaction window
          let uiTrigger;
          if (trig === 'spell_cast') uiTrigger = 'onCast';
          else if (trig === 'spell_advance') uiTrigger = 'onAdvance';
          else if (trig === 'damage') uiTrigger = 'onDamage';
          else uiTrigger = 'onCast';
          const opened = openReactionWindow(uiTrigger, 'player');
          if (opened) {
            // Pause: push the remaining events back to the engine queue and return
            const remaining = evts.slice(i + 1);
            if (remaining.length) state._events = remaining.concat(state._events || []);
            return;
          } else {
            // No valid reactions; clear the window and continue
            state.reactionWindow = null;
          }
        }
        // Skip further handling for this event
        continue;
      }
      // ===== SPELL: board → discard cinematic =====
      if (e.t === 'resolved' && e.source === 'spell' && Number.isFinite(e.slotIndex)) {
        // Morr I: when a card leaves a Slot → +1 Æ (once/turn)
        try {
          const side = e.side || 'player';
          if (sideWeaverKey(side) === 'morr' && tranceLevel(side) >= 1) {
            ensureTranceFlags();
            const f = state.players[side]._trFlags;
            if (!f.morrL1Used) {
              adjustAe(side, 1);
              f.morrL1Used = true;
              Emit(Events.AETHER_GAIN, { side, amount:1, source:"Morr L1" });
            }
          }
        } catch {}

        const rowSel   = `.row.${e.side || 'player'}`;
        const slotRect = rectOfSelector(`${rowSel} .slot.spell[data-slot-index="${e.slotIndex}"]`) || centerRect();
        const destRect = (e.side === 'ai') ? domRectOfAiDiscardHud() : domRectOfDiscardHud();

        // start (or refresh) a stack key for this resolve sequence
        CURRENT_RESOLVE_STACK.key = `resolve-${Date.now()}`;
        CURRENT_RESOLVE_STACK.at  = performance.now();

        await playCinematic(e.cardData, slotRect, destRect, {
          centerScale: 1.16, holdMs: 300,
          stackKey: CURRENT_RESOLVE_STACK.key, stackIndex: 0, stackDx: 26, stackDy: 18
        });
      }

      // ===== GLYPH: board → discard cinematic =====
      if (e.t === 'resolved' && e.source === 'glyph') {
        // Morr I: also applies when the glyph leaves its slot
        try {
          const side = e.side || 'player';
          if (sideWeaverKey(side) === 'morr' && tranceLevel(side) >= 1) {
            ensureTranceFlags();
            const f = state.players[side]._trFlags;
            if (!f.morrL1Used) {
              adjustAe(side, 1);
              f.morrL1Used = true;
              Emit(Events.AETHER_GAIN, { side, amount:1, source:"Morr L1" });
            }
          }
        } catch {}

        // Enoch II: when a Glyph reveals, draw 1
        try {
          const side = e.side || 'player';
          if (sideWeaverKey(side) === 'enoch' && tranceLevel(side) >= 2) {
            reshuffleFromDiscard(side);
            state = drawN(state, side, 1);
          }
        } catch (err) { console.warn('Enoch II draw failed', err); }

        const rowSel   = `.row.${e.side || 'player'}`;
        const slotRect = rectOfSelector(`${rowSel} .slot.glyph`) || centerRect();
        const destRect = (e.side === 'ai') ? domRectOfAiDiscardHud() : domRectOfDiscardHud();

        const recentMs = performance.now() - (CURRENT_RESOLVE_STACK.at || 0);
        const canStack = recentMs < 1400 && CURRENT_RESOLVE_STACK.key;

        await playCinematic(e.cardData, slotRect, destRect, canStack ? {
          centerScale: 1.12, holdMs: 300,
          // glyph goes ON TOP of the thing that triggered it
          stackKey: CURRENT_RESOLVE_STACK.key, stackIndex: 1, stackDx: 26, stackDy: 18
        } : {
          centerScale: 1.12, holdMs: 300
        });

        // === Single, canonical glyph flip/pulse/remove ===
        {
          const side = e.side || 'player';
          const row  = `.row.${side}`;
          const slot = document.querySelector(`${row} .slot.glyph`);
          if (slot) {
            const art = slot.querySelector('.card');

            // backplate
            if (!slot.querySelector('.glyph-back')) {
              const back = document.createElement('div');
              back.className = 'glyph-back';
              slot.appendChild(back);
            }

            // flip down, then up
            slot.classList.add('flipping-down');
            art?.addEventListener('animationend', () => {
              slot.classList.remove('flipping-down');
              slot.classList.add('flipping-up');
              slot.addEventListener('animationend', () => {
                slot.classList.remove('flipping-up');
              }, { once: true });
            }, { once: true });

            // purple pulse ring
            const pulse = document.createElement('div');
            pulse.className = 'glyph-trigger-circle';
            slot.appendChild(pulse);
            pulse.addEventListener('animationend', () => pulse.remove(), { once: true });

            // brief purple highlight
            art?.classList.add('purple-ring');
            art?.addEventListener('animationend', () => art.classList.remove('purple-ring'), { once: true });

            // remove glyph node after arc
            setTimeout(() => {
              art?.remove();
              slot.classList.remove('has-card');
            }, 800);
          }
          logLine(`${e.side || 'player'} → Glyph triggered & discarded.`);
        }
      }

      // ===== Logging =====
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
        // e.amount may not be set; the animation below handles visuals
        logLine(`${e.side} draws`);
        // Veyra I: draw outside Draw Step → +1 temp Æ once/turn
        try {
          const side = e.side || 'player';
          if (!__IN_DRAW_STEP && sideWeaverKey(side) === 'veyra' && tranceLevel(side) >= 1) {
            ensureTranceFlags();
            const f = state.players[side]._trFlags;
            if (!f.veyraL1Used) {
              addTemp(side, 1);
              f.veyraL1Used = true;
              Emit(Events.AETHER_GAIN, { side, amount:1, source:'Veyra I (temp)' });
            }
          }
        } catch {}
      } else if (e.t === "aether") {
        logLine(`${e.side} gains ${e.amount} Æ`);
      }

      // ===== Visual-only reactions =====

      // FLOW reveal spotlight
      if (e.t === 'reveal' && e.source === 'flow' && Number.isFinite(e.flowIndex)) {
        const flowCard = document.querySelector(`.flow-card:nth-child(${e.flowIndex + 1}) .card.market`);
        if (flowCard) {
          flowCard.classList.add('spotlight');
          flowCard.addEventListener('animationend', () => flowCard.classList.remove('spotlight'), { once:true });
        }
      }

      // Damage VFX (hearts + shatter + floater)
      if (e.t === 'damage') {
        if (e.side === 'player' || e.side === 'ai') {
          const id = e.side === 'player' ? 'player-hearts' : 'ai-hearts';
          const hearts = document.getElementById(id);
          if (hearts) {
            hearts.classList.add('hit');
            hearts.addEventListener('animationend', () => hearts.classList.remove('hit'), { once: true });
          }
        }
        animateDamage(e.side, e.amount || 1);
        markNewestLostHeartShattered(e.side);
      }

      // Reshuffle VFX (discard → deck)
      if (e.t === 'reshuffle') {
        animateReshuffle(e.side, Math.min(18, e.discardCount || 10));
      }

      // === NEW: Tally for draw/discard animations (2B) ===
      if (e.t === 'draw') {
        const s = (e.side === 'ai') ? 'ai' : 'player';
        drawCounts[s] += (e.amount | 0) || 1;
      }
      if (e.t === 'resolved' && (e.source === 'hand-discard' || e.source === 'discard-aether')) {
        const s = (e.side === 'ai') ? 'ai' : 'player';
        discardCounts[s] = (discardCounts[s] || 0) + 1;
      }

    } catch (_err) {
      // swallow to avoid breaking the loop on animation errors
    }
  }

  // ===== After processing all events, fire batched draw/discard animations =====
 if (drawCounts.player > 0)  animateDrawCards('player', drawCounts.player);
  if (drawCounts.ai > 0)      animateDrawCards('ai',     drawCounts.ai);

  if (discardCounts.player > 0) animateDiscardCards('player', discardCounts.player);
  if (discardCounts.ai > 0)     animateDiscardCards('ai',     discardCounts.ai);
}




/* ---------- wrappers that honor temp aether + trance ---------- */
function tranceDiscount(side, cost){
  const lvl = sideObj(side).tranceLevel|0;
  if (lvl >= 2) return Math.max(0, (cost|0) - 1);
  return cost|0;
}
async function playSpellFromHandWithTemp(side, cardId, slotIndex){
  const pub  = serializePublic(state)||{};
  const hand = pub.players?.[side]?.hand||[];
  const card = hand.find(c=> c.id===cardId);
  // Determine the cost to play a spell.  Use the card's playCost if defined;
    // fall back to its cost field.  This ensures free spells (playCost 0)
  // can be played even if their legacy cost reflects step costs.
  let rawCost;
  if (Number.isFinite(card?.playCost)) {
    rawCost = card.playCost|0;
  } else {
    rawCost = card?.cost|0;
  }

  if (getTotal(side) < rawCost){ showToast("Not enough Æther."); return; }

  const useTemp = Math.min(rawCost, getTemp(side));
  adjustAe(side, useTemp); // virtual top-up (GameLogic checks aether)

  const destSel = `.row.${side} .slot.spell[data-slot-index="${slotIndex}"]`;
  const cine = side === 'ai' ? cineFromAiMini : cineFromHandCard;
  cine(cardId, destSel, 'play-spell', { slotIndex });

  try {
    state = playCardToSpellSlot(state, side, cardId, slotIndex);
    const slot = state?.players?.[side]?.slots?.[slotIndex];
    if (slot?.card && slot.card.type === "SPELL") setProgress(slot.card, 0);
    if (useTemp) addTemp(side, -useTemp);
    Emit(Events.CARD_PLAYED, {side, cardId, cost:rawCost});

    // Kareth: react to spend
    karethAfterSpend(side, rawCost);
  } catch(e){
    if (useTemp) adjustAe(side, -useTemp);
    throw e;
  }
}


let lastGlyphJustSetFor = null;  // ← put near other module-level state

async function setGlyphFromHandWithTemp(side, cardId){
  // cine → glyph slot
  const destSel = `.row.${side} .slot.glyph`;
  const cine = side === 'ai' ? cineFromAiMini : cineFromHandCard;
  cine(cardId, destSel, 'set-glyph');

  state = setGlyphFromHand(state, side, cardId);
  Emit(Events.CARD_SET, {side, cardId});

  // Enoch L1: on set, Channel 1 (once/turn)
  ensureTranceFlags();
  if (sideWeaverKey(side) === "enoch" && tranceLevel(side) >= 1) {
    const f = state.players[side]._trFlags;
    if (!f.enochL1Used) {
      addTemp(side, 1);
      f.enochL1Used = true;
      Emit(Events.AETHER_GAIN, { side, amount:1, source:"Enoch L1" });
    }
  }

  // quick flip feedback you had
  const slot = document.querySelector(`.row.${side} .slot.glyph`);
  if (slot) {
    slot.classList.add('flipping-down');
    slot.addEventListener('animationend', () => slot.classList.remove('flipping-down'), { once: true });
  }
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
 const cost = rawCost; // Instants should not be discounted by Aria L2
  if (getTotal(side) < cost){ showToast("Not enough Æther."); return state; }

  const useTemp = Math.min(cost, getTemp(side));
  adjustAe(side, useTemp);
  try{
    if (useTemp) addTemp(side, -useTemp);
  
    // cinematic from the hand card → discard HUD
   const cine = side === 'ai' ? cineFromAiMini : cineFromHandCard;
const destSel = side === 'ai' ? '#ai-mini-discard' : '#btn-discard-hud';
cine(cardId, destSel, 'instant');

  
    // resolve to discard + event for spotlight
    state = resolveInstantFromHand(state, side, cardId);
    Emit(Events.CARD_CAST, {side, cardId, cost});
    karethAfterSpend(side, rawCost);

    await render();
  } catch(e) {
    if (useTemp) adjustAe(side, -useTemp);
    throw e;
  }

  return state;
};



function ensureParticleLayer(){
  let layer = document.getElementById('particle-layer');
  if (!layer){
    layer = document.createElement('div');
    layer.id = 'particle-layer';
    Object.assign(layer.style, {
      position:'fixed', inset:'0', pointerEvents:'none', zIndex:'2100'
    });
    document.body.appendChild(layer);
  }
  return layer;
}

function lerp(a,b,t){ return a + (b-a)*t; }

/*
 * Override castInstantFromHand to support Reaction cards.  The existing
 * definition earlier in this file only accepted INSTANT cards and used
 * their `cost` for payment.  Reaction cards use `playCost` and should
 * be accepted here as well.  This override supersedes the earlier
 * definition by reassigning the function on the window object.  It
 * accepts both Instants and Reactions, calculates cost appropriately,
 * triggers the correct cinematic label, and resolves via GameLogic
 * (which handles Reactions automatically).
 */
window.castInstantFromHand = async function(_state, side, cardId) {
  const pub  = serializePublic(state) || {};
  const hand = pub.players?.[side]?.hand || [];
  const card = hand.find(c => c.id === cardId);
  // Accept only Instants or Reactions
  if (!card || (card.type !== 'INSTANT' && card.type !== 'REACTION')) return state;
  // Determine the raw cost based on card type
  const rawCost = card.type === 'REACTION' ? (card.playCost | 0) : (card.cost | 0);
  if (getTotal(side) < rawCost) {
    showToast('Not enough Æther.');
    return state;
  }
  // Choose appropriate cinematic source and label
  const cine    = side === 'ai' ? cineFromAiMini : cineFromHandCard;
  const destSel = side === 'ai' ? '#ai-mini-discard' : '#btn-discard-hud';
  const label   = (card.type === 'REACTION') ? 'reaction' : 'instant';
  // Play the cinematic immediately
  cine(cardId, destSel, label);

  if (card.type === 'REACTION') {
    // For reactions, pay the playCost using temp Æ first and then regular Æ.
    const useTemp = Math.min(rawCost, getTemp(side));
    const spendReg = rawCost - useTemp;
    // Deduct the remainder from regular Æ (negative delta to subtract)
    if (spendReg > 0) adjustAe(side, -spendReg);
    // Deduct from temp Æ
    if (useTemp > 0) addTemp(side, -useTemp);
    try {
      state = resolveInstantFromHand(state, side, cardId);
      Emit(Events.CARD_CAST, { side, cardId, cost: rawCost });
      // Trigger Kareth’s after-spend effects
      karethAfterSpend(side, rawCost);
      await render();
    } catch (e) {
      // Refund payments if the reaction fails
      if (spendReg > 0) adjustAe(side, spendReg);
      if (useTemp > 0) addTemp(side, useTemp);
      throw e;
    }
    return state;
  }
  // For instant cards, pay cost from temp Æ first
  const useTemp = Math.min(rawCost, getTemp(side));
  const spendReg = rawCost - useTemp;
  // Deduct the remainder from regular Æ (use negative delta to subtract)
  if (spendReg > 0) adjustAe(side, -spendReg);
  // Deduct from temp Æ
  if (useTemp > 0) addTemp(side, -useTemp);
  try {
    state = resolveInstantFromHand(state, side, cardId);
    Emit(Events.CARD_CAST, { side, cardId, cost: rawCost });
    // Trigger Kareth’s after-spend effects
    karethAfterSpend(side, rawCost);
    await render();
    } catch (e) {
      // Refund payments if the instant fails
      if (spendReg > 0) adjustAe(side, spendReg);
      if (useTemp > 0) addTemp(side, useTemp);
      throw e;
    }
  return state;
};

/**
 * Emit small blue “embers” that fly start → temp-crescent under the portrait.
 * @param {{x:number,y:number,w:number,h:number}} startRect
 * @param {{x:number,y:number,w:number,h:number}} destRect
 * @param {number} count
 */
async function emitTempAetherParticles(startRect, destRect, count = 28) {
  ensureSiphonVFXStyles();
  const layer = ensureParticleLayer();
  const nodes = [];

  // Vector from start → dest (and a perpendicular)
  const dx = destRect.cx - startRect.cx;
  const dy = destRect.cy - startRect.cy;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len, uy = dy / len;           // unit to target
  const px = -uy, py = ux;                      // unit perpendicular (left-hand)

  // Siphon halo at the card (feels like energy being pulled out)
  const halo = document.createElement('div');
  halo.className = 'siphon-halo';
  halo.style.left = (startRect.cx - 26) + 'px';
  halo.style.top  = (startRect.cy - 26) + 'px';
  layer.appendChild(halo);
  // trigger
  requestAnimationFrame(()=> halo.classList.add('on'));

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const size = 10 + Math.random() * 12; // larger, visible particles

    Object.assign(p.style, {
      position: 'fixed',
      left: (startRect.cx - size / 2) + 'px',
      top:  (startRect.cy - size / 2) + 'px',
      width: size + 'px',
      height: size + 'px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(140,210,255,1) 0%, rgba(70,170,255,0.65) 55%, rgba(0,0,0,0) 80%)',
      boxShadow: '0 0 12px rgba(110,190,255,0.9), 0 0 28px rgba(80,160,255,0.6)',
      pointerEvents: 'none',
      willChange: 'transform, opacity'
    });

    layer.appendChild(p);
    nodes.push(p);

    // --- Path control points (curved, “extracted then pulled in”) ---
    // 1) Lift off the card (slightly *away* from the direct line and up a bit)
    const liftDist  = 24 + Math.random() * 32;
    const liftSide  = (Math.random() < 0.5 ? -1 : 1);
    const liftX = startRect.cx + px * liftSide * liftDist + ux * (-6 + Math.random() * 12);
    const liftY = startRect.cy + py * liftSide * liftDist - 18 - Math.random() * 14;

    // 2) Big arc mid-point (perpendicular spread, ~1/3 of the way)
    const arcT   = 0.35 + Math.random() * 0.08;
    const arcLen = len * arcT;
    const arcBend= (60 + Math.random() * 110) * (Math.random() < 0.5 ? -1 : 1);
    const arcX   = startRect.cx + ux * arcLen + px * arcBend;
    const arcY   = startRect.cy + uy * arcLen + py * arcBend - (10 + Math.random()*20);

    // 3) Funnel approach (slightly before destination, much less perpendicular)
    const funT   = 0.82 + Math.random() * 0.06;
    const funLen = len * funT;
    const funX   = startRect.cx + ux * funLen + px * (arcBend * 0.18);
    const funY   = startRect.cy + uy * funLen + py * (arcBend * 0.18);

    // 4) Destination (center of crescent icon)
    const endX = destRect.cx, endY = destRect.cy;

    // --- Animate with keyframes (curved feel via multiple waypoints) ---
    const dur = 950 + Math.random() * 420;
    const delay = Math.random() * 120;     // light stagger
    const keyframes = [
      { transform: `translate(0px, 0px) scale(.8)`,  opacity: .85, offset: 0.0 },
      { transform: `translate(${liftX - startRect.cx}px, ${liftY - startRect.cy}px) scale(1.15)`, opacity: .95, offset: 0.18 },
      { transform: `translate(${arcX - startRect.cx}px, ${arcY - startRect.cy}px) scale(1.05)`,   opacity: .9,  offset: 0.55 },
      { transform: `translate(${funX - startRect.cx}px, ${funY - startRect.cy}px) scale(.85)`,    opacity: .8,  offset: 0.82 },
      { transform: `translate(${endX - startRect.cx}px, ${endY - startRect.cy}px) scale(.55)`,    opacity: 0,   offset: 1.0 }
    ];

    p.animate(keyframes, {
      duration: dur,
      delay,
      easing: 'cubic-bezier(.15,.85,0,1)', // springs toward target
      fill: 'forwards'
    });
  }

  // Shockwave at destination
  const shock = document.createElement('div');
  shock.className = 'siphon-shock';
  shock.style.left = (destRect.cx - 34) + 'px';
  shock.style.top  = (destRect.cy - 34) + 'px';
  layer.appendChild(shock);
  requestAnimationFrame(()=> shock.classList.add('boom'));

  // cleanup
  setTimeout(() => { halo.remove(); shock.remove(); nodes.forEach(n => n.remove()); }, 1500);
}

// One-time CSS helpers for the siphon halo & shockwave
function ensureSiphonVFXStyles(){
  if (document.getElementById('siphon-vfx-style')) return;
  const s = document.createElement('style');
  s.id = 'siphon-vfx-style';
  s.textContent = `
    .siphon-halo{
      position: fixed; width: 52px; height: 52px; border-radius: 999px;
      pointer-events: none; opacity: 0; transform: scale(.6);
      background: radial-gradient(circle, rgba(120,180,255,.22), rgba(120,180,255,.08) 55%, rgba(0,0,0,0) 70%);
      box-shadow: 0 0 16px rgba(120,200,255,.55), inset 0 0 10px rgba(120,200,255,.35);
      transition: transform 220ms ease, opacity 220ms ease;
      filter: blur(.3px);
    }
    .siphon-halo.on{ opacity: .9; transform: scale(1.15); }
    .siphon-halo.on{ animation: siphonPulse 900ms ease-in-out 1 forwards; }
    @keyframes siphonPulse {
      0% { opacity: .95; transform: scale(1.15); }
      60%{ opacity: .55; transform: scale(.9); }
      100%{ opacity: .15; transform: scale(.75); }
    }

    .siphon-shock{
      position: fixed; width: 68px; height: 68px; border-radius: 999px;
      pointer-events: none; opacity: 0; transform: scale(.4);
      border: 2px solid rgba(140,210,255,.65);
      box-shadow: 0 0 18px rgba(110,190,255,.6);
      transition: transform 520ms ease-out, opacity 620ms ease-out;
      filter: drop-shadow(0 0 8px rgba(110,190,255,.5));
    }
    .siphon-shock.boom{ opacity: .9; transform: scale(2.6); opacity: 0; }
  `;
  document.head.appendChild(s);
}


/** Find the portrait TEMP-Æ crescent target for a side (“player” | “ai”). */
function domRectOfTempCrescent(side){
  const el = (side === 'ai')
    ? document.querySelector('#ai-aether .ae-ico.temp, #ai-aether .icon-aether-temp')
    : document.querySelector('#player-aether .ae-ico.temp, #player-aether .icon-aether-temp');
  if (!el) return centerRect(80,80);
  const r = el.getBoundingClientRect();
  return { x:r.left, y:r.top, w:r.width, h:r.height, cx:r.left + r.width/2, cy:r.top + r.height/2 };
}


// === Prime Aether Flow: reveal up to N cards before the first real turn ===
async function primeAetherFlow(n = 5) {
  try {
    const want = Math.max(0, n|0);
    const have = (state?.flow || []).filter(Boolean).length;
    if (have >= want) return;

    // Clone vital player stats so we can restore them cleanly
    const orig = {
      players: JSON.parse(JSON.stringify(state.players || {})),
    };

    // Run dry turns until Flow has N visible cards
    while (((state.flow || []).filter(Boolean).length) < want) {
      state = startTurn(state);
      state = endTurn(state);
    }

    // Reset key turn state to pre-turn conditions
    state.turn = 0;
    state.activePlayer = 'player';
    (state.players.player.hand = []);
    (state.players.ai.hand = []);
    state.players.player.tempAether = 0;
    state.players.ai.tempAether = 0;

    // Restore base resources
    state.players.player.vitality = orig.players.player?.vitality ?? 5;
    state.players.ai.vitality     = orig.players.ai?.vitality ?? 5;
    state.players.player.aether   = orig.players.player?.aether ?? 0;
    state.players.ai.aether       = orig.players.ai?.aether ?? 0;
  } catch (_) {
    /* Failsafe: skip silently if anything odd happens */
  }
}




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
  ensureCrescentChipStyles();
  
  await renderFlow(s.flow);
  updateWeaverBackdrop();
  
 /* ----- HAND (stable fan; only new cards animate) ----- */
if (handEl) {
  const pub = serializePublic(state) || {};
  const handData = pub.players?.player?.hand || [];

  const oldIds = prevHandIds.slice();
  const newIds = handData.map(c => c.id);

  // 1) Snapshot current transforms/z-index for cards already in the DOM
  const oldTransforms = {};
  handEl.querySelectorAll('.card[data-card-id]').forEach(node => {
    const cid = node.dataset.cardId;
    oldTransforms[cid] = {
      transform: node.style.transform,
      zIndex: node.style.zIndex || ''
    };
  });

  // 2) Rebuild hand DOM (mark only brand-new cards for “deal-in”)
  handEl.replaceChildren();
  const domCards = [];
  const cardById = new Map();   // <-- NEW: remember cards by id for later
  handData.forEach(c => {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.cardId = c.id;
    el.dataset.cardType = c.type
    cardById.set(c.id, c);      // <-- NEW
    
    if (FLOW_BOUGHT_IDS.has(c.id)) el.classList.add('flow-bought');

    el.innerHTML = cardHTML(c);

    // Only new cards start hidden so they can “deal-in” without shuffling others
    if (!oldIds.includes(c.id)) el.classList.add('grey-hide-during-flight');

    wireDesktopDrag(el, c);
    wireTouchDrag(el, c);
    attachPeekAndZoom(el, c);

    // If reaction window is open and this card is playable, mark it
    // BUT do NOT open popover yet (we’ll re-open after entry animation)
    if (reactionUI.open && Array.isArray(reactionUI.playable)) {
      const isPlayable = reactionUI.playable.some(pc => pc && pc.id === c.id);
      if (isPlayable) {
        el.classList.add('reaction-candidate');
        // Defer showCardOptions until after the deal-in finishes
        el.dataset.deferReactionPopover = '1';
      }
    }

    handEl.appendChild(el);
    domCards.push(el);
  });

  // 3) Disable transitions on existing cards while we compute the fresh layout
  const existingNodes = domCards.filter(el => oldIds.includes(el.dataset.cardId));
  existingNodes.forEach(el => {
    el.dataset._origTransition = el.style.transition || '';
    el.style.transition = 'none';
  });

  // 4) Compute layout (measure → apply) with transitions off
  layoutHand(handEl, domCards);
  await nextFrame();
  layoutHand(handEl, domCards);

 

  // Re-enable transitions for future natural moves
  existingNodes.forEach(el => {
    el.style.transition = el.dataset._origTransition || '';
    delete el.dataset._origTransition;
  });






  
// 6) Only newly drawn cards “deal-in”; everyone else stays locked
const addedNodes = domCards.filter(el => !oldIds.includes(el.dataset.cardId));
if (addedNodes.length) {
  // Match the gentler Draw-1 / boot vibe
const SLIDE_PX = 26;
const TILT_DEG = 5;
const FADE_MS  = 420;
const MOVE_MS  = 560;
const GAP_MS   = 120;

// For reaction candidates, temporarily remove the visual class so it
  // doesn’t fight with the entry transform/opacity. We’ll restore after anim.
  const reactionToRestore = [];
  addedNodes.forEach(n => {
    if (n.classList.contains('reaction-candidate')) {
      n.classList.remove('reaction-candidate');
      reactionToRestore.push(n);
    }
  });
  
  // Cancel token so a newer render interrupts any in-progress sequence
  handEl._dealRun = (handEl._dealRun || 0) + 1;
  const runId = handEl._dealRun;

  // IMPORTANT: new cards must start hidden in the DOM build above:
  // if (!oldIds.includes(c.id)) el.classList.add('grey-hide-during-flight');

  const animateOne = (n) => new Promise((resolve) => {
    if (runId !== handEl._dealRun) return resolve(); // aborted by new render

    // Read final pose (already set by layoutHand via CSS vars)
    const cs  = getComputedStyle(n);
    const tx  = parseFloat(cs.getPropertyValue('--tx'))  || 0;
    const rot = parseFloat(cs.getPropertyValue('--rot')) || 0;

    // Start a bit right + extra tilt, fully transparent
    n.classList.add('deal-in');            // perf hint (optional)
    n.style.setProperty('--tx',  (tx + SLIDE_PX) + 'px');
    n.style.setProperty('--rot', (rot + TILT_DEG) + 'deg');
    n.style.opacity    = '0';
    n.style.transition = 'none';

    // Reveal THIS card only (others remain hidden)
    n.classList.remove('grey-hide-during-flight');

    // Commit start pose
    void n.getBoundingClientRect();
    if (runId !== handEl._dealRun) return resolve();

    // Animate to final pose (double-RAF prevents pop on slow paints)
    requestAnimationFrame(() => {
      if (runId !== handEl._dealRun) return resolve();
      requestAnimationFrame(() => {
        if (runId !== handEl._dealRun) return resolve();
        n.style.transition = `opacity ${FADE_MS}ms ease-out, transform ${MOVE_MS}ms cubic-bezier(.22,.61,.36,1)`;

        n.style.setProperty('--tx',  tx + 'px');
        n.style.setProperty('--rot', rot + 'deg');
        n.style.opacity = '1';
      });
    });

    // Cleanup (keep transform via vars; do NOT clear transform)
    setTimeout(() => {
      if (runId !== handEl._dealRun) return resolve();
      n.style.transition = '';
      n.style.opacity    = '';
      n.classList.remove('deal-in');
      resolve();
    }, MOVE_MS + 60);
  });

  (async () => {
    // Sequential so turn-start looks like repeated Draw 1
    for (let i = 0; i < addedNodes.length; i++) {
      if (runId !== handEl._dealRun) break;
      await animateOne(addedNodes[i]);
      if (i < addedNodes.length - 1) await new Promise(r => setTimeout(r, GAP_MS));
    }

    // Restore reaction visual + open popover only AFTER entry animation ends
    reactionToRestore.forEach(n => {
      n.classList.add('reaction-candidate');
      if (n.dataset.deferReactionPopover === '1') {
        const id = n.dataset.cardId;
        const card = cardById.get(id);
        if (card) showCardOptions(n, card);
        delete n.dataset.deferReactionPopover;
      }
    });
    
  })();
}







  




  // 7) Remember for next render
  prevHandIds = newIds;
}


  highlightPlayableCards();

  // inside your async function render() { ... } — at the very end, after all sub-renders:
  spotlightFromEvents(state);

  // --- maintain shattered-heart visuals after DOM rebuild ---
  refreshHeartsShatter('player');
  refreshHeartsShatter('ai');
}



// === Small API surface the AI uses to take actions (one-at-a-time) ===
function makeAiApi() {
  return {
    getPublic: () => serializePublic(state) || {},
    getSideState: (side) => state.players[side],
    findFirstOpenSpellSlot: (side) => {
      const pub = serializePublic(state) || {};
      const slots = pub.players?.[side]?.slots || [];
      for (let i = 0; i < 3; i++) if (!slots[i]?.hasCard) return i;
      return -1;
    },
    canPay: (side, cost) => (getAe(side) + getTemp(side)) >= (cost | 0),

    // Paying helpers used internally by ai.js (we still prefer the wrapped calls below)
    pay: (side, rawCost) => {
      const cost = Math.max(0, rawCost | 0);
      const useTemp = Math.min(cost, getTemp(side));
      if (useTemp) addTemp(side, -useTemp);
      if (cost - useTemp) adjustAe(side, -(cost - useTemp));
    },

    // Allow the AI to advance spells. These wrappers use the engine’s
    // pay‑and‑advance function so temp Æ and regular Æ are handled correctly.
    advanceSpellOne: (side, slotIndex) => {
      state = payAndAdvanceOne(state, side, slotIndex);
      return state;
    },
    payAndAdvanceOne: (side, slotIndex) => {
      state = payAndAdvanceOne(state, side, slotIndex);
      return state;
    },

    // These call the wrapped, animated helpers you already have so cinematics fire
    playSpellFromHand: (side, cardId, slotIndex) => {
      // will emit cine + update, then we render outside
      return (state = state, playSpellFromHandWithTemp(side, cardId, slotIndex), state);
    },
    setGlyphFromHand: (side, cardId) => {
      return (state = state, setGlyphFromHandWithTemp(side, cardId), state);
    },
    castInstantFromHand: async (side, cardId) => {
      state = await window.castInstantFromHand(state, side, cardId);
      return state;
    },
    channelFromHand: (side, cardId) => {
      const before = getAe(side);
      state = discardForAether(state, side, cardId);
      const gained = getAe(side) - before;
      adjustAe(side, -gained);
      addTemp(side, gained);
      Emit(Events.CHANNEL, { side, cardId, gained });
      return state;
    },

    // Flow
    buyFromFlowIndex: (side, idx, price) => {
      const useTemp = Math.min(price, getTemp(side));
      adjustAe(side, useTemp);
      state = buyFromFlow(state, side, idx);
      if (useTemp) addTemp(side, -useTemp);
      Emit(Events.BUY, { side, idx, price });
      return state;
    },
    flowPriceAt: (i) => [4, 3, 2, 2, 2][i] || 0,
  };
}




/* ---------- events ---------- */
$("btn-start-turn")?.addEventListener("click", doStartTurn);
$("btn-end-turn")?.addEventListener("click", doEndTurn);
$("btn-endturn-hud")?.addEventListener("click", doEndTurn);
document.getElementById("zoom-overlay")?.addEventListener("click", closeZoom);
window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });
document.addEventListener("click", clearAllActionMenus);



/* ===================== Demo Gate (lock screen) ===================== */
(() => {
  const LS_KEY = "theGrey_demo_unlocked";
  const DEMO_PASSWORD = (window.__GREY_GATE_PASSWORD || "FRIENDOFKEETER"); // set your own externally if you want

  function isUnlocked() { return localStorage.getItem(LS_KEY) === "yes"; }
  function forceUnlock() { localStorage.setItem(LS_KEY, "yes"); }
  function forceLock()   { localStorage.removeItem(LS_KEY); }

  function ensureStyles() {
    if (document.getElementById("grey-gate-style")) return;
    const s = document.createElement("style");
    s.id = "grey-gate-style";
    s.textContent = `
      #grey-gate{
        position:fixed; inset:0; z-index: 999999;
        display:grid; place-items:center;
        background:rgba(0,0,0,.60); backdrop-filter: blur(6px);
      }
      #grey-gate .sheet{
        width:min(480px, 92vw);
        padding:18px 16px;
        border-radius:14px;
        background:rgba(18,18,18,.96);
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 10px 36px rgba(0,0,0,.55);
        display:grid; gap:10px; text-align:center; color:#eee;
      }
      #grey-gate .pw{
        height:40px; border-radius:10px; padding:0 12px;
        border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06);
        color:#fff; outline:none;
      }
      #grey-gate .btn{
        height:40px; border-radius:10px; padding:0 14px; cursor:pointer;
        border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.12); color:#fff;
      }
      #grey-gate .err{ color:#ff9a9a; min-height:1.2em; }
    `;
    document.head.appendChild(s);
  }

  function showPrompt() {
    ensureStyles();
    // already unlocked? just call through.
    if (isUnlocked()) { window.__greyDemoGate?._onUnlock?.(); return; }

    let layer = document.getElementById("grey-gate");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "grey-gate";
      layer.innerHTML = `
        <div class="sheet" role="dialog" aria-modal="true" aria-label="Demo unlock">
          <div style="font-size:20px; letter-spacing:.02em;">Enter access phrase to play</div>
          <input class="pw" type="password" placeholder="Access phrase" autocomplete="off" />
          <button class="btn" type="button">Unlock</button>
          <div class="err" aria-live="polite"></div>
        </div>`;
      document.body.appendChild(layer);
    }
    const input = layer.querySelector(".pw");
    const btn   = layer.querySelector(".btn");
    const err   = layer.querySelector(".err");

    const tryUnlock = () => {
      const ok = (input.value || "").trim() === String(DEMO_PASSWORD);
      if (!ok) { err.textContent = "Nope. Try again."; input.focus(); input.select(); return; }
      forceUnlock();
      layer.remove();
      window.__greyDemoGate?._onUnlock?.();
    };
    btn.onclick = tryUnlock;
    input.onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };
    setTimeout(() => input?.focus(), 0);
  }

  // Public shim (always present)
  window.__greyDemoGate = {
    isUnlocked,
    showPrompt,
    forceUnlock,
    forceLock,
    _onUnlock: null
  };
})();



/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureTopLeftUI();
  ensureWeaverBackdrop();
  ensureRightHudStrip();
  ensureBoardDimStyles();
  ensureFlowStyles();
  ensureGlyphFlipStyles();
  ensureGlyphFlipDownStyles();
  ensureGlyphResolveStyles();
  ensureTranceStyles();
  ensureFlowBoughtStyles();
  ensurePortraitAeNoGlowStyles();
  ensureDamageVFXStyles();
  // Initialize reaction styles once
  ensureReactionStyles();
  ensureShuffleStyles();
  ensureCardMotionStyles();


// 🔒 Gate check
  const gate = window.__greyDemoGate;
  if (!gate || !gate.isUnlocked()) {
    if (gate) {
      gate._onUnlock = async () => {
        gate._onUnlock = null;

        // 👇 Prime Flow to 5 cards before starting Turn 1
        await primeAetherFlow(5);

         seedFlowToFiveOnBoot(); 
        
        await doStartTurn();
        logLine(`Boot on ${BRANCH_VERSION}`);
      };
      gate.showPrompt();
    } else {
      alert("Demo is locked. Reload after entering the password.");
    }
    return;
  }

  // 👇 Prime Flow to 5 cards before starting Turn 1
  await primeAetherFlow(5);
  seedFlowToFiveOnBoot();   
  await doStartTurn();
  logLine(`Boot on ${BRANCH_VERSION}`);
  renderAiMini(pub);
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


  
