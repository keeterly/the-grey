/* -----------------------------------------------------------------------
   THE GREY — dev helpers (drag + diagnostics)
   Drop-in replacement for assets/js/boot-debug.js
----------------------------------------------------------------------- */

// ===== Utilities =======================================================
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function getTranslateXY(el){
  // Extract current translate from computed transform (handles matrix/matrix3d)
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return {tx:0, ty:0};
  const m = new DOMMatrixReadOnly(t);
  return { tx: m.m41, ty: m.m42 };
}

// ===== Pointer-based REAL-CARD DRAG ===================================
(() => {
  const DRAG_THRESHOLD = 6;    // px before we lift
  const DAMP = 0.34;           // responsiveness (0.28–0.38 feels good)
  const MAX_STEP = 50;         // clamp per-frame movement
  let raf;

  // One drag layer for all drags
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
    window.removeEventListener('pointerup', onUp, { capture:false });
    window.removeEventListener('pointercancel', onUp, { capture:false });
    window.removeEventListener('blur', onUp, { capture:false });
  };

  // ——— keep getTranslateXY() and other helpers as-is ———

function onDown(e){
  const card = e.target.closest('.ribbon .card');
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  // DO NOT add .is-dragging here (it would jump to 0,0 before vars are set)
  const rect = card.getBoundingClientRect();
  const { tx, ty } = getTranslateXY(card); // current ribbon translate

  // Position WITHOUT the ribbon transform so lift doesn't nudge
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

  // keep fan spacing with a placeholder
  const r = card.getBoundingClientRect();
  const ph = document.createElement('div');
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (originNext) originParent.insertBefore(ph, originNext);
  else originParent.appendChild(ph);

  // IMPORTANT ORDER:
  // 1) set vars
  card.style.setProperty('--drag-x', st.curX + 'px');
  card.style.setProperty('--drag-y', st.curY + 'px');

  // 2) add class (so transform uses the vars immediately)
  card.classList.add('is-dragging');
  if (st.isInstant) card.classList.add('pulsing');

  // 3) move to drag layer
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

      st.curX += dx * DAMP;
      st.curY += dy * DAMP;

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

    st.targetX = e.clientX - st.offsetX;
    st.targetY = e.clientY - st.offsetY;
  }

  function onUp(e){
    if (!st) { tidyUp(); return; }

    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    cancelAnimationFrame(raf);

    const { card, originParent, originNext, placeholder, isInstant } = st;

    if (st.lifted){
      // Accurate hit test: hide the dragged card momentarily
      const prevVis = card.style.visibility;
      card.style.visibility = 'hidden';
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card.style.visibility = prevVis;

      const dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;

      if (dropSlot){
        // Snap visually to slot (optional quick feedback)
        const r = dropSlot.getBoundingClientRect();
        card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
        card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

        // Tell game logic (ensure data attributes exist on your DOM)
        try {
          game?.dispatch?.({
            type: 'DROP_CARD',
            cardId: card.dataset.id,        // card needs data-id
            slot: dropSlot.dataset.slot     // slot needs data-slot
          });
        } catch (err) {
          console.warn('[The Grey] DROP_CARD dispatch failed:', err);
        }
      }

      // Return to hand visually (game state will re-render appropriately)
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

  // Kill native ghost drag image globally
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // Delegate from ribbon
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();

// ===== Tiny dev badge: shows current Æ count for quick sanity ==========
(() => {
  const gem = document.getElementById('aeGemCount');
  if (!gem) return;
  const log = (...a)=> console.log('[The Grey]', ...a);
  const update = () => {
    try { log('Æ =', gem.textContent?.trim()); }
    catch {}
  };
  const obs = new MutationObserver(update);
  obs.observe(gem, { childList:true, characterData:true, subtree:true });
  update();
})();
