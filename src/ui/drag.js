// =========================================================
// THE GREY — Drag & Drop (v2.6)
// - No damping; 1:1 pointer movement
// - Disable text selection while dragging
// - Typed targets (glyph vs spell) w/ dataset slot indexes
// - Instants: draggable + continuous pulse while held
// - Press-hold preview (zoom) if you hold without moving
// =========================================================

(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  let dragging = null;   // { node, type, startX, startY, dx, dy, prevTransition, isInstant, pulseId, holdTimer, previewOn }
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

  function startContinuousPulse(node){
    stopContinuousPulse(node); // guard
    node.classList.add('instantPulse');
    const id = setInterval(() => {
      // re-trigger the CSS animation
      node.classList.remove('instantPulse');
      // allow style flush
      requestAnimationFrame(() => node.classList.add('instantPulse'));
    }, 600);
    return id;
  }
  function stopContinuousPulse(node){
    if (!dragging) return;
    if (dragging.pulseId) {
      clearInterval(dragging.pulseId);
      dragging.pulseId = null;
    }
    node.classList.remove('instantPulse');
  }

  function killHoldPreview(){
    if (!dragging) return;
    dragging.previewOn = false;
    if (dragging.holdTimer){ clearTimeout(dragging.holdTimer); dragging.holdTimer = null; }
    dragging.node.classList.remove('focusZoom');
  }

  function pointerDown(e) {
    const card = e.target.closest('.handCard');
    if (!card) return;

    e.preventDefault(); // block text selection / native drag
    document.body.classList.add('noselect');
    card.style.touchAction = 'none';

    const type = card.dataset.ctype || '';
    const isInstant = type === 'Instant';

    const pt = (e.touches ? e.touches[0] : e);
    dragging = {
      node: card,
      type,
      isInstant,
      startX: pt.clientX,
      startY: pt.clientY,
      dx: 0, dy: 0,
      prevTransition: card.style.transition,
      pulseId: null,
      holdTimer: null,
      previewOn: false
    };

    // No transitions while dragging
    card.style.transition = 'none';
    card.classList.add('dragging');
    card.style.willChange = 'transform';
    document.body.style.cursor = 'grabbing';

    // Typed target highlights for non-instants
    if (!isInstant) addTargetHighlights(type);

    // Instants: continuous pulse while held (even though not droppable)
    if (isInstant) dragging.pulseId = startContinuousPulse(card);

    // Press-and-hold preview (zoom) if user keeps finger/mouse still
    dragging.holdTimer = setTimeout(() => {
      // give a tiny tolerance; if still near origin, zoom
      if (Math.abs(dragging.dx) < 6 && Math.abs(dragging.dy) < 6) {
        dragging.previewOn = true;
        card.classList.add('focusZoom');
      }
    }, 220);

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

    // cancel the preview if user started moving
    if (!dragging.previewOn && (Math.abs(dragging.dx) > 6 || Math.abs(dragging.dy) > 6)) {
      if (dragging.holdTimer){ clearTimeout(dragging.holdTimer); dragging.holdTimer = null; }
    }
    if (dragging.previewOn){
      // stop preview as soon as we start really dragging
      if (Math.hypot(dragging.dx, dragging.dy) > 10) killHoldPreview();
    }

    // gentle angle only from X; NO damping
    const ang = Math.max(-9, Math.min(9, dragging.dx * 0.06));
    node.style.transform = `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${ang}deg)`;

    // Hover slot tracking (spells/glyphs only)
    if (!dragging.isInstant) {
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
  }

  function pointerUp() {
    if (!dragging) return;
    const { node, prevTransition, isInstant } = dragging;

    window.removeEventListener('pointermove', pointerMove);

    // cleanup preview/pulse/selection
    killHoldPreview();
    stopContinuousPulse(node);
    document.body.classList.remove('noselect');

    // restore transitions and cursor
    node.style.transition = prevTransition || '';
    document.body.style.cursor = '';

    // play if valid slot (not for instants)
    let played = false;
    if (!isInstant && overSlot && overSlot.classList.contains('drop-ok')) {
      const idx = overSlot.dataset.slotIndex;
      if (idx != null) node.dataset.dropSlot = String(idx);
      node.click();  // UI handler reads data-drop-slot and dispatches
      played = true;
    } else {
      // Instants or invalid drop: just click to perform default behavior (channel)
      node.click();
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
    console.log('[Drag] v2.6 — direct pointer, instant drag+pulse, hold-to-preview');
  }

  window.DragCards = { refresh: () => {} };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
