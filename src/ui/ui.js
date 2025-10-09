// /src/ui/ui.js — Pointer-drag fan + empty-slot rows (stable)

function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

let _gameRef = null;

/* ---------- Board helpers ---------- */
function boardRoot() { return document.querySelector('#yourBoard'); }
function boardSlots() {
  const root = boardRoot(); if (!root) return [];
  return Array.from(root.querySelectorAll('.boardSlot'));
}
function markSlots(mode){
  boardSlots().forEach(n => {
    n.classList.remove('drop-target','drop-accept');
    if (mode === 'target') n.classList.add('drop-target');
    if (mode === 'accept') n.classList.add('drop-accept');
  });
}
function slotIndexFromPoint(x, y){
  const nodes = boardSlots();
  for (let i=0;i<nodes.length;i++){
    const r = nodes[i].getBoundingClientRect();
    if (x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return i;
  }
  return -1;
}

/* ---------- Hearts ---------- */
function renderHearts(selector, hp, max = 5){
  const node = $(selector); if (!node) return;
  const val = Math.max(0, Math.min(max, Number(hp) || 0));
  let html = '';
  for (let i=0;i<max;i++) html += `<span class="heart${i < val ? '' : ' is-empty'}">❤</span>`;
  node.innerHTML = html;
}

/* ---------- Card template ---------- */
function cardEl({ title='Card', subtype='', right='', classes='' } = {}){
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

/* ---------- Row renderers (empty unless real cards) ---------- */
const AI_SLOT_COUNT = 3;
const PLAYER_SLOT_COUNT = 3;

function renderSlots(container, slots = [], slotCount = 3){
  if (!container) return;
  container.innerHTML = '';

  for (let i=0;i<slotCount;i++){
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

function renderFlow(container, state){
  if (!container) return;
  container.innerHTML = '';

  const row = Array.isArray(state?.flowRow) ? state.flowRow.slice(0,5) : [];
  while (row.length < 5) row.push(null);

  row.forEach((cell, i) => {
    const wrap = el('div','boardSlot');
    wrap.dataset.slotIndex = String(i);
    if (cell) {
      wrap.appendChild(cardEl({
        title: cell.name || 'Aether',
        subtype: cell.type || cell.subtype || 'Instant',
        right: String(i+1),
      }));
    } else {
      wrap.appendChild(el('div','emptySlot'));
    }
    container.appendChild(wrap);
  });
}

/* ---------- Hand layout (center fan) ---------- */
function layoutHand(ribbonEl){
  const fan = ribbonEl.querySelector('.fan'); if (!fan) return;

  const anchor = document.querySelector('main.grid') || document.body;
  const anchorRect = anchor.getBoundingClientRect();
  const ribbonRect = ribbonEl.getBoundingClientRect();

  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = Math.max(1, fan.children.length);
  const preferred = 120;
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n-1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n-1) * spread + cardW;

  const fanLeft = Math.round((anchorRect.left + anchorRect.width/2) - (ribbonRect.left + stripW/2));
  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;

  const centerIdx = (n-1)/2;
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

/* ---------- Pointer-based DnD (no HTML5 ghost) ---------- */
function enablePointerDnD(wrap, handIndex){
  const card = wrap.querySelector('.card');
  if (!card) return;

  let dragging = false;
  let clone = null;
  let offsetX = 0, offsetY = 0;

  const onMove = (x, y) => {
    if (!clone) return;
    clone.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0)`;
    const i = slotIndexFromPoint(x, y);
    markSlots(i >= 0 ? 'accept' : 'target');
  };

  const onUp = (x, y) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-dragging');
    wrap.classList.remove('drag-src');

    const i = slotIndexFromPoint(x, y);
    markSlots('');
    if (clone) clone.remove();
    clone = null;

    if (i >= 0) {
      _gameRef?.dispatch?.({ type:'PLAY_FROM_HAND', handIndex, slot:i });
    }
    // allow hover effects again next frame
    requestAnimationFrame(() => {});
  };

  wrap.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return; // left only
    ev.preventDefault();

    dragging = true;
    document.body.classList.add('is-dragging');
    wrap.classList.add('drag-src');
    markSlots('target');

    // Build a visual clone that follows the pointer
    clone = el('div','dragClone');
    const n = card.cloneNode(true);
    clone.appendChild(n);
    document.body.appendChild(clone);

    const r = card.getBoundingClientRect();
    offsetX = ev.clientX - r.left;
    offsetY = ev.clientY - r.top;
    onMove(ev.clientX, ev.clientY);

    const move = (e) => onMove(e.clientX, e.clientY);
    const up   = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup',   up,   true);
      onUp(e.clientX, e.clientY);
    };

    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup',   up,   true);
  }, { passive:false });
}

/* ---------- Hand render ---------- */
function renderHand(ribbonEl, state){
  if (!ribbonEl) return;
  ribbonEl.innerHTML = '';
  const fan = el('div','fan'); ribbonEl.appendChild(fan);

  const hand = Array.isArray(state?.hand) ? state.hand : [];
  if (hand.length === 0){
    const w = el('div','cardWrap');
    w.appendChild(cardEl({ title:'—', classes:'is-phantom' }));
    fan.appendChild(w);
    layoutHand(ribbonEl);
    return;
  }

  hand.forEach((c, i) => {
    const w = el('div','cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : ''
    });
    w.appendChild(node);
    fan.appendChild(w);
    enablePointerDnD(w, i);
  });

  layoutHand(ribbonEl);
}

/* ---------- Public render ---------- */
export function renderGame(state){
  const txt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };

  renderHearts('#hud-you-hearts', state?.hp ?? 0, 5);
  renderHearts('#hud-ai-hearts',  state?.ai?.hp ?? 0, 5);

  // Dock counts (if present)
  txt('#count-deck',    Array.isArray(state?.deck) ? state.deck.length : 0);
  txt('#count-discard', Array.isArray(state?.disc) ? state.disc.length : 0);
  txt('#count-ae',      state?.ae ?? 0);

  renderSlots($('#aiBoard'),   state?.ai?.slots ?? [], AI_SLOT_COUNT);
  renderFlow ($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots   ?? [], PLAYER_SLOT_COUNT);

  renderHand($('#ribbon'), state);
}

/* ---------- Init ---------- */
export function init(game){
  _gameRef = game;
  window.renderGame = renderGame;

  // End turn icon (if mounted)
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type:'END_TURN' }));

  renderGame(game.state);
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive:true });
  window.addEventListener('orientationchange', onResize, { passive:true });
}
