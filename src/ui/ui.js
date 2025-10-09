// /src/ui/ui.js — Centered hand, empty board slots, working drag & dock counters

/* ------------------ tiny DOM helpers ------------------ */
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

let _gameRef = null;

/* ------------------ Board helpers ------------------ */
function getBoardSlotsEl() { return document.querySelector('#yourBoard'); }
function getBoardSlotNodes() {
  const root = getBoardSlotsEl();
  return root ? Array.from(root.querySelectorAll('.boardSlot')) : [];
}
function markSlots(mode) { // '', 'target', 'accept'
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

/* ------------------ HUD hearts ------------------ */
function renderHearts(selector, hp, max = 5) {
  const node = $(selector);
  if (!node) return;
  const val = Math.max(0, Math.min(max, Number(hp) || 0));
  let html = '';
  for (let i = 0; i < max; i++) {
    html += `<span class="heart${i < val ? '' : ' is-empty'}">❤</span>`;
  }
  node.innerHTML = html;
}

/* ------------------ Card template ------------------ */
function cardEl({ title='Card', subtype='', right='', classes='' } = {}) {
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

/* ------------------ Boards / Flow ------------------ */
const AI_SLOT_COUNT = 3;
const PLAYER_SLOT_COUNT = 3;

// Render fixed number of slots. Only render a card in a slot if it was actually played.
function renderSlots(container, slots = [], slotCount = 3) {
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < slotCount; i++) {
    const wrap = el('div', 'boardSlot');
    wrap.dataset.slotIndex = String(i);

    const s = slots[i];
    const hasCard = !!(s && (s.played === true || s.placed === true)); // engine should set this when card moves hand -> board

    if (hasCard) {
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

/* ------------------ Hand layout (centering + arc) ------------------ */
function layoutHand(ribbonEl) {
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;

  // Anchor to the main centered column (or viewport as fallback)
  const anchor = document.querySelector('main.grid') || document.body;
  const anchorRect = anchor.getBoundingClientRect();
  const ribbonRect = ribbonEl.getBoundingClientRect();

  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = Math.max(1, fan.children.length);
  const preferred = 120;
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;

  // Center the fan inside the ribbon
  const fanLeft = Math.round((anchorRect.left + anchorRect.width / 2) - (ribbonRect.left + stripW / 2));
  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;

  // Arc + tilt + stagger
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

/* ------------------ Click-to-preview (50% enlarge) ------------------ */
function enableClickPreview(wrap) {
  wrap.addEventListener('click', (ev) => {
    // ignore if drag just started
    if (wrap.classList.contains('dragging')) return;

    // toggle this one, close others
    const isOpen = wrap.classList.toggle('is-preview');
    document.querySelectorAll('.cardWrap.is-preview').forEach(n => { if (n !== wrap) n.classList.remove('is-preview'); });
    if (!isOpen) wrap.classList.remove('is-preview');
    ev.stopPropagation();
  });
  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) wrap.classList.remove('is-preview');
  });
}

/* ------------------ Drag & Drop: desktop ------------------ */
function enableMouseDnDOnCard(wrap, handIndex) {
  const cardNode = wrap.querySelector('.card');
  if (!cardNode) return;

  cardNode.setAttribute('draggable', 'true');

  cardNode.addEventListener('dragstart', (e) => {
    wrap.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(handIndex));
    e.dataTransfer.effectAllowed = 'move';
    // keep image centered under cursor
    const r = cardNode.getBoundingClientRect();
    e.dataTransfer.setDragImage(cardNode, r.width / 2, r.height / 2);
    markSlots('target');
  });

  cardNode.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    markSlots('');
  });

  // Allow drop over the board container (add once)
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

/* ------------------ Drag & Drop: touch ------------------ */
function enableTouchDnDOnCard(wrap, handIndex) {
  let dragging = false;
  const badge = document.querySelector('.dragBadge') || document.body.appendChild(el('div', 'dragBadge'));

  const onMove = (x, y) => {
    badge.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    const idx = slotIndexFromPoint(x, y);
    markSlots(idx >= 0 ? 'accept' : 'target');
  };

  const onUp = (x, y) => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    badge.style.transform = 'translate(-9999px,-9999px)';
    const tgt = slotIndexFromPoint(x, y);
    markSlots('');
    if (tgt >= 0) {
      _gameRef?.dispatch?.({ type: 'PLAY_FROM_HAND', handIndex, slot: tgt });
    }
  };

  wrap.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    dragging = true;
    wrap.classList.add('dragging');
    badge.textContent = 'Drag to slot';
    const t = ev.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  wrap.addEventListener('touchmove', (ev) => {
    if (!dragging) return;
    const t = ev.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  wrap.addEventListener('touchend', (ev) => {
    const t = ev.changedTouches[0];
    onUp(t.clientX, t.clientY);
  }, { passive: true });

  wrap.addEventListener('touchcancel', () => {
    dragging = false;
    wrap.classList.remove('dragging');
    badge.style.transform = 'translate(-9999px,-9999px)';
    markSlots('');
  }, { passive: true });
}

/* ------------------ Render hand ------------------ */
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

    enableMouseDnDOnCard(w, i);
    enableTouchDnDOnCard(w, i);
    enableClickPreview(w);
  });

  layoutHand(ribbonEl);
}

/* ------------------ Public render ------------------ */
export function renderGame(state) {
  const setTxt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };

  // Hearts
  renderHearts('#hud-you-hearts', state?.hp ?? 0, 5);
  renderHearts('#hud-ai-hearts',  state?.ai?.hp ?? 0, 5);

  // Dock counters (if dock exists)
  setTxt('#count-deck',    Array.isArray(state?.deck) ? state.deck.length : 0);
  setTxt('#count-discard', Array.isArray(state?.disc) ? state.disc.length : 0);
  setTxt('#count-ae',      state?.ae ?? 0);

  // Boards (start empty unless slot has played/placed flag)
  renderSlots($('#aiBoard'),   state?.ai?.slots ?? [], AI_SLOT_COUNT);
  renderFlow ($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots ?? [], PLAYER_SLOT_COUNT);

  // Hand
  renderHand($('#ribbon'), state);
}

/* ------------------ Init ------------------ */
export function init(game) {
  _gameRef = game;
  window.renderGame = renderGame;

  // End Turn from dock (if button exists)
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));

  renderGame(game.state);
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  // Keep hand centered on resize/rotate
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}
