// =========================================================
// THE GREY — DRAG MODULE
// Drag cards from hand → player slots. No engine imports.
// Exports: DragCards.init(game), DragCards.refresh()
// =========================================================

let _game = null;
let _mounted = false;

function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function addSlotHighlights() {
  $$('#playerSlots .slotCell').forEach((el) => {
    el.classList.add('dropReady');
  });
}
function removeSlotHighlights() {
  $$('#playerSlots .slotCell.dropReady').forEach((el) => {
    el.classList.remove('dropReady');
  });
  $$('#playerSlots .slotCell.dropTarget').forEach((el) => {
    el.classList.remove('dropTarget');
  });
}

function bindHandCard(cardEl) {
  if (!cardEl || cardEl.dataset.dragBound) return;
  cardEl.dataset.dragBound = '1';
  cardEl.setAttribute('draggable', 'true');

  cardEl.addEventListener('dragstart', (e) => {
    const idx = Number(cardEl.dataset.index ?? -1);
    e.dataTransfer.setData('text/plain', String(idx));
    cardEl.classList.add('dragging');
    addSlotHighlights();
  });

  cardEl.addEventListener('dragend', () => {
    cardEl.classList.remove('dragging');
    removeSlotHighlights();
  });
}

function bindSlotCell(slotEl) {
  if (!slotEl || slotEl.dataset.dragBound) return;
  slotEl.dataset.dragBound = '1';

  slotEl.addEventListener('dragover', (e) => {
    // Allow drop on any slot cell; rules will reject if invalid.
    e.preventDefault();
    slotEl.classList.add('dropTarget');
  });

  slotEl.addEventListener('dragleave', () => {
    slotEl.classList.remove('dropTarget');
  });

  slotEl.addEventListener('drop', (e) => {
    e.preventDefault();
    slotEl.classList.remove('dropTarget');
    const handIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isInteger(handIndex) || handIndex < 0) return;

    if (!_game || !_game.state) return;
    const card = _game.state.hand?.[handIndex];
    if (!card) return;

    const slotIndex = Number(slotEl.dataset.slot ?? -1);

    try {
      if (card.t === 'Instant') {
        // Instants channel on drop anywhere (simple rule)
        _game.dispatch({ type: 'CHANNEL_FROM_HAND', index: handIndex });
      } else {
        // Spells try to occupy the dropped slot
        _game.dispatch({ type: 'PLAY_FROM_HAND', index: handIndex, slot: slotIndex });
      }
    } catch (err) {
      console.error('[Drag] drop failed:', err);
    }
  });
}

function bindAll() {
  $$('.handCard').forEach(bindHandCard);
  $$('#playerSlots .slotCell').forEach(bindSlotCell);
}

function injectStylesOnce() {
  if (document.getElementById('__grey_drag_styles')) return;
  const style = document.createElement('style');
  style.id = '__grey_drag_styles';
  style.textContent = `
    .handCard.dragging { opacity: .75; }
    #playerSlots .slotCell.dropReady { outline: 2px dashed rgba(120,120,120,.25); outline-offset: -4px; }
    #playerSlots .slotCell.dropTarget { outline: 2px solid rgba(90,140,220,.6); outline-offset: -4px; box-shadow: 0 0 0 4px rgba(90,140,220,.08) inset; }
  `;
  document.head.appendChild(style);
}

export const DragCards = {
  init(game) {
    _game = game;
    injectStylesOnce();
    bindAll();
    _mounted = true;
    console.log('[Drag] initialized');
  },
  // Call after UI re-renders to (re)bind fresh nodes
  refresh() {
    if (!_mounted) return;
    bindAll();
  }
};

export default DragCards;
