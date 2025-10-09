// /src/ui/ui.js — Complete, self-contained UI system for The Grey (2025 final build)

let _gameRef = null;

/* ============================================================
   🧱 Helper Utilities
   ============================================================ */
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

// Basic card element template
function cardEl({ title = 'Card', subtype = '', right = '', classes = '' } = {}) {
  const c = el('div', `card ${classes}`.trim());
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

/* ============================================================
   ❤️ HUD / Hearts
   ============================================================ */
function renderHearts(selector, hp, max = 5) {
  const elmt = $(selector);
  if (!elmt) return;
  const val = Math.max(0, Math.min(max, Number(hp) || 0));
  let html = '';
  for (let i = 0; i < max; i++) {
    html += `<span class="heart${i < val ? '' : ' is-empty'}">❤</span>`;
  }
  elmt.innerHTML = html;
}

/* ============================================================
   🎴 Slot / Board Rendering
   ============================================================ */
const AI_SLOT_COUNT = 3;
const PLAYER_SLOT_COUNT = 3;

function renderSlots(container, slots = [], slotCount = 3) {
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < slotCount; i++) {
    const wrap = el('div', 'boardSlot');
    wrap.dataset.slotIndex = String(i);
    const s = slots[i];
    if (s) {
      wrap.appendChild(cardEl({
        title: s.name || s.title || 'Card',
        subtype: s.type || s.subtype || 'Spell',
      }));
    } else {
      wrap.appendChild(el('div', 'emptySlot')); // dashed outline
    }
    container.appendChild(wrap);
  }
}

/* ============================================================
   🌊 Aetherflow Rendering
   ============================================================ */
function renderFlow(container, state) {
  if (!container) return;
  container.innerHTML = '';

  const row = Array.isArray(state?.flowRow) ? state.flowRow.slice(0, 5) : [];
  while (row.length < 5) row.push(null);

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

/* ============================================================
   🃏 Hand Layout & Rendering
   ============================================================ */
function layoutHand(ribbonEl) {
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;
  const anchor = document.querySelector('main.grid') || document.body;
  const anchorRect = anchor.getBoundingClientRect();
  const ribbonRect = ribbonEl.getBoundingClientRect();
  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = Math.max(1, fan.children.length);
  const preferred = 120;
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;
  const fanLeft = Math.round((anchorRect.left + anchorRect.width / 2) - (ribbonRect.left + stripW / 2));
  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;
  const centerIdx = (n - 1) / 2;
  fan.querySelectorAll('.cardWrap').forEach((w) => (w.style.opacity = '0'));
  requestAnimationFrame(() => {
    fan.querySelectorAll('.cardWrap').forEach((wrap, idx) => {
      const x = Math.round(idx * spread);
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

/* ============================================================
   🔍 Click-to-Preview (50% enlarge)
   ============================================================ */
function enableClickPreview(wrap) {
  wrap.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const isActive = wrap.classList.toggle('is-preview');
    document.querySelectorAll('.cardWrap.is-preview').forEach((el) => {
      if (el !== wrap) el.classList.remove('is-preview');
    });
    if (!isActive) wrap.classList.remove('is-preview');
  });
  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) wrap.classList.remove('is-preview');
  });
}

/* ============================================================
   🖱️ Drag & Drop
   ============================================================ */
let _blankDragImage = null;
function getBlankDragImage() {
  if (_blankDragImage) return _blankDragImage;
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  _blankDragImage = c;
  return c;
}

function getBoardSlotsEl() { return document.querySelector('#yourBoard'); }
function getBoardSlotNodes() {
  const root = getBoardSlotsEl();
  return root ? Array.from(root.querySelectorAll('.boardSlot')) : [];
}

function markSlots(mode) {
  getBoardSlotNodes().forEach((n) => {
    n.classList.remove('drop-target', 'drop-accept');
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

function enableMouseDnDOnCard(wrap, handIndex) {
  wrap.draggable = true;
  wrap.addEventListener('dragstart', (e) => {
    wrap.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(handIndex));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(getBlankDragImage(), 0, 0); // suppress blip
    wrap.classList.remove('is-preview');
    markSlots('target');
  });
  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    markSlots('');
  });
  const board = getBoardSlotsEl();
  if (board && !board._dragListenersAdded) {
    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      const i = slotIndexFromPoint(e.clientX, e.clientY);
      markSlots(i >= 0 ? 'accept' : 'target');
    });
    board.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData('text/plain'));
      const tgt = slotIndexFromPoint(e.clientX, e.clientY);
      markSlots('');
      if (tgt >= 0 && Number.isFinite(src)) {
        _gameRef?.dispatch?.({ type: 'PLAY_FROM_HAND', handIndex: src, slot: tgt });
      }
    });
    board._dragListenersAdded = true;
  }
}

/* ============================================================
   🖐️ Hand Rendering
   ============================================================ */
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
      classes: isInstant ? 'is-instant' : '',
    });
    w.appendChild(node);
    fan.appendChild(w);
    enableMouseDnDOnCard(w, i);
    enableClickPreview(w);
  });
  layoutHand(ribbonEl);
}

/* ============================================================
   🎮 Main Renderer
   ============================================================ */
export function renderGame(state) {
  const setTxt = (id, v) => { const n = $(id); if (n) n.textContent = String(v); };
  renderHearts('#hud-you-hearts', state?.hp ?? 0, 5);
  renderHearts('#hud-ai-hearts', state?.ai?.hp ?? 0, 5);
  setTxt('#count-deck', state?.deck?.length ?? 0);
  setTxt('#count-discard', state?.disc?.length ?? 0);
  setTxt('#count-ae', state?.ae ?? 0);
  renderSlots($('#aiBoard'), state?.ai?.slots ?? [], AI_SLOT_COUNT);
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots ?? [], PLAYER_SLOT_COUNT);
  renderHand($('#ribbon'), state);
}

/* ============================================================
   🚀 Init
   ============================================================ */
export function init(game) {
  _gameRef = game;
  window.renderGame = renderGame;
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  renderGame(game.state);
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}
