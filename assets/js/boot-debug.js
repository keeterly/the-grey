/* THE GREY — real-card drag (no long-press modal) */

function getTranslateXY(el){
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return {tx:0, ty:0};
  const m = new DOMMatrixReadOnly(t);
  return { tx: m.m41, ty: m.m42 };
}

(() => {
  const DRAG_THRESHOLD = 6;   // px to lift
  const DAMP = 0.36;          // 0.32–0.40 = responsive
  const MAX_STEP = 42;        // per-frame clamp
  let raf;

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
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    e.preventDefault();
    try { card.setPointerCapture(e.pointerId); } catch {}

    // Freeze transitions only; DO NOT force a new transform
    card.classList.add('grab-intent');

    // Measure current visual position (including hover/peek translate)
    const rect = card.getBoundingClientRect();
    const { tx, ty } = getTranslateXY(card);

    // Compute raw page coords so moving to the drag layer doesn't shift
    const rawLeft = rect.left + window.scrollX - tx;
    const rawTop  = rect.top  + window.scrollY - ty;

    st = {
      pid: e.pointerId,
      card,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rawLeft,
      offsetY: e.clientY - rawTop,
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

    // Keep ribbon spacing with a placeholder
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // ORDER: set vars → add class → move node (prevents 0,0 jump)
    card.style.setProperty('--drag-x', st.curX + 'px');
    card.style.setProperty('--drag-y', st.curY + 'px');

    card.classList.remove('grab-intent');
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

      st.curX += dx * 0.00001 + dx * DAMP;
      st.curY += dy * 0.00001 + dy * DAMP;

      st.card.style.setProperty('--drag-x', st.curX + 'px');
      st.card.style.setProperty('--drag-y', st.curY + 'px');

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function onMove(e){
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    // Keep the exact click point under the cursor
    st.targetX = e.clientX - st.offsetX;
    st.targetY = e.clientY - st.offsetY;
  }

  function onUp(e){
    if (!st) { tidyUp(); return; }

    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    cancelAnimationFrame(raf);

    const { card, originParent, originNext, placeholder, isInstant } = st;

    if (st.lifted){
      // Accurate hit test: hide dragged card briefly
      const prevVis = card.style.visibility;
      card.style.visibility = 'hidden';
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card.style.visibility = prevVis;

      const dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;

      if (dropSlot){
        // Optional snap feedback
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // Dispatch to your game logic (ensure these data-* exist)
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

      // Return node to hand (state will re-render)
      if (originNext) originParent.insertBefore(card, originNext);
      else originParent.appendChild(card);
      if (placeholder) placeholder.remove();

      card.classList.remove('is-dragging');
      if (isInstant) card.classList.remove('pulsing');
    } else {
      // never lifted: just clear the measurement flag
      st.card.classList.remove('grab-intent');
    }

    st = null;
    tidyUp();
  }

  // Kill native ghost drag images
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // Delegate from ribbon
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();
