// boot-debug.js — disabled for production
console.log('[BOOT] Debug check disabled.');

// === REAL-CARD POINTER DRAG (snappy + robust) ===============================
(() => {
  const DRAG_THRESHOLD = 6;        // px before we "lift"
  const DAMP = 0.35;               // responsiveness (0.25-0.38 feels good)
  const MAX_STEP = 48;             // clamp per-frame px to avoid rubberband
  let raf;

  // one drag layer for all drags
  const dragLayer = document.querySelector('.drag-layer') || (() => {
    const d = document.createElement('div');
    d.className = 'drag-layer';
    document.body.appendChild(d);
    return d;
  })();

  let st = null;

  const tidyUp = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp, { capture: false });
    window.removeEventListener('pointercancel', onUp, { capture: false });
    window.removeEventListener('blur', onUp, { capture: false });
  };

  function onDown(e) {
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    e.preventDefault();
    try { card.setPointerCapture(e.pointerId); } catch {}

    const r = card.getBoundingClientRect();

    st = {
      id: Math.random().toString(36).slice(2),
      pid: e.pointerId,
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
      isInstant: card.classList.contains('is-instant'),
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp); // safety: tab switch etc.
  }

  function lift() {
    if (!st || st.lifted) return;
    const { card, originParent, originNext } = st;

    // placeholder to keep fan spacing stable
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // move REAL node to drag layer
    dragLayer.appendChild(card);
    card.classList.add('is-dragging');
    if (st.isInstant) card.classList.add('pulsing');

    // initialize position so it never jumps to (0,0)
    card.style.setProperty('--drag-x', st.curX + 'px');
    card.style.setProperty('--drag-y', st.curY + 'px');

    st.lifted = true;
    smoothFollow();
  }

  function smoothFollow() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!st) return;

      // clamp the delta so it stays responsive but controlled
      const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, st.targetX - st.curX));
      const dy = Math.max(-MAX_STEP, Math.min(MAX_STEP, st.targetY - st.curY));

      st.curX += dx * DAMP;
      st.curY += dy * DAMP;

      st.card.style.setProperty('--drag-x', st.curX + 'px');
      st.card.style.setProperty('--drag-y', st.curY + 'px');

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
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
    if (!st) { tidyUp(); return; }

    // release capture if we had it
    try { st.card.releasePointerCapture?.(st.pid); } catch {}

    cancelAnimationFrame(raf);

    const { card, originParent, originNext, placeholder, isInstant } = st;

    if (st.lifted) {
      // --- accurate hit test: hide card for a moment to see what's below it ---
      const prevVis = card.style.visibility;
      card.style.visibility = 'hidden';
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card.style.visibility = prevVis;

      const dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;

      if (dropSlot) {
        // optional: snap visually to slot (quick)
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // notify your game logic
        try {
          game?.dispatch?.({
            type: 'DROP_CARD',
            cardId: card.dataset.id,           // ensure card nodes have data-id
            slot: dropSlot.dataset.slot        // ensure slot cells have data-slot
          });
        } catch (err) {
          console.warn('[The Grey] DROP_CARD dispatch failed:', err);
        }
      }

      // return card node to hand DOM either way (state will re-render appropriately)
      if (originNext) originParent.insertBefore(card, originNext);
      else originParent.appendChild(card);
      if (placeholder) placeholder.remove();
      card.classList.remove('is-dragging');

      const previewOpen = !!document.querySelector('.preview-overlay');
      if (!previewOpen && isInstant) card.classList.remove('pulsing');
    }

    st = null;
    tidyUp();
  }

  // Kill native ghost drag
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // Delegate from ribbon
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();



