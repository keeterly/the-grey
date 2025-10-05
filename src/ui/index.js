// =========================================================
// THE GREY — UI Renderer (compat DOM for existing CSS)
// - Emits .card, .handCard, .marketCard, .slotCell, .zone, .title, etc.
// - Wires Draw / End Turn / Reset buttons (btnDraw, btnEnd, btnReset)
// - Hooks market buy, hand play/channel, slot click
// - Adds data-accept hints for typed drop targets (Spell/Glyph)
// =========================================================

/* utilities */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/* cached roots */
let elRibbon, elPlayerSlots, elGlyphTray, elAiSlots, elMarketCells;

/* game ref */
let G = null;

/* ---------- helpers to read state safely ---------- */
function S() {
  // ensure shapes so UI never explodes even if engine is minimal
  const s = G?.state || {};
  s.deck     = Array.isArray(s.deck)     ? s.deck     : [];
  s.hand     = Array.isArray(s.hand)     ? s.hand     : [];
  s.disc     = Array.isArray(s.disc)     ? s.disc     : [];
  s.glyphs   = Array.isArray(s.glyphs)   ? s.glyphs   : [];
  s.flowRow  = Array.isArray(s.flowRow)  ? s.flowRow  : [null,null,null,null,null];
  s.slots    = Array.isArray(s.slots)    ? s.slots    : [null,null,null];
  s.ai       = typeof s.ai==='object'    ? s.ai       : { slots:[null,null,null] };
  s.ai.slots = Array.isArray(s.ai.slots) ? s.ai.slots : [null,null,null];
  return s;
}

/* ---------- card element factory (matches CSS) ---------- */
function makeCardEl(card, variant) {
  // variant: 'hand' | 'flow' | 'slot' | 'aiSlot'
  const el = document.createElement('div');
  el.className = 'card';
  if (variant === 'hand')   el.classList.add('handCard');
  if (variant === 'flow')   el.classList.add('marketCard');
  if (variant === 'slot')   el.classList.add('slotCard');
  if (variant === 'aiSlot') el.classList.add('slotCard');

  // data for drag/actions
  el.dataset.cid   = card?.id || '';
  el.dataset.ctype = card?.t  || '';
  el.dataset.cname = card?.n  || '';
  el.dataset.cost  = String(card?.p ?? 1);

  // basic content (your CSS styles this)
  const name = card?.n || 'Card';
  const type = card?.t || '';
  const v    = Number.isFinite(card?.v) ? card.v : null;
  const p    = Number.isFinite(card?.p) ? card.p : null;

  el.setAttribute('aria-label', `${name} ${type}`);

  el.innerHTML = `
    <div class="cHead">
      <div class="cName">${name}</div>
      <div class="cType">${type}</div>
    </div>
    <div class="cBody">
      ${card?.txt ? `<div class="cText">${card.txt}</div>` : ''}
    </div>
    <div class="cStats">
      ${v !== null ? `<span class="stat v">+${v}⚡</span>` : ''}
      ${p !== null ? `<span class="stat p">${p}↯</span>` : ''}
    </div>
  `;
  return el;
}

/* ---------- render: Aetherflow market ---------- */
function renderMarket() {
  const st = S();
  for (let i = 0; i < 5; i++) {
    const cell = elMarketCells[i];
    if (!cell) continue;
    cell.innerHTML = '';
    cell.dataset.flowIndex = String(i);

    const c = st.flowRow[i];
    if (!c) {
      // keep an empty box so sizing matches CSS
      const ghost = document.createElement('div');
      ghost.className = 'marketGhost';
      cell.appendChild(ghost);
      continue;
    }

    const cardEl = makeCardEl(c, 'flow');
    // BUY_FLOW (player buy)
    cardEl.onclick = () => {
      if (typeof G.dispatch === 'function') {
        G.dispatch({ type: 'BUY_FLOW', index: i });
        renderAll();
      }
    };
    cell.appendChild(cardEl);
  }
}

/* ---------- render: player hand (ribbon) ---------- */
function renderHand() {
  const st = S();
  elRibbon.innerHTML = '';

  st.hand.forEach((c, idx) => {
    const cardEl = makeCardEl(c, 'hand');
    cardEl.dataset.handIndex = String(idx);

    // primary: click == PLAY / SET / CHANNEL
    cardEl.onclick = (e) => {
      e.stopPropagation();
      if (typeof G.dispatch !== 'function') return;

      if (c.t === 'Instant') {
        G.dispatch({ type: 'CHANNEL_FROM_HAND', index: idx });
      } else if (c.t === 'Glyph') {
        // glyphs go to tray (engine handles as set from hand)
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: null });
      } else {
        // default to first empty spell slot
        const s = st.slots.findIndex(x => !x);
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: (s >= 0 ? s : null) });
      }
      renderAll();
    };

    elRibbon.appendChild(cardEl);
  });
}

