// =========================================================
// THE GREY — UI (compat DOM + controls + animations)
// Classic (no ESM). Uses window.game from GameEngine + window.Anim.
// Drag passes a target slot via dataset; we honor it here.
// =========================================================

/* utilities */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* cached roots */
let elRibbon, elPlayerSlots, elGlyphTray, elAiSlots, elMarketCells;

/* game ref */
let G = null;

/* ---------- card element ---------- */
function makeCardEl(card, variant) {
  const el = document.createElement('div');
  el.className = 'card';
  if (variant === 'hand')   el.classList.add('handCard');
  if (variant === 'flow')   el.classList.add('marketCard');
  if (variant === 'slot')   el.classList.add('slotCard');
  if (variant === 'aiSlot') el.classList.add('slotCard');

  el.dataset.cid   = card.id || '';
  el.dataset.ctype = card.t || '';
  el.dataset.cname = card.n || '';
  el.dataset.cost  = String(card.p || 1);

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

/* ---------- animations (local helpers) ---------- */

function flyElement(el, toRect, {duration=350, scale=0.92, easing='cubic-bezier(.2,.8,.2,1)'} = {}) {
  const from = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.style.position = 'fixed';
  ghost.style.pointerEvents = 'none';
  ghost.style.margin = '0';
  ghost.style.left = `${from.left}px`;
  ghost.style.top  = `${from.top}px`;
  ghost.style.width  = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  ghost.style.zIndex = '9999';
  ghost.style.transformOrigin = '50% 50%';
  document.body.appendChild(ghost);

  const dx = toRect.left - from.left;
  const dy = toRect.top  - from.top;

  return ghost.animate([
    { transform: `translate(0,0) scale(1)`, opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: .85 }
  ], { duration, easing }).finished.then(() => {
    ghost.remove();
  });
}

async function animateBuyToDiscard(sourceEl) {
  const chip = $('#chipDiscard') || $('#chipDeck') || document.body;
  const r = chip.getBoundingClientRect();
  await flyElement(sourceEl, r, { duration: 420, scale: 0.88 });
}

async function animateDiscardHand() {
  const handCards = $$('.ribbon .handCard');
  const chip = $('#chipDiscard') || document.body;
  const r = chip.getBoundingClientRect();

  for (let i = 0; i < handCards.length; i++) {
    await flyElement(handCards[i], r, { duration: 260 + i*28, scale: 0.86 });
  }
}

async function animateDrawHand() {
  const deck = $('#chipDeck') || document.body;
  const r = deck.getBoundingClientRect();
  const handCards = $$('.ribbon .handCard');

  handCards.forEach((el, i) => {
    const to = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.remove('handCard');
    ghost.style.position = 'fixed';
    ghost.style.left = `${r.left}px`;
    ghost.style.top  = `${r.top}px`;
    ghost.style.width  = `${to.width}px`;
    ghost.style.height = `${to.height}px`;
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    ghost.animate(
      [
        { transform: 'translate(0,0) scale(.9)',   opacity: .0 },
        { transform: `translate(${to.left - r.left}px, ${to.top - r.top}px) scale(1)`, opacity: 1 }
      ],
      { duration: 260 + i*24, easing: 'cubic-bezier(.2,.8,.2,1)' }
    ).finished.then(() => ghost.remove());
  });

  setTimeout(() => window.Anim?.settleHand?.(elRibbon), 180);
}

/* ---------- render: Aetherflow ---------- */
function renderMarket() {
  for (let i = 0; i < 5; i++) {
    const cell = elMarketCells[i];
    if (!cell) continue;
    cell.innerHTML = '';
    const c = G.state.flowRow[i];
    if (!c) continue;

    const cardEl = makeCardEl(c, 'flow');
    cardEl.onclick = async () => {
      // 1) animate
      await animateBuyToDiscard(cardEl);
      // 2) buy
      G.dispatch({ type: 'BUY_FLOW', index: i });
      // 3) immediately repopulate the row
      G.dispatch({ type:'ENSURE_MARKET' });
      renderAll();
    };
    cell.appendChild(cardEl);
  }
}

/* ---------- render: Hand ---------- */
function renderHand() {
  elRibbon.innerHTML = '';
  G.state.hand.forEach((c, idx) => {
    const cardEl = makeCardEl(c, 'hand');

    // click = play / set / channel
    cardEl.onclick = (e) => {
      e.stopPropagation();

      // Slot requested by drag (0..3) — drag.js writes this:
      const drop = cardEl.dataset.dropSlot;
      const dropSlot = (drop !== undefined && drop !== '') ? parseInt(drop, 10) : null;
      cardEl.dataset.dropSlot = ''; // clear for next time

      if (c.t === 'Instant') {
        G.dispatch({ type: 'CHANNEL_FROM_HAND', index: idx });
      } else if (c.t === 'Glyph') {
        // glyphs go to tray; slot is irrelevant
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: null });
      } else {
        // Spell: honor dragged slot if valid, else first empty
        let s = dropSlot;
        if (s == null || s < 0 || s > 2) s = G.state.slots.findIndex(x => !x);
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: (s >= 0 ? s : null) });
      }
      renderAll();
    };

    elRibbon.appendChild(cardEl);
  });

  // Tight, natural fan; re-run after layout settles
  requestAnimationFrame(() => {
    window.Anim?.fanHand?.(elRibbon, { spacing: 28, maxAngle: 12, maxLift: 14 });
  });
}

