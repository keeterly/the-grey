// boot-debug.js
console.log("[BRIDGE] Game + UI + Drag initialized and exposed to window.");

let st = null;           // active drag state
let dragLayer = null;    // fixed host for the real dragged node
let raf = null;

const DRAG_THRESHOLD = 6;   // px before lift
const DAMP = 0.25;          // minimal smoothing (lower = snappier)

/* ------------ helpers ------------ */

const isPreviewOpen = () =>
  !!document.querySelector('.preview-overlay, .preview-card');

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

/** reinsert card even if the ribbon changed */
function safeReturn(card, originParent, originNext, placeholder) {
  try { if (placeholder && placeholder.parentNode) {
    // prefer the placeholder (exact spot)
    placeholder.parentNode.insertBefore(card, placeholder);
    placeholder.remove();
    return;
  }} catch {}
  // fallback to original parent or ribbon end
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

  // put node back and clear styles/classes
  safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
  st.card.classList.remove('is-dragging','is-pressing','grab-intent','pulsing');
  st.card.style.removeProperty('--drag-x');
  st.card.style.removeProperty('--drag-y');

  st = null;
}

/* ------------ init ------------ */

function initDragBridge() {
  ensureDragLayer();
  document.addEventListener('pointerdown', onDown);
  // Block native ghost image
  document.addEventListener('dragstart', e => e.preventDefault());
  // If any preview UI appears asynchronously, cancel an in-flight drag
  new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
    .observe(document.body, { childList: true, subtree: true });
}

/* ------------ core drag ------------ */

function onDown(e){
  if (isPreviewOpen()) return;

  // start drags only from hand cards
  const card = e.target.closest('.ribbon .card');
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  // Make press look like hover; freeze transitions.
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

    // current/target are the visual position
    curX: pageLeft,
    curY: pageTop,
    targetX: pageLeft,
    targetY: pageTop,

    lastClientX: e.clientX, // for blur fallback
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

  // Measure again just before moving (still visual coords)
  const rect = card.getBoundingClientRect();
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  // Keep ribbon spacing with a placeholder
  const ph = document.createElement('div');
  ph.style.width = rect.width + 'px';
  ph.style.height = rect.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (originNext) originParent.insertBefore(ph, originNext);
  else originParent.appendChild(ph);

  // Recompute grip offset from the *visual* top/left
  st.offsetX = st.startX - pageLeft;
  st.offsetY = st.startY - pageTop;

  // IMPORTANT: set CSS vars FIRST so there is no 0,0 frame
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

  // Then switch classes and move the node
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

  // Follow cursor; keep the exact click point under the pointer
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(e) {
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}

  cancelAnimationFrame(raf);
  removeGlobals();

  // Always snap DOM back; game state will re-render
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

/* boot */
window.initDragBridge = initDragBridge;
window.addEventListener('DOMContentLoaded', initDragBridge);