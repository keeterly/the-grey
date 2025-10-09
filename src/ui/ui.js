// /src/ui/ui.js — Hand fan, empty slots, click preview, pointer-drag

/* ------------------ tiny DOM helpers ------------------ */
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

let _gameRef = null;                 // game engine reference (for dispatch)
const AI_SLOT_COUNT = 3;
const PLAYER_SLOT_COUNT = 3;
const FLOW_COUNT = 5;

/* =======================================================
   HUD
   ======================================================= */
function renderHearts(selector, hp, max = 5) {
  const n = $(selector);
  if (!n) return;
  const v = Math.max(0, Math.min(max, Number(hp) || 0));
  let html = "";
  for (let i = 0; i < max; i++) html += `<span class="heart${i < v ? "" : " is-empty"}">❤</span>`;
  n.innerHTML = html;
}

/* =======================================================
   Slot helpers (for drag targeting)
   ======================================================= */
function getBoardSlotsEl() { return $('#yourBoard'); }
function getBoardSlotNodes() {
  const root = getBoardSlotsEl();
  return root ? Array.from(root.querySelectorAll('.boardSlot')) : [];
}
function markSlots(mode) {            // '', 'target', 'accept'
  getBoardSlotNodes().forEach(n => {
    n.classList.remove('drop-target','drop-accept');
    if (mode === 'target') n.classList.add('drop-target');
    if (mode === 'accept') n.classList.add('drop-accept');
  });
}
function slotIndexFromPoint(x, y) {
  const nodes = getBoardSlotNodes();
  for (let i = 0; i < nodes.length; i++) {
    const r = nodes[i].getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
  }
  return -1;
}

/* =======================================================
   Card template (board/flow/hand)
   ======================================================= */
function cardEl({ title='Card', subtype='', right='', classes='' } = {}) {
  const c = el('div', `card ${classes}`.trim());
  // Disable native HTML drag to avoid “bottom-center ghost”
  c.draggable = false;
  c.addEventListener('dragstart', e => e.preventDefault());
  c.innerHTML = `
    <div class="cHead">
      <div class="cName">${title}</div>
      <div class="cType">${subtype}</div>
    </div>
    <div class="cBody"></div>
    <div class="cStats">${right}</div>
  `;
  return c;
}

/* =======================================================
   Row rendering (empty slots unless there is a real card)
   ======================================================= */
function renderSlots(container, slots = [], slotCount = 3) {
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < slotCount; i++) {
    const wrap = el('div', 'boardSlot');
    wrap.dataset.slotIndex = String(i);

    const s = slots[i]; // could be null/undefined
    if (s) {
      wrap.appendChild(cardEl({
        title: s.name || s.title || 'Card',
        subtype: s.type || s.subtype || 'Spell'
      }));
    } else {
      wrap.appendChild(el('div', 'emptySlot'));
    }
    container.appendChild(wrap);
  }
}

function renderFlow(container, state) {
  if (!container) return;
  container.innerHTML = '';

  const row = Array.isArray(state?.flowRow) ? state.flowRow.slice(0, FLOW_COUNT) : [];
  while (row.length < FLOW_COUNT) row.push(null);

  row.forEach((cell, i) => {
    const wrap = el('div', 'boardSlot');
    wrap.dataset.slotIndex = String(i);
    if (cell) {
      wrap.appendChild(cardEl({
        title: cell.name || 'Aether',
        subtype: cell.type || cell.subtype || 'Instant',
        right: String(i + 1),
      }));
    } else {
      wrap.appendChild(el('div', 'emptySlot'));
    }
    container.appendChild(wrap);
  });
}

/* =======================================================
   Hand fan layout (center to page column)
   ======================================================= */
function layoutHand(ribbonEl) {
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;

  // Anchor to the same center column as the content (fallback: viewport)
  const anchor = document.querySelector('main.grid') || document.body;
  const anchorRect = anchor.getBoundingClientRect();
  const ribbonRect = ribbonEl.getBoundingClientRect();

  const cs = getComputedStyle(ribbonEl);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;

  const n = Math.max(1, fan.children.length);
  const preferred = 120;
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;

  const fanLeft = Math.round((anchorRect.left + anchorRect.width / 2) - (ribbonRect.left + stripW / 2));
  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;

  const centerIdx = (n - 1) / 2;
  fan.querySelectorAll('.cardWrap').forEach(w => (w.style.opacity = '0'));

  requestAnimationFrame(() => {
    fan.querySelectorAll('.cardWrap').forEach((wrap, idx) => {
      const x    = Math.round(idx * spread);
      const tilt = (idx - centerIdx) * 10;
      const arcY = -2 * Math.abs(idx - centerIdx);

      wrap.style.left = `${x}px`;
      wrap.style.setProperty('--wrot', `${tilt}deg`);
      wrap.style.setProperty('--wy', `${arcY}px`);
      wrap.style.zIndex = String(100 + idx);
      wrap.style.transitionDelay = `${idx * 24}ms`;
      wrap.style.opacity = '1';
    });
  });
}

