// /src/ui/ui.js — unified UI and drag rendering (clean build, 2025 edition)

import { el, cardEl } from './dom.js'; // assumes you have helpers, adjust import if needed

let _gameRef = null;

// --- Core entry ---
export function init(game) {
  _gameRef = game;
  renderGame(game.state);

  // listen for state updates from index.js
  document.addEventListener('game:state', (ev) => {
    const { state } = ev.detail;
    renderGame(state);
  });
}

// --- Main render ---
export function renderGame(state) {
  if (!state) return;

  const aiBoard = document.getElementById('aiBoard');
  const yourBoard = document.getElementById('yourBoard');
  const flowRow = document.getElementById('aetherflow');

  renderSlots(aiBoard, state.ai.slots, 3);
  renderSlots(yourBoard, state.slots, 3);
  renderFlow(flowRow, state.flowRow);

  renderHearts('you', state.hp);
  renderHearts('ai', state.ai.hp);

  renderHand(state.hand);
}

// --- Board / Slot rendering ---
function renderSlots(container, slots = [], slotCount = 3) {
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < slotCount; i++) {
    const wrap = el('div', 'boardSlot');
    wrap.dataset.slotIndex = String(i);

    const card = slots[i];
    if (card) {
      wrap.appendChild(cardEl({
        title: card.name || 'Card',
        subtype: card.type || 'Spell',
      }));
    } else {
      wrap.appendChild(el('div', 'emptySlot')); // dashed outline
    }
    container.appendChild(wrap);
  }
}

// --- Aetherflow rendering ---
function renderFlow(container, cards = []) {
  if (!container) return;
  container.innerHTML = '';

  cards.forEach((card, idx) => {
    const wrap = el('div', 'boardSlot');
    if (card) {
      const c = cardEl({
        title: card.name || 'Card',
        subtype: card.type || 'Instant',
        footer: String(idx + 1),
      });
      wrap.appendChild(c);
    } else {
      wrap.appendChild(el('div', 'emptySlot'));
    }
    container.appendChild(wrap);
  });
}

// --- Hearts ---
function renderHearts(side, hp) {
  const target = side === 'you' ? document.querySelector('.pill-hp.you') : document.querySelector('.pill-hp.ai');
  if (!target) return;

  const hearts = target.querySelector('.hearts');
  if (!hearts) return;
  hearts.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const span = document.createElement('span');
    span.className = 'heart' + (i < hp ? '' : ' is-empty');
    span.textContent = '♥';
    hearts.appendChild(span);
  }
}

// --- Hand Rendering (Fan layout) ---
function renderHand(cards = []) {
  const ribbon = document.getElementById('ribbon');
  if (!ribbon) return;

  ribbon.innerHTML = '';

  const total = cards.length;
  const spread = 40;
  const mid = (total - 1) / 2;

  cards.forEach((card, i) => {
    const wrap = el('div', 'cardWrap');
    const cardNode = cardEl({
      title: card.name || 'Card',
      subtype: card.type || 'Spell',
    });
    wrap.appendChild(cardNode);

    const rot = (i - mid) * 7;
    const offset = Math.abs(i - mid) * -6;

    wrap.style.setProperty('--wrot', `${rot}deg`);
    wrap.style.setProperty('--wy', `${offset}px`);
    wrap.style.left = `${i * spread}px`;
    wrap.style.opacity = 1;

    enableMouseDnDOnCard(wrap, i);
    ribbon.appendChild(wrap);
  });

  ribbon.style.width = `${(total - 1) * spread + 180}px`;
  ribbon.style.left = `calc(50% - ${(total - 1) * spread + 180}px / 2)`;
}

// ============================================================================
// 🖱️ DRAG SYSTEM
// ============================================================================

// invisible drag image to remove "blip"
let _blankDragImage = null;
function getBlankDragImage() {
  if (_blankDragImage) return _blankDragImage;
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  _blankDragImage = c;
  return c;
}

function enableMouseDnDOnCard(wrap, handIndex) {
  wrap.draggable = true;

  wrap.addEventListener('dragstart', (e) => {
    wrap.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(handIndex));
    e.dataTransfer.effectAllowed = 'move';

    // prevent browser default ghost image
    e.dataTransfer.setDragImage(getBlankDragImage(), 0, 0);
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

function getBoardSlotsEl() {
  return document.getElementById('yourBoard');
}

function markSlots(state) {
  const board = getBoardSlotsEl();
  if (!board) return;
  const slots = board.querySelectorAll('.boardSlot');
  slots.forEach((s) => {
    s.classList.remove('drop-target', 'drop-accept');
    if (state === 'target') s.classList.add('drop-target');
    else if (state === 'accept') s.classList.add('drop-accept');
  });
}

function slotIndexFromPoint(x, y) {
  const slots = document.querySelectorAll('#yourBoard .boardSlot');
  for (let i = 0; i < slots.length; i++) {
    const rect = slots[i].getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return i;
    }
  }
  return -1;
}
