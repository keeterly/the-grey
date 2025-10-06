/* -----------------------------------------------------------------------
   THE GREY — Dev helpers: real-card drag (page-coords, snap/lerp),
   snap-back, preview guard, safe DOM return.
----------------------------------------------------------------------- */

function getTranslateXY(el){
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return {tx:0, ty:0};
  const m = new DOMMatrixReadOnly(t);
  return { tx: m.m41, ty: m.m42 };
}

// Safe return: reinsert the dragged node even if the hand re-rendered.
function safeReturn(card, originParent, originNext) {
  const ribbon = document.getElementById('ribbon');

  if (originParent && originParent.isConnected) {
    if (originNext && originNext.parentNode === originParent) {
      try { originParent.insertBefore(card, originNext); return; } catch {}
    }
    try { originParent.appendChild(card); return; } catch {}
  }
  if (ribbon) ribbon.appendChild(card);
}

// ---- Pointer-based REAL-CARD DRAG ------------------------------------
(() => {
  const DRAG_THRESHOLD = 6;    // px to lift
  const SMOOTH = 0.14;         // minimal dampening (lower = snappier)
  const SNAP_DIST = 24;        // snap to cursor when farther than this
  let raf;

  // Treat these as “preview UI present” (drag must cancel)
  const PREVIEW_SELECTORS = '.preview-overlay, .preview-card';

  // One drag layer host
  const dragLayer = document.querySelector('.drag-layer') || (() => {
    const d = document.createElement('div');
    d.className = 'drag-layer';
    document.body.appendChild(d);
    return d;
  })();

  let st = null;

  const isPreviewOpen = () => !!document.querySelector(PREVIEW_SELECTORS);

  const tidyUp = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
  };

  function cancelDragNow() {
    if (!st) return;
    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    if (st.lifted) snapBack(); else st.card.classList.remove('is-pressing','grab-intent');
    st = null;
    tidyUp();
  }

  function onDown(e){
    if (isPreviewOpen()) return;            // don’t start while preview is up
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    e.preventDefault();
    try { card.setPointerCapture(e.pointerId); } catch {}

    // Press pose should match hover (CSS handles visuals)
    card.classList.add('is-pressing');
    card.classList.add('grab-intent');      // freeze transitions while measuring

    // Measure current visual position (press already applied)
    const rect = card.getBoundingClientRect();
    const { tx, ty } = getTranslateXY(card);

    // Compute raw page coords so moving to drag layer doesn’t shift
    const rawLeft = rect.left + window.scrollX - tx;
    const rawTop  = rect.top  + window.scrollY - ty;

    st = {
      pid: e.pointerId,
      card,
      // Use PAGE coords (stable with scroll)
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

    // ORDER: set coords → switch classes → move node (prevents 0,0 jump)
    card.style.setProperty('--drag-x', st.curX + 'px');
    card.style.setProperty('--drag-y', st.curY + 'px');

    card.classList.remove('grab-intent');
    card.classList.remove('is-pressing');
    card.classList.add('is-dragging');
    if (st.isInstant) card.classList.add('pulsing');

    dragLayer.appendChild(card);

    st.lifted = true;
    smoothFollow();
  }

  function smoothFollow(){
    cancelAnimationFrame(raf);

    const toHalf = v => Math.round(v * 2) / 2; // stable subpixel grid

    const step = () => {
      if (!st) return;

      const dx = st.targetX - st.curX;
      const dy = st.targetY - st.curY;
      const dist = Math.hypot(dx, dy);

      if (dist > SNAP_DIST) {
        // Fast move: snap to the cursor to avoid wobble
        st.curX = st.targetX;
        st.curY = st.targetY;
      } else {
        // Minimal smoothing near the cursor
        st.curX += dx * SMOOTH;
        st.curY += dy * SMOOTH;
      }

      st.card.style.setProperty('--drag-x', toHalf(st.curX) + 'px');
      st.card.style.setProperty('--drag-y', toHalf(st.curY) + 'px');

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function onMove(e){
    if (isPreviewOpen()) { cancelDragNow(); return; }
    if (!st) return;

    const dx = e.pageX - st.startX;
    const dy = e.pageY - st.startY;

    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    // Keep the exact click point under the cursor (page coords)
    st.targetX = e.pageX - st.offsetX;
    st.targetY = e.pageY - st.offsetY;
  }

  function snapBack(){
    const { card, originParent, originNext, placeholder, isInstant } = st;
    safeReturn(card, originParent, originNext);
    if (placeholder && placeholder.isConnected) placeholder.remove();
    card.classList.remove('is-dragging','is-pressing','grab-intent','pulsing');
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

      // Only accept PLAYER slots (ignore AI board)
      let dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
      if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null;

      if (dropSlot){
        // Optional instant visual snap to the slot
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // Notify your game logic (ensure data-* exist)
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

      // Always snap the DOM back to the hand (state will re-render)
      snapBack();
    } else {
      // Never lifted: plain press, clear flags
      st.card.classList.remove('is-pressing','grab-intent');
    }

    st = null;
    tidyUp();
  }

  // Kill native HTML5 ghost drag
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // If any preview UI appears asynchronously, cancel an in-flight drag immediately
  new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
    .observe(document.body, { childList: true, subtree: true });

  // Delegate from ribbon so newly-rendered cards work automatically
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();