/* ---------- render: player board (3 spell + 1 glyph) ---------- */
function renderPlayerSlots() {
  const st = S();
  elPlayerSlots.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell';
    cell.dataset.slotIndex = String(i);

    if (i === 3) {
      // right-most is glyph slot
      cell.classList.add('glyph');
      cell.dataset.accept = 'Glyph';
    } else {
      cell.dataset.accept = 'Spell,Instant';
    }

    const slot = (i < 3 ? st.slots[i] : null); // glyphs are in tray, not here
    if (slot && slot.c) {
      cell.appendChild(makeCardEl(slot.c, 'slot'));
    } else {
      cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    }

    // allow clicking an occupied spell slot to "advance"
    cell.onclick = () => {
      if (i < 3 && st.slots[i] && typeof G.dispatch === 'function') {
        G.dispatch({ type: 'ADVANCE', slot: i });
        renderAll();
      }
    };

    elPlayerSlots.appendChild(cell);
  }

  // glyph tray (face-down)
  elGlyphTray.innerHTML = '';
  st.glyphs.forEach(() => {
    const face = document.createElement('div');
    face.className = 'card glyphCard faceDown';
    face.innerHTML = `
      <div class="cHead"><div class="cName">Glyph</div><div class="cType">Face Down</div></div>
      <div class="cBody"></div>
      <div class="cStats"></div>
    `;
    elGlyphTray.appendChild(face);
  });
}

/* ---------- render: AI board (3 spell slots) ---------- */
function renderAiSlots() {
  const st = S();
  elAiSlots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell ai';
    cell.dataset.slotIndex = String(i);
    const slot = st.ai.slots[i];
    if (slot && slot.c) {
      cell.appendChild(makeCardEl(slot.c, 'aiSlot'));
    } else {
      cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    }
    elAiSlots.appendChild(cell);
  }
}

/* ---------- top HUD counters ---------- */
function renderCounts() {
  const st = S();
  const d = $('#deckCount');     if (d) d.textContent = String(st.deck.length);
  const c = $('#discardCount');  if (c) c.textContent = String(st.disc.length);
}

/* ---------- full redraw ---------- */
function renderAll() {
  renderMarket();
  renderHand();
  renderPlayerSlots();
  renderAiSlots();
  renderCounts();

  // Let drag.js re-scan DOM for draggable/targets
  if (window.DragCards && typeof window.DragCards.refresh === 'function') {
    window.DragCards.refresh();
  }
}

/* ---------- AI turn helper ---------- */
async function runAiTurn() {
  if (typeof G.dispatch !== 'function') return;
  // small delays so any CSS animations have time to breathe
  const step = 60;

  G.dispatch({ type:'AI_DRAW' });       renderAll(); await sleep(step);
  G.dispatch({ type:'AI_PLAY_SPELL' }); renderAll(); await sleep(step);
  G.dispatch({ type:'AI_CHANNEL' });    renderAll(); await sleep(step);
  G.dispatch({ type:'AI_ADVANCE' });    renderAll(); await sleep(step);
  G.dispatch({ type:'AI_BUY' });        renderAll(); await sleep(step);
  G.dispatch({ type:'AI_SPEND_TRANCE' }); renderAll(); await sleep(step);
}

/* ---------- button wiring ---------- */
function wireButtons() {
  const btnDraw  = $('#btnDraw');
  const btnEnd   = $('#btnEnd');
  const btnReset = $('#btnReset');

  if (btnDraw)  btnDraw.onclick  = () => { if (G?.dispatch) { G.dispatch({ type:'DRAW' }); renderAll(); } };

  if (btnEnd)   btnEnd.onclick   = async () => {
    if (!G?.dispatch) return;
    // Player end: discard hand + slide flow etc. (engine handles)
    G.dispatch({ type:'END_TURN' });
    renderAll();

    // AI turn
    await runAiTurn();

    // Back to player
    G.dispatch({ type:'START_TURN' });
    renderAll();
  };

  if (btnReset) btnReset.onclick = () => {
    // “soft” reset if engine supports reset or re-create via GameEngine
    if (typeof G.reset === 'function') {
      G.reset();
    } else if (window.GameEngine && typeof window.GameEngine.create === 'function') {
      window.game = G = window.GameEngine.create();
    }
    renderAll();
  };

  // deck / discard stubs (replace with your modals)
  const deckBtn = $('#chipDeck');
  if (deckBtn) deckBtn.onclick = () => console.log('[UI] Deck:', S().deck);

  const discBtn = $('#chipDiscard');
  if (discBtn) discBtn.onclick = () => console.log('[UI] Discard:', S().disc);
}

/* ---------- init ---------- */
export function init(game) {
  G = game;

  // cache roots (match your HTML)
  elRibbon       = $('.ribbon');
  elPlayerSlots  = $('#playerSlots');
  elGlyphTray    = $('#glyphTray');
  elAiSlots      = $('#aiSlots');
  // the five cells are real DOM elements already in HTML
  elMarketCells  = $$('.marketCard');

  wireButtons();
  renderAll();

  // Optional: hide the diagnostic “boot check” if present
  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  console.log('[UI] v4.2 — compat DOM + typed highlights + safer ghosts');
}
