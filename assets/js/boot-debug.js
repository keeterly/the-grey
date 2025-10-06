/* -----------------------------------------------------------------------
   THE GREY — UI Drag (real-card drag with page coords, no drift)
   - Start from exact visual position (no top-left hop)
   - Minimal dampening + snap for fast moves (no wobble)
   - Preview-safe: cancels drag if preview UI appears
   - Safe snap-back (never leaves card stuck in drag layer)
----------------------------------------------------------------------- */

console.log("[BRIDGE] Game + UI + Drag initialized and exposed to window.");

let st = null;                 // active drag state
let dragLayer = null;          // fixed host for the real dragged node
let raf = null;

const DRAG_THRESHOLD = 6;      // pixels before we lift the card
const SMOOTH = 0.18;           // smaller = snappier
const SNAP_DIST = 26;          // snap to cursor when distance > this

/* ---------- helpers ---------- */

const q = sel => document.querySelector(sel);
const isPreviewOpen = () =>
  !!document.querySelector('.preview-overlay, .preview-card');

/** Reinsert a card even if the ribbon/hand re-rendered. */
function safeReturn(card, originParent, originNext) {
  const ribbon = q('#ribbon');
  if (originParent && originParent.isConnected) {
    if (originNext && originNext.parentNode === originParent) {
      try { originParent.insertBefore(card, originNext); return; } catch {}
    }
    try { originParent.appendChild(card); return; } catch {}
  }
  if (ribbon) ribbon.appendChild(card);
}

/** Cancel any in-flight drag right now. */
function cancelDragNow() {
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  if (st.lifted) snapBack(); else st.card.classList.remove('is-pressing','grab-intent');
  st = null;
  cleanupGlobalListeners();
  cancelAnimationFrame(raf);
}

/* ---------- init ---------- */

function ensureDragLayer() {
  dragLayer = q('.drag-layer');
  if (!dragLayer) {
    dragLayer = document.createElement('div');
    dragLayer.className = 'drag-layer';
    document.body.appendChild(dragLayer);
  }
}

function addGlobalListeners() {
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);
}
function cleanupGlobalListeners() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('blur', onUp);
}

/* ---------- core drag handlers ---------- */

function onDown(e) {
  // Only start drags from the hand ribbon
  if (isPreviewOpen()) return;
  const card = e.target.closest('.ribbon .card');
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  ensureDragLayer();

  // Press pose = hover; freeze transitions while we measure
  card.classList.add('is-pressing', 'grab-intent');

  // Measure *visual* position (do NOT subtract transforms)
  const rect = card.getBoundingClientRect();
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  st = {
    pid: e.pointerId,
    card,
    startX: e.pageX,
    startY: e.pageY,

    // click point offset inside the card
    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,

    // live position state (page coords)
    curX: pageLeft,
    curY: pageTop,
    targetX: pageLeft,
    targetY: pageTop,

    // for elementFromPoint fallback on blur
    lastClientX: e.clientX,
    lastClientY: e.clientY,

    lifted: false,
    originParent: card.parentNode,
    originNext: card.nextSibling,
    placeholder: null,
    isInstant: card.classList.contains('is-instant'),
  };

  addGlobalListeners();
}

function lift() {
  if (!st || st.lifted) return;
  const { card, originParent, originNext } = st;

  // Re-measure visual position just before moving
  const rect = card.getBoundingClientRect();
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  // Placeholder to keep ribbon spacing
  const ph = document.createElement('div');
  ph.style.width = rect.width + 'px';
  ph.style.height = rect.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (originNext) originParent.insertBefore(ph, originNext);
  else originParent.appendChild(ph);

  // Recompute offset from this exact pose
  st.offsetX = st.startX - pageLeft;
  st.offsetY = st.startY - pageTop;

  // *** Set vars first so there's never a (0,0) frame ***
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

  // Switch classes and move to the drag layer
  card.classList.remove('grab-intent','is-pressing');
  card.classList.add('is-dragging');
  if (st.isInstant) card.classList.add('pulsing');
  dragLayer.appendChild(card);

  // Seed follow loop
  st.curX = pageLeft;
  st.curY = pageTop;
  st.targetX = pageLeft;
  st.targetY = pageTop;
  st.lifted = true;

  smoothFollow();
}

function onMove(e) {
  if (isPreviewOpen()) { cancelDragNow(); return; }
  if (!st) return;

  st.lastClientX = e.clientX;
  st.lastClientY = e.clientY;

  const dx = e.pageX - st.startX;
  const dy = e.pageY - st.startY;

  if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
  if (!st.lifted) return;

  // Keep initial grab point under the cursor
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(e) {
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  cancelAnimationFrame(raf);

  // Accurate hit test with blur fallback
  const cx = Number.isFinite(e.clientX) ? e.clientX : st.lastClientX;
  const cy = Number.isFinite(e.clientY) ? e.clientY : st.lastClientY;

  if (st.lifted && Number.isFinite(cx) && Number.isFinite(cy)) {
    st.card.style.visibility = 'hidden';
    const hit = document.elementFromPoint(cx, cy);
    st.card.style.visibility = '';

    // Only allow drops on the player's slots
    let dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
    if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null;

    if (dropSlot) {
      // Optional: quick visual snap to the slot (purely cosmetic)
      const r = dropSlot.getBoundingClientRect();
      st.card.style.setProperty('--drag-x', (r.left + window.scrollX) + 'px');
      st.card.style.setProperty('--drag-y', (r.top  + window.scrollY) + 'px');

      // Notify game engine if you expose one:
      try {
        game?.dispatch?.({
          type: 'DROP_CARD',
          cardId: st.card.dataset.id,
          slot: dropSlot.dataset.slot
        });
      } catch {}
    }
  }

  // Always snap back node to the ribbon; the game state will re-render it
  snapBack();
  st = null;
  cleanupGlobalListeners();
}

function snapBack() {
  const { card, originParent, originNext, placeholder } = st;
  safeReturn(card, originParent, originNext);
  if (placeholder && placeholder.isConnected) placeholder.remove();
  card.classList.remove('is-dragging','is-pressing','grab-intent','pulsing');
  // remove vars so CSS doesn’t hold stale position once back in ribbon
  card.style.removeProperty('--drag-x');
  card.style.removeProperty('--drag-y');
}

function smoothFollow() {
  cancelAnimationFrame(raf);
  const toHalf = v => Math.round(v * 2) / 2; // stable subpixel grid

  const step = () => {
    if (!st || !st.lifted) return;

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

/* ---------- boot ---------- */

// Kill native HTML5 ghost image
document.addEventListener('dragstart', e => e.preventDefault());

// If any preview UI appears asynchronously, cancel an in-flight drag
new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
  .observe(document.body, { childList: true, subtree: true });

// Start listening (delegate pointerdown at the document level)
window.addEventListener('DOMContentLoaded', () => {
  ensureDragLayer();
  document.addEventListener('pointerdown', onDown);
});
