/* -----------------------------------------------------------------------
   THE GREY — dev: real-card drag (page coords, snap/lerp), preview guard,
   safe DOM snap-back, no top-left jumps.
----------------------------------------------------------------------- */

/* --- utils ----------------------------------------------------------- */
function getTranslateXY(el){
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return {tx:0, ty:0};
  const m = new DOMMatrixReadOnly(t);
  return { tx: m.m41, ty: m.m42 };
}

// Put the element back even if the hand has re-rendered.
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

/* --- drag ------------------------------------------------------------ */
(() => {
  const DRAG_THRESHOLD = 6;   // px to lift
  const SMOOTH = 0.14;        // minimal dampening near cursor
  const SNAP_DIST = 24;       // snap when farther than this (no wobble)
  let raf;

  // treat these as "preview is open" (drag cancels)
  const PREVIEW_SELECTORS = '.preview-overlay, .preview-card';

  // one host above UI for the real dragged node
  const dragLayer = document.querySelector('.drag-layer') || (() => {
    const d = document.createElement('div');
    d.className = 'drag-layer';
    document.body.appendChild(d);
    return d;
  })();

  let st = null; // active drag state

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
    if (st.lifted) snapBack();
    else st.card.classList.remove('is-pressing','grab-intent');
    st = null;
    tidyUp();
  }

  function onDown(e){
    if (isPreviewOpen()) return;                 // don’t start while preview up
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    e.preventDefault();
    try { card.setPointerCapture(e.pointerId); } catch {}

    // Make press pose match hover (CSS), and freeze transitions while measuring
    card.classList.add('is-pressing');
    card.classList.add('grab-intent');

    // measure current visual position (press already applied)
    const rect = card.getBoundingClientRect();
    const { tx, ty } = getTranslateXY(card);     // subtract any CSS translate

    const rawLeft = rect.left + window.scrollX - tx;
    const rawTop  = rect.top  + window.scrollY - ty;

    st = {
      pid: e.pointerId,
      card,
      // use PAGE coords → stable with scroll
      startX: e.pageX,
      startY: e.pageY,
      offsetX: e.pageX - rawLeft,   // grip point inside the card
      offsetY: e.pageY - rawTop,
      curX: rawLeft,                // current card top-left (page)
      curY: rawTop,
      targetX: rawLeft,
      targetY: rawTop,
      lastClientX: e.clientX,       // for elementFromPoint fallback
      lastClientY: e.clientY,
      lifted: false,
      originParent: card.parentNode,
      originNext: card.nextSibling,
      placeholder: null,
      isInstant: card.classList.contains('is-instant'),
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);       // e has no clientX → we guard
  }

  function lift(){
    if (!st || st.lifted) return;
    const { card, originParent, originNext } = st;

    // placeholder keeps hand layout
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // IMPORTANT ORDER:
    // 1) set position vars (so transform isn’t 0,0 even for 1 frame)
    card.style.setProperty('--drag-x', st.curX + 'px');
    card.style.setProperty('--drag-y', st.curY + 'px');

    // 2) switch classes
    card.classList.remove('grab-intent','is-pressing');
    card.classList.add('is-dragging');
    if (st.isInstant) card.classList.add('pulsing');

    // 3) move node to the drag layer
    dragLayer.appendChild(card);

    st.lifted = true;
    smoothFollow();
  }

  function smoothFollow(){
    cancelAnimationFrame(raf);
    const toHalf = v => Math.round(v * 2) / 2; // subpixel stability

    const step = () => {
      if (!st) return;

      const dx = st.targetX - st.curX;
      const dy = st.targetY - st.curY;
      const dist = Math.hypot(dx, dy);

      if (dist > SNAP_DIST) {
        st.curX = st.targetX;
        st.curY = st.targetY;
      } else {
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

    st.lastClientX = e.clientX;   // keep fresh for elementFromPoint
    st.lastClientY = e.clientY;

    const dx = e.pageX - st.startX;
    const dy = e.pageY - st.startY;

    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    // keep original grip point under the cursor
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
      // Accurate hit test; guard against non-pointer events (blur)
      const cx = Number.isFinite(e.clientX) ? e.clientX : st.lastClientX;
      const cy = Number.isFinite(e.clientY) ? e.clientY : st.lastClientY;

      let dropSlot = null;
      if (Number.isFinite(cx) && Number.isFinite(cy)) {
        const prevVis = card.style.visibility;
        card.style.visibility = 'hidden';
        const hit = document.elementFromPoint(cx, cy);
        card.style.visibility = prevVis;

        dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
        // Only allow PLAYER slots, not AI
        if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null;
      }

      if (dropSlot){
        // optional quick visual snap to slot
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // notify game logic (ensure data-* exist)
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

      // ALWAYS snap DOM back to hand (state will re-render & place it)
      snapBack();
    } else {
      // never lifted: plain press → clear flags
      st.card.classList.remove('is-pressing','grab-intent');
    }

    st = null;
    tidyUp();
  }

  // nuke native HTML5 ghost drag
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // if any preview UI appears asynchronously, cancel in-flight drag immediately
  new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
    .observe(document.body, { childList: true, subtree: true });

  // delegate from ribbon
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();
