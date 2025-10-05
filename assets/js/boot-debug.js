// === REAL-CARD DRAG — press matches hover, snap-back if no drop, preview-safe ===
function getTranslateXY(el){
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return {tx:0, ty:0};
  const m = new DOMMatrixReadOnly(t);
  return { tx: m.m41, ty: m.m42 };
}

(() => {
  const DRAG_THRESHOLD = 6;
  const DAMP = 0.36;
  const MAX_STEP = 42;
  let raf;

  // If your preview uses a different root, add it here
  const PREVIEW_SELECTORS = '.preview-overlay, .preview-card';

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
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
  };

  function onDown(e){
    // If any preview UI exists, ignore drag completely
    if (document.querySelector(PREVIEW_SELECTORS)) return;

    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    e.preventDefault();
    try { card.setPointerCapture(e.pointerId); } catch {}

    // Make press visually identical to hover (prevents the "lowering")
    card.classList.add('is-pressing');

    // Measure the CURRENT visual position (press pose already applied)
    const rect = card.getBoundingClientRect();
    const { tx, ty } = getTranslateXY(card);

    // Compute raw page coords so moving to drag layer doesn't shift
    const rawLeft = rect.left + window.scrollX - tx;
    const rawTop  = rect.top  + window.scrollY - ty;

    st = {
      pid: e.pointerId,
      card,
      startX: e.pageX,
      startY: e.pageY,
      offsetX: e.pageX - rawLeft,
      offsetY: e.pageY - rawTop,
      curX: rawLeft,
      curY: rawTop,
      targetX: rawLeft,
      targetY: rawTop,
      lifted: false,
      originParent: card.parentNode,
      originNext: card.nextSibling,
      placeholder: null,
      isInstant: card.classList.contains('is-instant'),
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  }

  function lift(){
    if (!st || st.lifted) return;
    const { card, originParent, originNext } = st;

    // Keep hand spacing with a placeholder
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // IMPORTANT ORDER: set coords → switch classes → move node
    card.style.setProperty('--drag-x', st.curX + 'px');
    card.style.setProperty('--drag-y', st.curY + 'px');

    card.classList.remove('is-pressing');
    card.classList.add('is-dragging');
    if (st.isInstant) card.classList.add('pulsing');

    dragLayer.appendChild(card);

    st.lifted = true;
    smoothFollow();
  }

  function smoothFollow(){
    cancelAnimationFrame(raf);
    const step = () => {
      if (!st) return;

      const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, st.targetX - st.curX));
      const dy = Math.max(-MAX_STEP, Math.min(MAX_STEP, st.targetY - st.curY));

      st.curX += dx * 0.00001 + dx * DAMP; // tiny bias avoids stall on exact hit
      st.curY += dy * 0.00001 + dy * DAMP;

      st.card.style.setProperty('--drag-x', st.curX + 'px');
      st.card.style.setProperty('--drag-y', st.curY + 'px');

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function onMove(e){
    // If a preview just opened between down/move, abort drag cleanly
    if (document.querySelector(PREVIEW_SELECTORS)) { cancelDrag(); return; }

    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    // Keep the exact click point under the cursor
    st.targetX = e.clientX - st.offsetX;
    st.targetY = e.clientY - st.offsetY;
  }

  function snapBack(){
    const { card, originParent, originNext, placeholder, isInstant } = st;
    // Return node to hand immediately (no sticking in drag layer)
    if (originNext) originParent.insertBefore(card, originNext);
    else originParent.appendChild(card);
    placeholder && placeholder.remove();
    card.classList.remove('is-dragging', 'is-pressing');
    if (isInstant) card.classList.remove('pulsing');
  }

  function cancelDrag(){
    if (!st) return;
    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    cancelAnimationFrame(raf);

    if (st.lifted) snapBack();
    else st.card.classList.remove('is-pressing');

    st = null;
    tidyUp();
  }

  function onUp(e){
    if (!st) { tidyUp(); return; }

    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    cancelAnimationFrame(raf);

    const { card } = st;

    if (st.lifted){
      // Accurate hit test: hide the dragged card briefly
      const prevVis = card.style.visibility;
      card.style.visibility = 'hidden';
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card.style.visibility = prevVis;

      const dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;

      if (dropSlot){
        // (Optional) quick visual snap
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // Tell the game (ensure data-* exist)
        try {
          game?.dispatch?.({
            type: 'DROP_CARD',
            cardId: card.dataset.id,
            slot: dropSlot.dataset.slot
          });
        } catch (err) {
          console.warn('[The Grey] DROP_CARD dispatch failed:', err);
        }
      }

      // Always snap back to the hand DOM (state will re-render)
      snapBack();
    } else {
      // Never lifted → plain press
      st.card.classList.remove('is-pressing');
    }

    st = null;
    tidyUp();
  }

  // Block native ghost image
  document.addEventListener('dragstart', (e) => e.preventDefault());

  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();
