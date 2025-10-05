// =========================================================
// THE GREY — Drag & Drop (v2.4 "Arena feel, no dampening")
// - Direct pointer movement (no easing/damping)
// - While dragging: disables transitions + text-selection
// - Precise slot drop via data-drop-slot
// - Typed targets (glyph vs spell); crisp hover
// =========================================================

(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  let dragging = null;   // { node, type, startX, startY, dx, dy, prevTransition }
  let overSlot = null;

  function addTargetHighlights(cardType) {
    clearTargetHighlights();
    const cells = $$('#playerSlots .slotCell');
    cells.forEach((cell) => {
      const isGlyphCell = cell.classList.contains('glyph');
      const isGlyphCard = cardType === 'Glyph';
      const isInstant   = cardType === 'Instant';
      const acceptGlyph = isGlyphCard && isGlyphCell;
      const acceptSpell = !isGlyphCard && !isInstant && !isGlyphCell;

      if (acceptGlyph || acceptSpell) cell.classList.add('drop-ok');
      else                            cell.classList.add('drop-no');
    });
  }
  function clearTargetHighlights() {
    $$('.slotCell').forEach((c) => c.classList.remove('drop-ok', 'drop-no', 'drop-hover'));
  }

  function pointerDown(e) {
    const card = e.target.closest('.handCard');
    if (!card) return;

    // kill text selection + gestures while dragging
    e.preventDefault();
    document.body.classList.add('noselect');
    card.style.touchAction = 'none';

    const type = card.dataset.ctype || '';

    // Instants: quick pulse, no drag
    if (type === 'Instant') {
      card.classList.add('instantPulse');
      setTimeout(() => card.classList.remove('instantPulse'), 420);
      document.body.classList.remove('noselect');
      return;
    }

    const pt = (e.touches ? e.touches[0] : e);
    dragging = {
      node: card,
      type,
      startX: pt.clientX,
      startY: pt.clientY,
      dx: 0, dy: 0,
      prevTransition: card.style.transition
    };

    // IMPORTANT: remove transitions so movement tracks pointer 1:1
    card.style.transition = 'none';
    card.classList.add('dragging');
    card.style.willChange = 'transform';
    addTargetHighlights(type);
    document.body.style.cursor = 'grabbing';

    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp, { once: true });
  }

  function pointerMove(e) {
    if (!dragging) return;
    e.preventDefault();

    const { node, startX, startY } = dragging;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);

    dragging.dx = x - startX;
    dragging.dy = y - startY;

    // gentle angle only from X; NO damping
    const ang = Math.max(-9, Math.min(9, dragging.dx * 0.06));
    node.style.transform = `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${ang}deg)`;

    const el = document.elementFromPoint(x, y);
    const slot = el && el.closest ? el.closest('#playerSlots .slotCell') : null;

    if (slot !== overSlot) {
      if (overSlot) overSlot.classList.remove('drop-hover');
      overSlot = slot;
      if (overSlot && overSlot.classList.contains('drop-ok')) {
        overSlot.classList.add('drop-hover');
      }
    }
  }

  function pointerUp() {
    if (!dragging) return;
    const { node, prevTransition } = dragging;

    window.removeEventListener('pointermove', pointerMove);

    // restore transitions and cursor
    node.style.transition = prevTransition || '';
    document.body.classList.remove('noselect');
    document.body.style.cursor = '';

    // play if valid
    let played = false;
    if (overSlot && overSlot.classList.contains('drop-ok')) {
      const idx = overSlot.dataset.slotIndex;
      if (idx != null) node.dataset.dropSlot = String(idx);
      node.click();
      played = true;
    }

    node.classList.remove('dragging');
    node.style.willChange = '';
    node.style.transform = '';

    clearTargetHighlights();
    if (overSlot) overSlot.classList.remove('drop-hover');
    overSlot = null;
    dragging = null;

    if (!played) {
      node.classList.add('drag-bounce');
      setTimeout(() => node.classList.remove('drag-bounce'), 140);
    }
  }

  function attach() {
    const ribbon = document.querySelector('.ribbon');
    if (!ribbon) return;
    ribbon.addEventListener('pointerdown', pointerDown, { passive: false });
    console.log('[Drag] v2.4 — direct pointer, no damping, slot-aware');
  }

  window.DragCards = { refresh: () => {} };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
