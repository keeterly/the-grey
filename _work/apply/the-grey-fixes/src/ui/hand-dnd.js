
/**
 * The Grey — Hand drag & hold-to-preview
 * Usage:
 *   import { initHandDnD } from './src/ui/hand-dnd.js';
 *   initHandDnD({ handSelector: '#hand,[data-hand]', cardSelector: '.card,[data-card]', slotSelector: '.slot,[data-slot]' });
 */
export function initHandDnD(opts = {}) {
  const hand = opts.hand || document.querySelector(opts.handSelector || '#hand,[data-hand]');
  if (!hand) return console.warn('[tg] hand container not found');
  const cardSel = opts.cardSelector || '.card,[data-card]';
  const slotSel = opts.slotSelector || '.slot,[data-slot]';
  const holdMs = opts.holdMs ?? 450;
  const moveCancelPx = opts.moveCancelPx ?? 8;

  ensurePreviewLayer();
  const getCards = () => Array.from(hand.querySelectorAll(cardSel));
  getCards().forEach(attachCard);

  // If the hand updates dynamically, re-bind.
  const mo = new MutationObserver(() => getCards().forEach(attachCard));
  mo.observe(hand, { childList: true, subtree: true });

  function attachCard(card) {
    if (card.__tgBound) return;
    card.__tgBound = true;
    card.classList.add('tg-card', 'tg-card-fan');
    card.addEventListener('pointerdown', (e) => onDown(e, card));
  }

  function onDown(e, card) {
    if (e.button && e.button !== 0) return; // only main button
    card.setPointerCapture?.(e.pointerId);

    const start = { x: e.clientX, y: e.clientY };
    let holdTimer = null, previewing = false, dragging = false, ghost = null, ox = 0, oy = 0;

    const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };

    const openPreview = () => {
      if (dragging || previewing) return;
      previewing = true;
      const layer = document.getElementById('tgPreviewLayer');
      const clone = card.cloneNode(true);
      clone.classList.add('tg-preview-card');
      layer.innerHTML = '';
      layer.appendChild(clone);
      layer.classList.add('active');
      card.classList.add('tg-held');
      if (isInstant(card)) card.classList.add('tg-instant','tg-held');
    };

    const closePreview = () => {
      if (!previewing) return;
      previewing = false;
      const layer = document.getElementById('tgPreviewLayer');
      layer.classList.remove('active');
      layer.innerHTML = '';
      card.classList.remove('tg-held','tg-instant');
    };

    const startDrag = () => {
      if (dragging) return;
      dragging = true;
      cancelHold();
      closePreview();

      // compute pointer offset INSIDE the card to avoid “top-left jump”
      const r = card.getBoundingClientRect();
      ox = start.x - r.left;
      oy = start.y - r.top;

      ghost = card.cloneNode(true);
      ghost.classList.add('tg-ghost');
      if (isInstant(card)) ghost.classList.add('tg-instant','tg-held');
      document.body.appendChild(ghost);
      moveGhost(start.x, start.y);
    };

    const moveGhost = (x, y) => {
      if (!ghost) return;
      ghost.style.transform = `translate3d(${(x - ox)}px, ${(y - oy)}px, 0)`;
    };

    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) > moveCancelPx) startDrag();
      if (dragging) {
        moveGhost(ev.clientX, ev.clientY);
        highlightSlotUnder(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev) => {
      cancelHold();
      card.releasePointerCapture?.(e.pointerId);
      if (dragging) {
        const dropped = dropOnSlot(ev.clientX, ev.clientY, card);
        if (!dropped) {/* visual snap-back only; engine state unchanged */}
      } else if (previewing) {
        closePreview();
      }
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      clearHighlights();
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      card.classList.remove('tg-held','tg-instant');
    };

    // schedule press-and-hold to preview
    holdTimer = setTimeout(openPreview, holdMs);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  }

  function isInstant(card) {
    // Detect via class/attribute/text (tweak to your schema)
    if (card.matches('.instant,[data-type="Instant"],[data-instant="true"]')) return true;
    const t = (card.getAttribute('data-type') || card.textContent || '').toLowerCase();
    return t.includes('instant');
  }

  function highlightSlotUnder(x, y) {
    clearHighlights();
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const slot = el.closest?.('[data-slot], .slot');
    if (slot) slot.classList.add('tg-slot-hover');
  }

  function clearHighlights() {
    document.querySelectorAll('.tg-slot-hover').forEach(el => el.classList.remove('tg-slot-hover'));
  }

  function dropOnSlot(x, y, card) {
    const els = document.elementsFromPoint(x, y);
    const slot = els.map(el => el.closest?.('[data-slot], .slot')).find(Boolean);
    if (!slot) return false;
    slot.classList.remove('tg-slot-hover');

    // Hook to your engine here if needed:
    // if (typeof opts.onDrop === 'function') opts.onDrop({ card, slot });

    return true;
  }

  function ensurePreviewLayer() {
    if (!document.getElementById('tgPreviewLayer')) {
      const div = document.createElement('div');
      div.id = 'tgPreviewLayer';
      document.body.appendChild(div);
    }
  }
}

// Optional global for quick manual init in console
if (typeof window !== 'undefined') window.__tgInitHand = (cfg)=> initHandDnD(cfg);
