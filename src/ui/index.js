// =========================================================
// THE GREY — UI Renderer (compat DOM for existing CSS)
// - Emits .card, .handCard, .marketCard, .slotCell, .zone, .title, etc.
// - Wires Draw / End Turn / Reset buttons (btnDraw, btnEnd, btnReset)
// - Hooks market buy, hand play/channel, slot click
// =========================================================

/* utilities */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* cached roots */
let elRibbon, elPlayerSlots, elGlyphTray, elAiSlots, elMarketCells;

/* game ref */
let G = null;

/* ---------- card element factory (matches CSS) ---------- */
function makeCardEl(card, variant) {
  // variant: 'hand' | 'flow' | 'slot' | 'aiSlot'
  const el = document.createElement('div');
  el.className = 'card';

  if (variant === 'hand') el.classList.add('handCard');
  if (variant === 'flow') el.classList.add('marketCard');
  if (variant === 'slot') el.classList.add('slotCard');
  if (variant === 'aiSlot') el.classList.add('slotCard');

  // dataset for drag.js + actions
  el.dataset.cid    = card.id || '';
  el.dataset.ctype  = card.t || '';
  el.dataset.cname  = card.n || '';
  el.dataset.cost   = String(card.p || 1);

  // basic content (your CSS styles this)
  el.innerHTML = `
    <div class="cHead">
      <div class="cName">${card.n || 'Card'}</div>
      <div class="cType">${card.t || ''}</div>
    </div>
    <div class="cBody">
      ${card.txt ? `<div class="cText">${card.txt}</div>` : ''}
    </div>
    <div class="cStats">
      ${('v' in card) ? `<span class="stat v">+${card.v||0}⚡</span>` : ''}
      ${('p' in card) ? `<span class="stat p">${card.p||1}↯</span>` : ''}
    </div>
  `;
  return el;
}

/* ---------- render: Aetherflow market ---------- */
function renderMarket() {
  // five market cells in .flowGrid -> ".marketCard[data-flow=i]"
  for (let i = 0; i < 5; i++) {
    const cell = elMarketCells[i];
    if (!cell) continue;
    cell.innerHTML = '';
    const c = G.state.flowRow[i];
    if (!c) continue;

    const cardEl = makeCardEl(c, 'flow');
    cardEl.onclick = () => {
      // BUY_FLOW (player buy)
      G.dispatch({ type: 'BUY_FLOW', index: i });
      renderAll();
    };
    cell.appendChild(cardEl);
  }
}

/* ---------- render: player hand (ribbon) ---------- */
function renderHand() {
  elRibbon.innerHTML = '';
  G.state.hand.forEach((c, idx) => {
    const cardEl = makeCardEl(c, 'hand');

    // primary: click == PLAY / SET / CHANNEL
    cardEl.onclick = (e) => {
      e.stopPropagation();
      if (c.t === 'Instant') {
        G.dispatch({ type: 'CHANNEL_FROM_HAND', index: idx });
      } else {
        // default to placing in first empty spell slot (UI drag will override when dropping on slot)
        const s = G.state.slots.findIndex(x => !x);
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: (s >= 0 ? s : null) });
      }
      renderAll();
    };

    elRibbon.appendChild(cardEl);
  });
}

/* ---------- render: player board (3 spell + 1 glyph) ---------- */
function renderPlayerSlots() {
  // structure: 4 slot cells: 3 spell + 1 glyph to the right
  elPlayerSlots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell';
    if (i === 3) cell.classList.add('glyph'); // right-most is glyph slot

    const slot = (i < 3 ? G.state.slots[i] : null); // glyphs are a tray below, not in slots
    if (slot && slot.c) {
      cell.appendChild(makeCardEl(slot.c, 'slot'));
    } else {
      cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    }

    // allow clicking an occupied slot to "advance" (UX shortcut)
    cell.onclick = () => {
      if (i < 3 && G.state.slots[i]) {
        G.dispatch({ type: 'ADVANCE', slot: i });
        renderAll();
      }
    };

    elPlayerSlots.appendChild(cell);
  }

  // glyph tray (face-down)
  elGlyphTray.innerHTML = '';
  G.state.glyphs.forEach(g => {
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
  elAiSlots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell ai';
    const slot = G.state.ai.slots[i];
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
  $('#deckCount').textContent    = String(G.state.deck.length);
  $('#discardCount').textContent = String(G.state.disc.length);
}

/* ---------- full redraw ---------- */
function renderAll() {
  renderMarket();
  renderHand();
  renderPlayerSlots();
  renderAiSlots();
  renderCounts();
}

/* ---------- button wiring ---------- */
function wireButtons() {
  const btnDraw  = $('#btnDraw');
  const btnEnd   = $('#btnEnd');
  const btnReset = $('#btnReset');

  if (btnDraw)  btnDraw.onclick  = async () => { G.dispatch({ type:'DRAW' }); renderAll(); };

  if (btnEnd)   btnEnd.onclick   = async () => {
    // player end
    G.dispatch({ type:'END_TURN' });
    renderAll();

    // simple AI turn sequence
    G.dispatch({ type:'AI_DRAW' });
    G.dispatch({ type:'AI_PLAY_SPELL' });
    G.dispatch({ type:'AI_CHANNEL' });
    G.dispatch({ type:'AI_ADVANCE' });
    G.dispatch({ type:'AI_BUY' });
    G.dispatch({ type:'AI_SPEND_TRANCE' });

    // back to player
    G.dispatch({ type:'START_TURN' });
    renderAll();
  };

  if (btnReset) btnReset.onclick = () => {
    // soft reset via RESET action if your rules support it
    // fallback: new game
    if (typeof G.reset === 'function') G.reset();
    else if (typeof G.create === 'function') window.game = G = G.create();
    else {
      // use engine factory if available on window
      if (window.GameEngine && typeof window.GameEngine.create === 'function') {
        window.game = G = window.GameEngine.create();
      }
    }
    renderAll();
  };

  // deck / discard modals (if you have modal code elsewhere, just keep the IDs)
  const deckBtn = $('#chipDeck');
  if (deckBtn) deckBtn.onclick = () => console.log('[UI] Deck:', G.state.deck);

  const discBtn = $('#chipDiscard');
  if (discBtn) discBtn.onclick = () => console.log('[UI] Discard:', G.state.disc);
}

/* ---------- init ---------- */
export function init(game) {
  G = game;

  // cache roots (match your HTML)
  elRibbon       = $('.ribbon');
  elPlayerSlots  = $('#playerSlots');
  elGlyphTray    = $('#glyphTray');
  elAiSlots      = $('#aiSlots');
  elMarketCells  = $$('.marketCard');

  wireButtons();
  renderAll();

  // Let drag.js know we’re ready (it attaches globally)
  if (window.DragCards && typeof window.DragCards.refresh === 'function') {
    window.DragCards.refresh();
  }

  // Optional: hide the diagnostic “boot check” if present
  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  console.log('[UI] v4.1 — compat DOM + controls wired');
}
