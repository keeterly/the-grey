// boot-debug.js — Guarded dev drag (OFF by default; desktop-only)
console.log("[BRIDGE] boot-debug.js loaded.");

let st = null;            // active drag state
let dragLayer = null;     // fixed host for real dragged node
let raf = null;

const DRAG_THRESHOLD = 6; // px before lift
const DAMP = 0.25;        // minimal smoothing (lower = snappier)

// ---------- Guards ----------
function devDragEnabled() {
  // Enable with ?drag=1 or localStorage flag
  return /\bdrag=1\b/.test(location.search) ||
         localStorage.getItem('enableDragDev') === '1';
}
function isTouch() { return navigator.maxTouchPoints > 0; }
function isPreviewOpen() {
  return !!document.querySelector('.preview-overlay, .preview-card');
}

// ---------- Helpers ----------
function ensureDragLayer() {
  dragLayer = document.querySelector('.drag-layer');
  if (!dragLayer) {
    dragLayer = document.createElement('div');
    dragLayer.className = 'drag-layer';
    document.body.appendChild(dragLayer);
  }
}
function addGlobals() {
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);
}
function removeGlobals() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('blur', onUp);
}
/** reinsert card even if ribbon changed */
function safeReturn(card, originParent, originNext, placeholder) {
  try {
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
      return;
    }
  } catch {}
  if (originParent && originParent.isConnected) {
    try {
      if (originNext && originNext.parentNode === originParent) {
        originParent.insertBefore(card, originNext);
      } else {
        originParent.appendChild(card);
      }
      return;
    } catch {}
  }
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.appendChild(card);
}
function cancelDragNow() {
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  cancelAnimationFrame(raf);
  removeGlobals();
  safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
  st.card.classList.remove('is-dragging','is-pressing','grab-intent','pulsing');
  st.card.style.removeProperty('--drag-x');
  st.card.style.removeProperty('--drag-y');
  st = null;
}

// ---------- Init ----------
function initDragBridge() {
  // Hard guards: OFF unless enabled, and never on touch devices
  if (!devDragEnabled()) { console.log("[DRAG] disabled (pass ?drag=1 to enable)"); return; }
  if (isTouch()) { console.log("[DRAG] touch device detected — disabled"); return; }

  ensureDragLayer();

  document.addEventListener('pointerdown', onDown);
  document.addEventListener('dragstart', e => e.preventDefault()); // kill native ghost

  // If a preview shows up mid-drag, cancel immediately
  new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
    .observe(document.body, { childList: true, subtree: true });

  console.log("[DRAG] dev drag enabled");
}

// ---------- Core drag ----------
function onDown(e){
  if (isPreviewOpen()) return;
  // Start drags only from cards in the ribbon
  const card = e.target.closest('.ribbon .card');
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  // Press pose like hover; freeze transitions while measuring
  card.classList.add('is-pressing','grab-intent');

  // Measure visual position (do NOT subtract transforms)
  const rect = card.getBoundingClientRect();
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  st = {
    pid: e.pointerId,
    card,
    startX: e.pageX,
    startY: e.pageY,

    // click point inside the card
    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,

    // current/target match the visual pose
    curX: pageLeft,
    curY: pageTop,
    targetX: pageLeft,
    targetY: pageTop,

    lastClientX: e.clientX,
    lastClientY: e.clientY,

    lifted: false,
    originParent: card.parentNode,
    originNext: card.nextSibling,
    placeholder: null,
    isInstant: card.classList.contains('is-instant'),
  };

  addGlobals();
}

function lift(){
  if (!st || st.lifted) return;
  ensureDragLayer();

  const { card, originParent, originNext } = st;

  // Re-measure just before moving
  const rect = card.getBoundingClientRect();
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  // Placeholder to hold ribbon spacing
  const ph = document.createElement('div');
  ph.style.width = rect.width + 'px';
  ph.style.height = rect.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (originNext) originParent.insertBefore(ph, originNext);
  else originParent.appendChild(ph);

  // Recompute grab offset from the *visual* pose
  st.offsetX = st.startX - pageLeft;
  st.offsetY = st.startY - pageTop;

  // Set position variables FIRST → no (0,0) frame
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

  // Switch classes and move to drag layer
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

function onMove(e){
  if (isPreviewOpen()) { cancelDragNow(); return; }
  if (!st) return;

  st.lastClientX = e.clientX;
  st.lastClientY = e.clientY;

  const dx = e.pageX - st.startX;
  const dy = e.pageY - st.startY;

  if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
  if (!st.lifted) return;

  // Keep the exact grab point under the cursor
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(){
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}

  cancelAnimationFrame(raf);
  removeGlobals();

  // Always snap DOM back; state renderer will place it
  safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
  st.card.classList.remove('is-dragging','is-pressing','grab-intent','pulsing');
  st.card.style.removeProperty('--drag-x');
  st.card.style.removeProperty('--drag-y');

  st = null;
}

function smoothFollow() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!st || !st.lifted) return;

    st.curX += (st.targetX - st.curX) * DAMP;
    st.curY += (st.targetY - st.curY) * DAMP;

    st.card.style.setProperty('--drag-x', `${st.curX}px`);
    st.card.style.setProperty('--drag-y', `${st.curY}px`);

    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// ---------- Boot ----------
window.initDragBridge = initDragBridge;
window.addEventListener('DOMContentLoaded', initDragBridge);