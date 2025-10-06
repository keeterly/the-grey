// boot-debug.js — Dev Drag (momentum, return animation, toggle button)
// Drag is OFF unless you enable it via ?drag=1 or the bottom-left toggle.

console.log("[DRAG] dev drag bootstrap");

let st = null;             // active drag state
let dragLayer = null;      // fixed host for real dragged node
let raf = null;

const LIFT_THRESHOLD = 6;  // px to start drag
const MASS = 1.0;          // mass for momentum model
const STIFFNESS = 0.34;    // spring constant -> higher = snappier
const DAMPING = 0.22;      // friction (0..1) -> higher = more damping
const RETURN_MS = 220;     // duration of return-to-hand animation
const SLOT_SNAP_MS = 120;  // visual snap-to-slot before handing control to game

/* ----------------- small helpers ----------------- */

const devDragEnabled = () =>
  /\bdrag=1\b/.test(location.search) ||
  localStorage.getItem('enableDragDev') === '1';

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
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: false });
  window.addEventListener('pointercancel', onUp, { passive: false });
  window.addEventListener('blur', onUp, { passive: false });
}
function removeGlobals() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('blur', onUp);
}

/** Reinsert card even if the hand was re-rendered. */
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

/** Ease function for return animations. */
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

/** Animate the card’s CSS-vars to (x,y). Calls done() after. */
function animateTo(x, y, ms, done) {
  if (!st) return;
  const startX = st.curX, startY = st.curY;
  const dx = x - startX, dy = y - startY;
  const t0 = performance.now();

  function step(t) {
    if (!st) return;
    const p = Math.min(1, (t - t0) / ms);
    const e = easeOutCubic(p);
    st.curX = startX + dx * e;
    st.curY = startY + dy * e;
    st.card.style.setProperty('--drag-x', `${st.curX}px`);
    st.card.style.setProperty('--drag-y', `${st.curY}px`);
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      done && done();
    }
  }
  requestAnimationFrame(step);
}

/** Cancel drag immediately (e.g., preview popped). */
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

/* ----------------- core drag ----------------- */

function onDown(e) {
  if (!devDragEnabled()) return;
  if (isPreviewOpen()) return;

  // Only from hand
  const card = e.target.closest('.ribbon .card');
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  ensureDragLayer();

  // “Pressed” pose (same as hover); freeze transitions while measuring
  card.classList.add('is-pressing','grab-intent');

  // Measure *visual* pose (don’t subtract transforms)
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  st = {
    pid: e.pointerId,
    card,
    startX: e.pageX, startY: e.pageY,

    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,

    curX: pageLeft,
    curY: pageTop,
    targetX: pageLeft,
    targetY: pageTop,

    vx: 0, vy: 0,                      // velocity for momentum
    lastClientX: e.clientX,
    lastClientY: e.clientY,

    lifted: false,
    placeholder: null,
    originParent: card.parentNode,
    originNext: card.nextSibling,
    isInstant: card.classList.contains('is-instant'),
  };

  addGlobals();
}

function lift() {
  if (!st || st.lifted) return;

  const card = st.card;
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  // Keep spacing in the ribbon
  const ph = document.createElement('div');
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // Offset based on current pose
  st.offsetX = st.startX - pageLeft;
  st.offsetY = st.startY - pageTop;

  // Set CSS-vars BEFORE we move the node
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

  // Switch classes and host
  card.classList.remove('grab-intent','is-pressing');
  card.classList.add('is-dragging');
  if (st.isInstant) card.classList.add('pulsing');
  dragLayer.appendChild(card);

  st.curX = pageLeft; st.curY = pageTop;
  st.targetX = pageLeft; st.targetY = pageTop;
  st.vx = 0; st.vy = 0;
  st.lifted = true;

  momentumLoop();
}

