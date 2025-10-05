// =========================================================
// THE GREY — Drag & Drop (v2.3 "Arena feel")
// - No dampening; direct pointer movement
// - Subtle angle on drag, no "rubber band"
// - Prevents text selection while dragging
// - Writes data-drop-slot so UI honors exact slot placement
// - Typed targets (glyph vs spell); hover glow is crisp
// =========================================================

(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  let dragging = null;   // { node, type, startX, startY, dx, dy }
  let overSlot = null;

  function addTargetHighlights(cardType) {
    clearTargetHighlights();
    const cells = $$('#playerSlots .slotCell');
    cells.forEach((cell, i) => {
      const isGlyphCell  = cell.classList.contains('glyph');
      const isGlyphCard  = cardType === 'Glyph';
      const isInstant    = cardType === 'Instant';
      const acceptGlyph  = isGlyphCard && isGlyphCell;
      const acceptSpell  = !isGlyphCard && !isGlyphCell && !isInstant;

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

    // avoid text selection & allow trackpad/touch fine control
    e.preventDefault();
    document.body.classList.add('noselect');
    card.style.touchAction = 'none';

    const type = card.dataset.ctype || '';

    // Instants pulse (click plays), no drag targets
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
      dx: 0, dy: 0
    };

    card.classList.add('dragging');
    card.style.willChange = 'transform';
    addTargetHighlights(type);
    document.body.style.cursor = 'grabbing';

    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp, { once: true });
  }

  function pointerMove(e) {
    if (!dragging) return;
    e.preventDefault(); // kill text selection and inertial scroll while dragging
    const { node, startX, startY } = dragging;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);

    dragging.dx = x - startX;
    dragging.dy = y - startY;

    // gentle angle based on horizontal movement only
    const ang = Math.max(-10, Math.min(10, dragging.dx * 0.06));
    node.style.transform = `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${ang}deg)`;

    // hover slot detection (spell or glyph cells only)
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
    const { node } = dragging;

    window.removeEventListener('pointermove', pointerMove);
    document.body.classList.remove('noselect');
    document.body.style.cursor = '';

    // If released on a valid slot, stamp the slotIndex so UI click uses it
    let played = false;
    if (overSlot && overSlot.classList.contains('drop-ok')) {
      const idx = overSlot.dataset.slotIndex;
      if (idx != null) node.dataset.dropSlot = String(idx);
      node.click(); // UI will read dataset.dropSlot and clear it
      played = true;
    }

    node.classList.remove('dragging');
    node.style.transform = '';
    node.style.willChange = '';

    clearTargetHighlights();
    if (overSlot) overSlot.classList.remove('drop-hover');
    overSlot = null;
    dragging = null;

    // Small bounce back if not played
    if (!played) {
      node.classList.add('drag-bounce');
      setTimeout(() => node.classList.remove('drag-bounce'), 150);
    }
  }

  function attach() {
    const ribbon = document.querySelector('.ribbon');
    if (!ribbon) return;
    ribbon.addEventListener('pointerdown', pointerDown, { passive: false });
    console.log('[Drag] initialized (v2.3): Arena-like drag, typed targets, data-drop-slot');
  }

  window.DragCards = {
    refresh: () => { /* delegated listener; nothing to rebind */ }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
