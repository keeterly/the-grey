// =========================================================
// THE GREY — Drag & Drop (classic)
// • Highlights valid targets by card type (Spell vs Glyph)
// • Instants: self pulse (channel via click)
// • Robust ghost math (no off-screen jumps)
// =========================================================
(function () {
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  let dragging = null; // { node, type, startX, startY, dx, dy }
  let overSlot = null;

  function addTargetHighlights(cardType) {
    clearTargetHighlights();
    if (cardType === 'Instant') return;
    $$('#playerSlots .slotCell').forEach((cell) => {
      const isGlyph = cell.classList.contains('glyph');
      const acceptGlyph = (cardType === 'Glyph') && isGlyph;
      const acceptSpell = (cardType !== 'Glyph') && !isGlyph;
      cell.classList.add(acceptGlyph || acceptSpell ? 'drop-ok' : 'drop-no');
    });
  }
  function clearTargetHighlights() {
    $$('.slotCell').forEach((c) => c.classList.remove('drop-ok','drop-no','drop-hover'));
  }

  function pointerDown(e) {
    const card = e.target.closest('.handCard');
    if (!card) return;
    const type = card.dataset.ctype || '';

    if (type === 'Instant') {
      card.classList.add('instantPulse');
      setTimeout(() => card.classList.remove('instantPulse'), 500);
      return;
    }

    const pt = (e.touches ? e.touches[0] : e);
    dragging = { node: card, type, startX: pt.clientX, startY: pt.clientY, dx:0, dy:0 };
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
    dragging.node.style.transform = `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${dragging.dx*0.04}deg)`;

    const el = document.elementFromPoint(x, y);
    const slot = el && el.closest ? el.closest('#playerSlots .slotCell') : null;
    if (slot !== overSlot) {
      if (overSlot) overSlot.classList.remove('drop-hover');
      overSlot = slot;
      if (overSlot && overSlot.classList.contains('drop-ok')) overSlot.classList.add('drop-hover');
    }
  }

  function pointerUp() {
    if (!dragging) return;
    const { node } = dragging;
    window.removeEventListener('pointermove', pointerMove);

    let played = false;
    if (overSlot && overSlot.classList.contains('drop-ok')) {
      node.click();  // hand click triggers PLAY/SET in UI
      played = true;
    }

    node.classList.remove('dragging');
    node.style.transform = '';
    clearTargetHighlights();
    overSlot = null; dragging = null;

    if (!played) {
      node.classList.add('drag-bounce');
      setTimeout(() => node.classList.remove('drag-bounce'), 160);
    }
  }

  function attach() {
    const ribbon = document.querySelector('.ribbon');
    if (!ribbon) return;
    ribbon.addEventListener('pointerdown', pointerDown, { passive: true });
    console.log('[Drag] initialized (classic): typed drop-target highlights');
  }

  window.DragCards = { refresh: () => { /* delegated listener */ } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
