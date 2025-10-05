// =========================================================
// THE GREY — Drag & Drop (v2.2, classic script)
// • Highlights valid targets by card type (Spell vs Glyph)
// • Instants: self pulse (channel via click)
// • Robust ghost math (no off-screen jumps)
// • No module exports (safe for <script> classic mode)
// =========================================================

(function () {
  const $  = (s) => (s[0] === '#'
    ? document.getElementById(s.slice(1))
    : document.querySelector(s));
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let dragging = null;   // { node, type, startX, startY, dx, dy }
  let overSlot = null;

  // ---------- Target highlights ----------
  function addTargetHighlights(cardType) {
    clearTargetHighlights();
    if (cardType === 'Instant') return; // no drop targets for Instants

    const cells = $$('#playerSlots .slotCell');
    cells.forEach((cell) => {
      const isGlyph = cell.classList.contains('glyph');
      const acceptGlyph = (cardType === 'Glyph') && isGlyph;
      const acceptSpell = (cardType !== 'Glyph') && !isGlyph;
      if (acceptGlyph || acceptSpell) cell.classList.add('drop-ok');
      else                            cell.classList.add('drop-no');
    });
  }

  function clearTargetHighlights() {
    $$('.slotCell').forEach((c) =>
      c.classList.remove('drop-ok', 'drop-no', 'drop-hover')
    );
  }

  // ---------- Pointer handlers ----------
  function pointerDown(e) {
    // Only start from hand cards
    const card = e.target.closest('.handCard');
    if (!card) return;

    // Don’t let text selection start
    e.preventDefault();

    const type = card.dataset.ctype || '';

    // Instants: quick visual pulse; actual play handled by click
    if (type === 'Instant') {
      card.classList.add('instantPulse');
      setTimeout(() => card.classList.remove('instantPulse'), 500);
      return;
    }

    dragging = {
      node: card,
      type,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
    };

    card.classList.add('dragging');
    card.style.willChange = 'transform';
    addTargetHighlights(type);

    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('pointerup', pointerUp, { once: true });
    window.addEventListener('pointercancel', pointerCancel, { once: true });
  }

  function pointerMove(e) {
    if (!dragging) return;

    // deltas
    dragging.dx = e.clientX - dragging.startX;
    dragging.dy = e.clientY - dragging.startY;

    // transform with a tiny rotation for feel
    dragging.node.style.transform =
      `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${dragging.dx * 0.04}deg)`;

    // Hit-test for slot under pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slot = el && el.closest ? el.closest('#playerSlots .slotCell') : null;

    if (slot !== overSlot) {
      if (overSlot) overSlot.classList.remove('drop-hover');
      overSlot = slot;
      if (overSlot && overSlot.classList.contains('drop-ok')) {
        overSlot.classList.add('drop-hover');
      }
    }
  }

  function endDrag(cleanOnly) {
    if (!dragging) return;
    const { node } = dragging;

    window.removeEventListener('pointermove', pointerMove);
    // pointerup / pointercancel were registered with { once: true }

    node.classList.remove('dragging');
    node.style.transform = '';
    node.style.willChange = '';

    clearTargetHighlights();
    overSlot = null;
    dragging = null;

    if (!cleanOnly) {
      node.classList.add('drag-bounce');
      setTimeout(() => node.classList.remove('drag-bounce'), 160);
    }
  }

  function pointerUp() {
    if (!dragging) return;
    const { node } = dragging;

    let played = false;
    if (overSlot && overSlot.classList.contains('drop-ok')) {
      // Hand card click already wires to PLAY_FROM_HAND (with chosen slot
      // when drag target is highlighted). Simpler than duplicating logic here.
      node.click();
      played = true;
    }

    endDrag(/*cleanOnly*/ played);
  }

  function pointerCancel() {
    endDrag(/*cleanOnly*/ false);
  }

  // ---------- Attach ----------
  function attach() {
    const ribbon = document.querySelector('.ribbon');
    if (!ribbon) return;

    // Delegate from the ribbon so we don’t rebind after re-render
    ribbon.addEventListener('pointerdown', pointerDown, { passive: false });
    console.log('[Drag] initialized (v2.2): typed drop-target highlights, instant pulse');
  }

  // public API for UI to “refresh” after re-render (noop: delegated)
  window.DragCards = {
    refresh: () => {},
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