/* ---------- render: Player Board ---------- */
function renderPlayerSlots() {
  elPlayerSlots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell';
    cell.dataset.slotIndex = String(i);
    if (i === 3) cell.classList.add('glyph');

    const slot = (i < 3 ? G.state.slots[i] : null);
    if (slot && slot.c) {
      cell.appendChild(makeCardEl(slot.c, 'slot'));
    } else {
      cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    }

    // Click to advance (spell slots only)
    cell.onclick = () => {
      if (i < 3 && G.state.slots[i]) {
        G.dispatch({ type: 'ADVANCE', slot: i });
        renderAll();
      }
    };

    elPlayerSlots.appendChild(cell);
  }

  // glyph tray (face down)
  elGlyphTray.innerHTML = '';
  G.state.glyphs.forEach(() => {
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

/* ---------- render: AI Board ---------- */
function renderAiSlots() {
  elAiSlots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell ai';
    const slot = G.state.ai.slots[i];
    if (slot && slot.c) cell.appendChild(makeCardEl(slot.c, 'aiSlot'));
    else cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    elAiSlots.appendChild(cell);
  }
}

/* ---------- counts + deck/discard bar safety ---------- */
function ensureDeckBar() {
  if ($('.deckBar')) return;
  const bar = document.createElement('div');
  bar.className = 'deckBar';
  bar.innerHTML = `
    <button class="chipCirc" id="chipDeck" aria-label="Deck">
      <!-- SVG icon (fallback ♤ for safety) -->
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 8h8"/></svg>
      <small id="deckCount">0</small>
    </button>
    <button class="chipCirc" id="chipDiscard" aria-label="Discard">
      <!-- SVG icon (fallback ⌫ for safety) -->
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 10h10M9 7h6"/></svg>
      <small id="discardCount">0</small>
    </button>
  `;
  document.body.appendChild(bar);
}

function renderCounts() {
  ensureDeckBar();
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

  // Drag needs the fresh DOM
  if (window.DragCards && typeof window.DragCards.refresh === 'function') {
    window.DragCards.refresh();
  }
}

/* ---------- buttons ---------- */
function wireButtons() {
  const btnDraw  = $('#btnDraw');
  const btnEnd   = $('#btnEnd');
  const btnReset = $('#btnReset');

  if (btnDraw)  btnDraw.onclick  = async () => { 
    G.dispatch({ type:'DRAW' }); 
    renderAll(); 
    await animateDrawHand();
  };

  if (btnEnd)   btnEnd.onclick   = async () => {
    await animateDiscardHand();
    // player end
    G.dispatch({ type:'END_TURN' });

    // AI turn
    G.dispatch({ type:'AI_DRAW' });
    G.dispatch({ type:'AI_PLAY_SPELL' });
    G.dispatch({ type:'AI_CHANNEL' });
    G.dispatch({ type:'AI_ADVANCE' });
    G.dispatch({ type:'AI_BUY' });
    G.dispatch({ type:'AI_SPEND_TRANCE' });

    // back to player
    G.dispatch({ type:'START_TURN' });
    renderAll();
    await animateDrawHand();
  };

  if (btnReset) btnReset.onclick = () => {
    if (window.GameEngine && typeof window.GameEngine.create === 'function') {
      window.game = G = window.GameEngine.create();
      G.dispatch({ type:'ENSURE_MARKET' });
      G.dispatch({ type:'START_TURN', first:true });
      renderAll();
      window.Anim?.settleHand?.(elRibbon);
    }
  };

  const deckBtn = $('#chipDeck');
  if (deckBtn) deckBtn.onclick = () => console.log('[UI] Deck:', G.state.deck);

  const discBtn = $('#chipDiscard');
  if (discBtn) discBtn.onclick = () => console.log('[UI] Discard:', G.state.disc);

  // Re-fan on resize/layout shifts
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => window.Anim?.fanHand?.(elRibbon, { spacing: 28, maxAngle: 12, maxLift: 14 }));
  });
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

  // ensure market + starting hand
  G.dispatch({ type:'ENSURE_MARKET' });
  G.dispatch({ type:'START_TURN', first:true });

  renderAll();
  window.Anim?.settleHand?.(elRibbon);

  // Hide boot check if present
  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  console.log('[UI] v3.11 — DOM + animations + drag-aware slots');
}