/* =======================================================
   Click-to-preview (50% larger)
   ======================================================= */
function enableClickPreview(wrap) {
  let dragJustHappened = false;

  wrap.addEventListener('pointerdown', () => { dragJustHappened = false; }, { passive: true });
  wrap.addEventListener('preview:dragflag', () => { dragJustHappened = true; });

  wrap.addEventListener('click', (ev) => {
    if (dragJustHappened) return; // ignore click after a drag
    // toggle this card
    const was = wrap.classList.contains('is-preview');
    document.querySelectorAll('.cardWrap.is-preview').forEach(n => n.classList.remove('is-preview'));
    if (!was) wrap.classList.add('is-preview');
    ev.stopPropagation();
  });

  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) wrap.classList.remove('is-preview');
  });
}

/* =======================================================
   Pointer-based drag (mouse + touch)
   - Smooth ghost follows the pointer
   - No native HTML5 drag (we prevent it)
   ======================================================= */
function enablePointerDrag(wrap, handIndex) {
  const cardNode = wrap.querySelector('.card');
  if (!cardNode) return;

  // Block native HTML drag entirely
  wrap.draggable = false;
  wrap.addEventListener('dragstart', e => e.preventDefault());
  cardNode.draggable = false;
  cardNode.addEventListener('dragstart', e => e.preventDefault());

  let dragging = false;
  let pointerId = null;
  let ghost = null;
  let offsetX = 0, offsetY = 0;

  const onPointerMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    if (ghost) ghost.style.transform = `translate(${x}px, ${y}px)`;

    const idx = slotIndexFromPoint(e.clientX, e.clientY);
    markSlots(idx >= 0 ? 'accept' : 'target');
  };

  const endDrag = (e, cancelled = false) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;

    wrap.classList.remove('dragging');
    wrap.dispatchEvent(new CustomEvent('preview:dragflag'));   // so click won't toggle preview
    markSlots('');

    try { wrap.releasePointerCapture(pointerId); } catch (_) {}

    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;

    if (!cancelled) {
      const tgt = slotIndexFromPoint(e.clientX, e.clientY);
      if (tgt >= 0) {
        _gameRef?.dispatch?.({ type: 'PLAY_FROM_HAND', handIndex, slot: tgt });
      }
    }
  };

  const onPointerDown = (e) => {
    // only primary button / single pointer
    if (e.button !== 0) return;

    pointerId = e.pointerId;
    wrap.setPointerCapture(pointerId);

    // Build a ghost sized exactly like the card
    const r = cardNode.getBoundingClientRect();
    ghost = el('div', 'dragGhost');
    ghost.style.width  = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.appendChild(ghost);

    // center ghost on pointer
    offsetX = r.width  / 2;
    offsetY = r.height / 2;

    wrap.classList.add('dragging');
    dragging = true;
    markSlots('target');

    // place once
    onPointerMove(e);
  };

  wrap.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup',   (e) => endDrag(e, false), { passive: true });
  window.addEventListener('pointercancel',(e) => endDrag(e, true), { passive: true });
}

/* =======================================================
   Hand renderer
   ======================================================= */
function renderHand(ribbonEl, state) {
  if (!ribbonEl) return;
  ribbonEl.innerHTML = '';

  const fan = el('div', 'fan');
  ribbonEl.appendChild(fan);

  const hand = Array.isArray(state?.hand) ? state.hand : [];

  if (hand.length === 0) {
    const w = el('div', 'cardWrap');
    w.appendChild(cardEl({ title: '—', classes: 'is-phantom' }));
    fan.appendChild(w);
    layoutHand(ribbonEl);
    return;
  }

  hand.forEach((c, i) => {
    const w = el('div', 'cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : ''
    });
    w.appendChild(node);
    fan.appendChild(w);

    enablePointerDrag(w, i);
    enableClickPreview(w);
  });

  layoutHand(ribbonEl);
}

/* =======================================================
   Public render
   ======================================================= */
export function renderGame(state) {
  // Hearts
  renderHearts('#hud-you-hearts', state?.hp ?? 0, 5);
  renderHearts('#hud-ai-hearts',  state?.ai?.hp ?? 0, 5);

  // Dock counters
  const setTxt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };
  setTxt('#count-deck',    Array.isArray(state?.deck) ? state.deck.length : 0);
  setTxt('#count-discard', Array.isArray(state?.disc) ? state.disc.length : 0);
  setTxt('#count-ae',      state?.ae ?? 0);

  // Boards / flow (empty slots unless actual cards are present)
  renderSlots($('#aiBoard'),   state?.ai?.slots ?? [], AI_SLOT_COUNT);
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots ?? [],  PLAYER_SLOT_COUNT);

  // Hand
  renderHand($('#ribbon'), state);
}

/* =======================================================
   Init
   ======================================================= */
export function init(game) {
  _gameRef = game;
  window.renderGame = renderGame;

  // End turn (right dock)
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));

  // First paint
  renderGame(game.state);

  // Engine → UI
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  // Keep hand centered on resize/orientation
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}
