// =========================================================
// THE GREY — Drag & Drop (v2.1)
// • Highlights valid targets based on card type
// • Glyphs can only drop to glyph slot; spells to spell slots
// • Instants: card self-highlight; no drop targets
// • Robust ghost math to avoid off-screen jumps
// =========================================================

(function () {
  const $  = (s) => (s[0] === '#' ? document.getElementById(s.slice(1)) : document.querySelector(s));
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const R  = (el) => el.getBoundingClientRect();

  let dragging = null; // { node, type, startX, startY, dx, dy, originRect }
  let overSlot = null;

  function addTargetHighlights(cardType) {
    clearTargetHighlights();

    // Instants don't drop — highlight the card itself (handled via CSS on .instantPulse)
    if (cardType === 'Instant') return;

    // Player slots only (no dragging to AI board)
    const cells = $$('#playerSlots .slotCell');
    cells.forEach((cell) => {
      const isGlyphCell = cell.classList.contains('glyph');
      const isSpellCell = !isGlyphCell;

      if (cardType === 'Glyph' && isGlyphCell) {
        cell.classList.add('drop-ok');
      } else if ((cardType === 'Spell' || !cardType) && isSpellCell) {
        cell.classList.add('drop-ok');
      } else {
        cell.classList.add('drop-no');
      }
    });
  }

  function clearTargetHighlights() {
    $$('.slotCell').forEach((c) => c.classList.remove('drop-ok', 'drop-no', 'drop-hover'));
  }

  function pointerDown(e) {
    const card = e.target.closest('.handCard');
    if (!card) return;

    const type = card.dataset.ctype || ''; // 'Spell' | 'Glyph' | 'Instant'
    // Instants: pulse but still allow drag gesture to be ignored
    if (type === 'Instant') {
      card.classList.add('instantPulse');
      // If user actually clicks (not drag) the UI click will channel; we just return.
      setTimeout(() => card.classList.remove('instantPulse'), 500);
      return;
    }

    const r = R(card);
    dragging = {
      node: card,
      type,
      startX: (e.touches ? e.touches[0].clientX : e.clientX),
      startY: (e.touches ? e.touches[0].clientY : e.clientY),
      dx: 0, dy: 0,
      originRect: r
    };

    card.classList.add('dragging');
    card.style.willChange = 'transform';
    addTargetHighlights(type);

    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('pointerup', pointerUp, { once: true });
  }

  function pointerMove(e) {
    if (!dragging) return;
    const x = e.clientX, y = e.clientY;
    dragging.dx = x - dragging.startX;
    dragging.dy = y - dragging.startY;
    dragging.node.style.transform = `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${dragging.dx * 0.04}deg)`;

    // track slot under pointer for hover ring
    const el = document.elementFromPoint(x, y);
    const slot = el && el.closest ? el.closest('#playerSlots .slotCell') : null;
    if (slot !== overSlot) {
      if (overSlot) overSlot.classList.remove('drop-hover');
      overSlot = slot;
      if (overSlot && overSlot.classList.contains('drop-ok')) overSlot.classList.add('drop-hover');
    }
  }

  function pointerUp(e) {
    if (!dragging) return;
    const { node, type } = dragging;

    window.removeEventListener('pointermove', pointerMove);

    // if dropped on a valid slot, click it to trigger PLAY_FROM_HAND with the already-existing UI handler
    let played = false;
    if (overSlot && overSlot.classList.contains('drop-ok')) {
      // Trigger the card's normal click (UI layer turns it into PLAY_FROM_HAND)
      node.click();
      played = true;
    }

    // reset transform
    node.classList.remove('dragging');
    node.style.transform = '';

    clearTargetHighlights();
    overSlot = null;
    dragging = null;

    // If we didn't play, let the normal click still work (no-op here)
    if (!played) {
      // optional: snap bounce
      node.classList.add('drag-bounce');
      setTimeout(() => node.classList.remove('drag-bounce'), 160);
    }
  }

  function attach() {
    // delegate on the ribbon container
    const ribbon = document.querySelector('.ribbon');
    if (!ribbon) return;
    ribbon.addEventListener('pointerdown', pointerDown, { passive: true });
    console.log('[Drag] initialized (v2.1): typed drop-target highlights, instant pulse');
  }

  // Public hook for UI to re-wire after redraws
  window.DragCards = {
    refresh: () => {
      // nothing extra; we rely on delegated listener
    }
  };

  // Initial attach when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
