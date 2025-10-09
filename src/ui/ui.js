// /src/ui/ui.js — clean pointer drag, preview, empty slots
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

let _gameRef = null;
const AI_SLOT_COUNT = 3;
const PLAYER_SLOT_COUNT = 3;
const FLOW_COUNT = 5;

/* ---------- HUD Hearts ---------- */
function renderHearts(selector, hp, max = 5) {
  const node = $(selector);
  if (!node) return;
  const v = Math.max(0, Math.min(max, Number(hp) || 0));
  node.innerHTML = Array.from({ length: max }, (_, i) =>
    `<span class="heart${i < v ? "" : " is-empty"}">❤</span>`).join("");
}

/* ---------- Slot Helpers ---------- */
function getBoardSlotsEl() { return $('#yourBoard'); }
function getBoardSlotNodes() {
  const root = getBoardSlotsEl();
  return root ? Array.from(root.querySelectorAll('.boardSlot')) : [];
}
function markSlots(mode) {
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

/* ---------- Card Template ---------- */
function cardEl({ title='Card', subtype='', right='', classes='' } = {}) {
  const c = el('div', `card ${classes}`.trim());
  c.draggable = false;
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

/* ---------- Render Slots ---------- */
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
        subtype: s.type || s.subtype || 'Spell'
      }));
    } else {
      wrap.appendChild(el('div', 'emptySlot'));
    }
    container.appendChild(wrap);
  }
}

/* ---------- Render Aetherflow ---------- */
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
    } else wrap.appendChild(el('div', 'emptySlot'));
    container.appendChild(wrap);
  });
}

/* ---------- Layout Hand ---------- */
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
  fan.querySelectorAll('.cardWrap').forEach(w => (w.style.opacity = '0'));
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

/* ---------- Click Preview ---------- */
function enableClickPreview(wrap) {
  let dragged = false;
  wrap.addEventListener('pointerdown', () => { dragged = false; }, { passive: true });
  wrap.addEventListener('preview:drag', () => { dragged = true; });
  wrap.addEventListener('click', ev => {
    if (dragged) return;
    const was = wrap.classList.contains('is-preview');
    document.querySelectorAll('.cardWrap.is-preview').forEach(w => w.classList.remove('is-preview'));
    if (!was) wrap.classList.add('is-preview');
    ev.stopPropagation();
  });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) wrap.classList.remove('is-preview');
  });
}

/* ---------- Pointer Drag ---------- */
function enablePointerDrag(wrap, handIndex) {
  const cardNode = wrap.querySelector('.card');
  if (!cardNode) return;
  cardNode.draggable = false;

  let dragging = false, ghost = null, lastX = 0, lastY = 0, rafId = 0;

  const updateGhost = () => {
    if (!dragging || !ghost) return;
    ghost.style.transform = `translate(${lastX}px, ${lastY}px)`;
    rafId = requestAnimationFrame(updateGhost);
  };

  const move = e => {
    if (!dragging) return;
    lastX = e.clientX - ghost.offsetWidth / 2;
    lastY = e.clientY - ghost.offsetHeight / 2;
    // slot highlight check
    const idx = slotIndexFromPoint(e.clientX, e.clientY);
    markSlots(idx >= 0 ? 'accept' : 'target');
  };

  const up = e => {
    if (!dragging) return;
    cancelAnimationFrame(rafId);
    dragging = false;
    wrap.classList.remove('dragging');
    wrap.dispatchEvent(new CustomEvent('preview:drag'));
    markSlots('');
    ghost.remove();
    const idx = slotIndexFromPoint(e.clientX, e.clientY);
    if (idx >= 0) _gameRef?.dispatch?.({ type: 'PLAY_FROM_HAND', handIndex, slot: idx });
  };

  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const rect = cardNode.getBoundingClientRect();
    ghost = cardNode.cloneNode(true);
    ghost.classList.add('dragGhost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);

    wrap.classList.add('dragging');
    dragging = true;
    markSlots('target');

    move(e);
    rafId = requestAnimationFrame(updateGhost);
  });

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up, { passive: true });
}


/* ---------- Render Hand ---------- */
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

/* ---------- Main Render ---------- */
export function renderGame(state) {
  renderHearts('#hud-you-hearts', state?.hp ?? 0, 5);
  renderHearts('#hud-ai-hearts', state?.ai?.hp ?? 0, 5);
  const setTxt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };
  setTxt('#count-deck', state?.deck?.length ?? 0);
  setTxt('#count-discard', state?.disc?.length ?? 0);
  setTxt('#count-ae', state?.ae ?? 0);
  renderSlots($('#aiBoard'),   state?.ai?.slots ?? [], AI_SLOT_COUNT);
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots ?? [], PLAYER_SLOT_COUNT);
  renderHand($('#ribbon'), state);
}

/* ---------- Init ---------- */
export function init(game) {
  _gameRef = game;
  window.renderGame = renderGame;
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  renderGame(game.state);
  document.addEventListener('game:state', ev => renderGame(ev.detail?.state ?? game.state));
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}
