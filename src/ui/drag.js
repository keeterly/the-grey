/* =========================================================
 * THE GREY — Drag & Drop (v2.3)
 * Classic global (no ESM). Exposes window.DragCards.
 *
 * Goals:
 *  - Natural “weight”: small lift + shadow while dragging
 *  - Tight rotation while moving (less wobble)
 *  - Crisp target highlighting (glyph vs spell)
 *  - Robust snap-back with CSS animation
 * =======================================================*/

(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // Live drag state
  let drag = null; // {el, type, startX, startY, dx, dy, startTransform}
  let over  = null;

  // ---- Highlight helpers ----------------------------------------------------
  function clearTargets() {
    $$('.slotCell').forEach(c => c.classList.remove('drop-ok', 'drop-no', 'drop-hover'));
  }
  function showTargets(cardType) {
    clearTargets();
    if (cardType === 'Instant') return; // no drop targets for instants
    const cells = $$('#playerSlots .slotCell');
    cells.forEach((cell) => {
      const isGlyph = cell.classList.contains('glyph');
      const ok = (cardType === 'Glyph') ? isGlyph : !isGlyph;
      cell.classList.add(ok ? 'drop-ok' : 'drop-no');
    });
  }

  // ---- Pointer handlers -----------------------------------------------------
  function onPointerDown(e) {
    const card = e.target.closest('.handCard');
    if (!card) return;

    const type = card.dataset.ctype || '';

    // Instants: self pulse instead of drag
    if (type === 'Instant') {
      card.classList.add('instantPulse');
      setTimeout(() => card.classList.remove('instantPulse'), 420);
      return;
    }

    const p = (e.touches ? e.touches[0] : e);

    drag = {
      el: card,
      type,
      startX: p.clientX,
      startY: p.clientY,
      dx: 0, dy: 0,
      startTransform: card.style.transform || ''
    };

    // Lift feel
    card.classList.add('dragging');
    card.style.willChange = 'transform';
    card.style.transition = 'transform 0s, box-shadow 0s';
    card.style.boxShadow = '0 10px 30px rgba(0,0,0,.16)';
    card.style.transformOrigin = '50% 85%';

    showTargets(type);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!drag) return;
    const x = e.clientX, y = e.clientY;
    drag.dx = x - drag.startX;
    drag.dy = y - drag.startY;

    // Subtle rotation and lift
    const rot = drag.dx * 0.02;          // degrees — very small
    const tx  = drag.dx;
    const ty  = drag.dy * 0.9 - 6;       // slight lift

    drag.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg)`;

    // Hover feedback
    const el = document.elementFromPoint(x, y);
    const slot = el && el.closest ? el.closest('#playerSlots .slotCell') : null;

    if (over !== slot) {
      if (over) over.classList.remove('drop-hover');
      over = slot;
      if (over && over.classList.contains('drop-ok')) over.classList.add('drop-hover');
    }
  }

  function onPointerUp() {
    if (!drag) return;

    const el = drag.el;

    window.removeEventListener('pointermove', onPointerMove);

    let played = false;
    if (over && over.classList.contains('drop-ok')) {
      // Delegate to click: UI already handles PLAY_FROM_HAND w/ slot fallback.
      el.click();
      played = true;
    }

    // Clear hover/targets
    if (over) over.classList.remove('drop-hover');
    clearTargets();

    // Snap or keep (if played)
    if (!played) {
      // CSS-powered snap-back for smoothness
      el.classList.add('drag-snap');
      el.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 140ms ease';
      el.style.transform = drag.startTransform || 'translate3d(0,0,0)';
      setTimeout(() => {
        el.classList.remove('drag-snap');
        cleanup(el);
      }, 190);
    } else {
      cleanup(el);
    }

    drag = null;
    over  = null;
  }

  function cleanup(el) {
    el.classList.remove('dragging');
    el.style.willChange = '';
    el.style.boxShadow = '';
    el.style.transition = '';
    // leave transform as-is; UI re-render will overwrite
  }

  // ---- Attach ---------------------------------------------------------------
  function attach() {
    const ribbon = $('.ribbon');
    if (!ribbon) return;
    ribbon.addEventListener('pointerdown', onPointerDown, { passive: true });
    console.log('[Drag] initialized (v2.3): natural lift, tight rotation, crisp targets');
  }

  // Public “refresh” (delegated listeners = nothing to redo, but keep API)
  window.DragCards = {
    refresh() { /* intentionally empty */ }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
