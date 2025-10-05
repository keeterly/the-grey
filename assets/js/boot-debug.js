/* -----------------------------------------------------------------------
   THE GREY — unified gesture (drag vs long-press preview)
   - Real-card drag, snappy + smooth
   - No top-left jumps (coords set before is-dragging)
   - Preview and drag never overlap
----------------------------------------------------------------------- */

const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function getTranslateXY(el){
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return {tx:0, ty:0};
  const m = new DOMMatrixReadOnly(t);
  return { tx: m.m41, ty: m.m42 };
}

// ---------- Preview helpers ----------
function openPreviewWith(el){
  // Basic overlay + enlarged card. You can swap for your richer renderer.
  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';
  overlay.innerHTML = `<div class="preview-card">${el.outerHTML}</div>`;
  document.body.appendChild(overlay);

  // If the source was an instant, keep pulsing
  const srcIsInstant = el.classList.contains('is-instant');
  const previewCard = overlay.querySelector('.card');
  if (srcIsInstant && previewCard) previewCard.classList.add('pulsing');

  const close = () => overlay.remove();
  overlay.addEventListener('pointerdown', close, { once:true });
  return { close };
}

// ---------- Real-card drag ----------
(() => {
  const DRAG_THRESHOLD = 6;     // px to switch from press to drag
  const PREVIEW_MS     = 280;   // long-press delay
  const DAMP           = 0.34;  // drag smoothing
  const MAX_STEP       = 42;    // per-frame clamp
  let raf;

  // Drag layer host (keeps dragged node above UI)
  const dragLayer = document.querySelector('.drag-layer') || (() => {
    const d = document.createElement('div');
    d.className = 'drag-layer';
    document.body.appendChild(d);
    return d;
  })();

  let st = null;           // active drag state
  let holdTimer = null;    // preview timer
  let preview = null;      // { close }
  let previewOpen = false; // guard

  const tidyUp = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
    clearTimeout(holdTimer);
    holdTimer = null;
  };

  function onDown(e){
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    e.preventDefault();
    try { card.setPointerCapture(e.pointerId); } catch {}

    // Freeze hover/peek while we measure so the card doesn't "dip"
    card.classList.add('grab-intent');

    const rect = card.getBoundingClientRect();
    const { tx, ty } = getTranslateXY(card); // current ribbon translate (peek/hover)

    // Position WITHOUT the ribbon transform → no jump on lift
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

    // Start long-press timer (preview). If we move past threshold, we cancel this.
    holdTimer = setTimeout(() => {
      // If we already lifted into drag, ignore
      if (!st || st.lifted) return;

      // Open preview and fully cancel drag path
      preview = openPreviewWith(card);
      previewOpen = true;

      // Clean any drag listeners/state
      try { card.releasePointerCapture?.(st.pid); } catch {}
      card.classList.remove('grab-intent');
      st = null;
      tidyUp();

      // When preview closes, clear the flag; next pointerdown will start fresh
      const overlay = document.querySelector('.preview-overlay');
      overlay?.addEventListener('pointerdown', () => {
        previewOpen = false;
        preview = null;
      }, { once:true });
    }, PREVIEW_MS);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  }

  function lift(){
    if (!st || st.lifted) return;

    const { card, originParent, originNext } = st;

    // Cancel preview intent
    clearTimeout(holdTimer); holdTimer = null;

    // Placeholder keeps hand spacing stable
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // IMPORTANT ORDER: set vars → add class → move node
    card.style.setProperty('--drag-x', st.curX + 'px');
    card.style.setProperty('--drag-y', st.curY + 'px');

    card.classList.remove('grab-intent');     // done measuring
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

      st.curX += dx * 0.00001 + dx * DAMP; // tiny bias prevents stall on exact hit
      st.curY += dy * 0.00001 + dy * DAMP;

      st.card.style.setProperty('--drag-x', st.curX + 'px');
      st.card.style.setProperty('--drag-y', st.curY + 'px');

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function onMove(e){
    // If a preview is open, ignore movement entirely
    if (previewOpen) return;

    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    st.targetX = e.clientX - st.offsetX;
    st.targetY = e.clientY - st.offsetY;
  }

  function onUp(e){
    clearTimeout(holdTimer); holdTimer = null;

    // If a preview is open, don't do drag cleanup here; preview handler will reset
    if (previewOpen) { tidyUp(); return; }

    if (!st) { tidyUp(); return; }

    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    cancelAnimationFrame(raf);

    const { card, originParent, originNext, placeholder, isInstant } = st;

    if (st.lifted){
      // Accurate hit test: hide the dragged card briefly
      const prevVis = card.style.visibility;
      card.style.visibility = 'hidden';
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card.style.visibility = prevVis;

      const dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;

      if (dropSlot){
        // Optional snap feedback (visual)
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // Notify game logic (ensure your DOM has these data-attrs)
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

      // Return to hand visually; state will re-render appropriately
      if (originNext) originParent.insertBefore(card, originNext);
      else originParent.appendChild(card);
      if (placeholder) placeholder.remove();
      card.classList.remove('is-dragging');
      card.classList.remove('grab-intent');

      const previewStillOpen = !!document.querySelector('.preview-overlay');
      if (!previewStillOpen && isInstant) card.classList.remove('pulsing');
    } else {
      // Not lifted: simple click, just clear the measurement flag
      st.card.classList.remove('grab-intent');
    }

    st = null;
    tidyUp();
  }

  // Block native ghost drag everywhere
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // Delegate from the ribbon
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();
