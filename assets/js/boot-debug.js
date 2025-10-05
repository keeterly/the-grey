// boot-debug.js — disabled for production
console.log('[BOOT] Debug check disabled.');

// ---- Real-element drag with a threshold (so long-press preview still works) ----
(() => {
  const DRAG_THRESHOLD = 6;
  const DAMP = 0.18;              // lower = smoother drag
  let animFrame;

  const dragLayer = document.querySelector('.drag-layer') || (() => {
    const d = document.createElement('div');
    d.className = 'drag-layer';
    document.body.appendChild(d);
    return d;
  })();

  let st = null;

  function onDown(e) {
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;
    e.preventDefault();
    const r = card.getBoundingClientRect();

    st = {
      card,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - (r.left + window.scrollX),
      offsetY: e.clientY - (r.top  + window.scrollY),
      curX: r.left + window.scrollX,
      curY: r.top  + window.scrollY,
      targetX: r.left + window.scrollX,
      targetY: r.top  + window.scrollY,
      lifted: false,
      originParent: card.parentNode,
      originNext: card.nextSibling,
      placeholder: null,
      isInstant: card.classList.contains('is-instant')
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  }

  function lift() {
    if (!st || st.lifted) return;
    const { card, originParent, originNext } = st;
    const rect = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = rect.width + 'px';
    ph.style.height = rect.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;

    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    dragLayer.appendChild(card);
    card.classList.add('is-dragging');
    if (st.isInstant) card.classList.add('pulsing');

    st.lifted = true;
    startSmoothFollow();
  }

  function startSmoothFollow() {
    cancelAnimationFrame(animFrame);
    const step = () => {
      if (!st) return;
      st.curX += (st.targetX - st.curX) * DAMP;
      st.curY += (st.targetY - st.curY) * DAMP;
      st.card.style.setProperty('--drag-x', st.curX + 'px');
      st.card.style.setProperty('--drag-y', st.curY + 'px');
      animFrame = requestAnimationFrame(step);
    };
    step();
  }

  function onMove(e) {
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;
    st.targetX = e.clientX - st.offsetX;
    st.targetY = e.clientY - st.offsetY;
  }

  function onUp(e) {
    cancelAnimationFrame(animFrame);
    window.removeEventListener('pointermove', onMove);
    if (!st) return;
    const { card, originParent, originNext, placeholder, isInstant } = st;

    if (st.lifted) {
      // --- DROP LOGIC / SLOT LOCK ---
      const dropSlot = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slotCell');
      if (dropSlot) {
        // Snap visually
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', r.left + window.scrollX + 'px');
        card.style.setProperty('--drag-y', r.top + window.scrollY + 'px');

        // Tell your game logic that the card was dropped
        game?.dispatch?.({ type:'DROP_CARD', cardId: card.dataset.id, slot: dropSlot.dataset.slot });
      }

      // Return to hand visually if not dropped
      if (originNext) originParent.insertBefore(card, originNext);
      else originParent.appendChild(card);
      if (placeholder) placeholder.remove();

      card.classList.remove('is-dragging');
      const previewOpen = !!document.querySelector('.preview-overlay');
      if (!previewOpen && isInstant) card.classList.remove('pulsing');
    }

    st = null;
  }

  // Prevent ghost drag image
  document.addEventListener('dragstart', (e) => e.preventDefault());
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();