function onMove(e) {
  if (!st) return;
  if (isPreviewOpen()) { cancelDragNow(); return; }

  st.lastClientX = e.clientX;
  st.lastClientY = e.clientY;

  const dx = e.pageX - st.startX;
  const dy = e.pageY - st.startY;
  if (!st.lifted && Math.hypot(dx, dy) > LIFT_THRESHOLD) lift();
  if (!st.lifted) return;

  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(e) {
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  cancelAnimationFrame(raf);
  removeGlobals();

  // Hit test (with blur fallback)
  let cx = Number.isFinite(e?.clientX) ? e.clientX : st.lastClientX;
  let cy = Number.isFinite(e?.clientY) ? e.clientY : st.lastClientY;

  let dropSlot = null;
  if (st.lifted && Number.isFinite(cx) && Number.isFinite(cy)) {
    st.card.style.visibility = 'hidden';
    const hit = document.elementFromPoint(cx, cy);
    st.card.style.visibility = '';
    dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
    // Only allow drops on player's board
    if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null;
  }

  if (st.lifted && dropSlot) {
    // Quick visual snap to slot, then return DOM to hand; game state will move it.
    const r = dropSlot.getBoundingClientRect();
    const toX = r.left + window.scrollX;
    const toY = r.top  + window.scrollY;
    animateTo(toX, toY, SLOT_SNAP_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove('is-dragging','pulsing');
      st.card.style.removeProperty('--drag-x'); st.card.style.removeProperty('--drag-y');
      // notify engine if available
      try {
        game?.dispatch?.({
          type: 'DROP_CARD',
          cardId: st.card.dataset.id,
          slot: dropSlot.dataset.slot
        });
      } catch {}
      st = null;
    });
  } else if (st.lifted) {
    // Return to hand (animate back to placeholder spot)
    const phRect = st.placeholder.getBoundingClientRect();
    const toX = phRect.left + window.scrollX;
    const toY = phRect.top  + window.scrollY;
    animateTo(toX, toY, RETURN_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove('is-dragging','pulsing');
      st.card.style.removeProperty('--drag-x'); st.card.style.removeProperty('--drag-y');
      st = null;
    });
  } else {
    // never lifted — just clear press state
    st.card.classList.remove('is-pressing','grab-intent');
    st = null;
  }
}

/* ----------------- momentum follow loop ----------------- */
function momentumLoop() {
  cancelAnimationFrame(raf);

  const step = () => {
    if (!st || !st.lifted) return;

    // Spring force towards target
    const ax = (st.targetX - st.curX) * STIFFNESS / MASS;
    const ay = (st.targetY - st.curY) * STIFFNESS / MASS;

    // Integrate velocity
    st.vx = (st.vx + ax);
    st.vy = (st.vy + ay);

    // Damping (friction)
    st.vx *= (1 - DAMPING);
    st.vy *= (1 - DAMPING);

    // Integrate position
    st.curX += st.vx;
    st.curY += st.vy;

    st.card.style.setProperty('--drag-x', `${st.curX}px`);
    st.card.style.setProperty('--drag-y', `${st.curY}px`);

    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
}

/* ----------------- dev toggle button ----------------- */
function addDevToggle() {
  // Add only once
  if (document.getElementById('dragDevToggle')) return;

  const btn = document.createElement('button');
  btn.id = 'dragDevToggle';
  btn.type = 'button';
  btn.textContent = devDragEnabled() ? 'Drag: ON' : 'Drag: OFF';
  Object.assign(btn.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: 9999,
    padding: '8px 10px', border: '0', borderRadius: '10px',
    background: devDragEnabled() ? '#2c7be5' : '#ccc',
    color: '#fff', fontWeight: '700', boxShadow: '0 6px 16px rgba(0,0,0,.18)',
    cursor: 'pointer'
  });
  btn.addEventListener('click', () => {
    const now = !devDragEnabled();
    if (now) localStorage.setItem('enableDragDev','1');
    else localStorage.removeItem('enableDragDev');
    // Reflect UI state immediately
    btn.textContent = now ? 'Drag: ON' : 'Drag: OFF';
    btn.style.background = now ? '#2c7be5' : '#ccc';
  });
  document.body.appendChild(btn);
}

/* ----------------- boot ----------------- */
function initDragBridge() {
  // Always install the toggle so you can turn it on/off without reload
  addDevToggle();

  if (!devDragEnabled()) {
    document.addEventListener('dragstart', e => e.preventDefault());
    console.log('[DRAG] disabled (toggle or ?drag=1 to enable)');
    return;
  }

  ensureDragLayer();

  // Kill native ghost image
  document.addEventListener('dragstart', e => e.preventDefault());

  // Cancel if preview UI appears mid-drag
  new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
    .observe(document.body, { childList: true, subtree: true });

  document.addEventListener('pointerdown', onDown, { passive: false });

  console.log('[DRAG] enabled');
}

window.addEventListener('DOMContentLoaded', initDragBridge);