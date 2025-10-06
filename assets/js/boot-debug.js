// boot-debug.js — Dev Drag (guarded), fixed hand tray z-order, bottom-safe toggle
console.log("[DRAG] dev drag bootstrap");

let st = null;             // active drag state
let dragLayer = null;      // fixed host for real dragged node
let raf = null;
let dragBtn = null;

const LIFT_THRESHOLD = 6;  // px to start drag
const MASS = 1.0;
const STIFFNESS = 0.34;    // higher = snappier
const DAMPING = 0.22;      // 0..1 (more = heavier damping)
const RETURN_MS = 220;     // return-to-hand animation
const SLOT_SNAP_MS = 120;  // visual snap to slot

/* ---------- helpers ---------- */

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
  window.addEventListener('pointermove', onMove, { passive:false });
  window.addEventListener('pointerup', onUp, { passive:false });
  window.addEventListener('pointercancel', onUp, { passive:false });
  window.addEventListener('blur', onUp, { passive:false });
}
function removeGlobals() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('blur', onUp);
}

/** reinsert card even if the hand re-rendered */
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

/** easeOutCubic for quick, non-spring animations */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function animateTo(x, y, ms, done) {
  if (!st) return;
  const sx = st.curX, sy = st.curY;
  const dx = x - sx, dy = y - sy;
  const t0 = performance.now();

  function step(t) {
    if (!st) return;
    const p = Math.min(1, (t - t0) / ms);
    const e = easeOutCubic(p);
    st.curX = sx + dx * e;
    st.curY = sy + dy * e;
    st.card.style.setProperty('--drag-x', `${st.curX}px`);
    st.card.style.setProperty('--drag-y', `${st.curY}px`);
    if (p < 1) requestAnimationFrame(step); else done && done();
  }
  requestAnimationFrame(step);
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

/* ---------- core drag ---------- */

function onDown(e){
  if (!devDragEnabled()) return;
  if (isPreviewOpen()) return;

  const card = e.target.closest('.ribbon .card'); // only from hand
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  ensureDragLayer();

  card.classList.add('is-pressing','grab-intent');

  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  st = {
    pid: e.pointerId,
    card,
    startX: e.pageX, startY: e.pageY,
    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,
    curX: pageLeft, curY: pageTop,
    targetX: pageLeft, targetY: pageTop,
    vx: 0, vy: 0,
    lastClientX: e.clientX, lastClientY: e.clientY,
    lifted:false, placeholder:null,
    originParent: card.parentNode, originNext: card.nextSibling,
    isInstant: card.classList.contains('is-instant'),
  };

  addGlobals();
}

function lift(){
  if (!st || st.lifted) return;

  const card = st.card;
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  // keep spacing in the ribbon
  const ph = document.createElement('div');
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // set vars BEFORE moving node
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

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

function onMove(e){
  if (!st) return;
  if (isPreviewOpen()) { cancelDragNow(); return; }

  st.lastClientX = e.clientX; st.lastClientY = e.clientY;

  const dx = e.pageX - st.startX;
  const dy = e.pageY - st.startY;
  if (!st.lifted && Math.hypot(dx, dy) > LIFT_THRESHOLD) lift();
  if (!st.lifted) return;

  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(e){
  if (!st) return;
  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  cancelAnimationFrame(raf);
  removeGlobals();

  let cx = Number.isFinite(e?.clientX) ? e.clientX : st.lastClientX;
  let cy = Number.isFinite(e?.clientY) ? e.clientY : st.lastClientY;

  let dropSlot = null;
  if (st.lifted && Number.isFinite(cx) && Number.isFinite(cy)) {
    st.card.style.visibility = 'hidden';
    const hit = document.elementFromPoint(cx, cy);
    st.card.style.visibility = '';
    dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
    if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null; // player-only
  }

  if (st.lifted && dropSlot){
    const r = dropSlot.getBoundingClientRect();
    const toX = r.left + window.scrollX;
    const toY = r.top  + window.scrollY;
    animateTo(toX, toY, SLOT_SNAP_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove('is-dragging','pulsing');
      st.card.style.removeProperty('--drag-x'); st.card.style.removeProperty('--drag-y');
      try {
        game?.dispatch?.({
          type:'DROP_CARD',
          cardId: st.card.dataset.id,
          slot: dropSlot.dataset.slot
        });
      } catch {}
      st = null;
    });
  } else if (st.lifted){
    const pr = st.placeholder.getBoundingClientRect();
    const toX = pr.left + window.scrollX;
    const toY = pr.top  + window.scrollY;
    animateTo(toX, toY, RETURN_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove('is-dragging','pulsing');
      st.card.style.removeProperty('--drag-x'); st.card.style.removeProperty('--drag-y');
      st = null;
    });
  } else {
    st.card.classList.remove('is-pressing','grab-intent');
    st = null;
  }
}

/* momentum follow loop (spring-ish) */
function momentumLoop(){
  cancelAnimationFrame(raf);
  const step = () => {
    if (!st || !st.lifted) return;

    const ax = (st.targetX - st.curX) * STIFFNESS / MASS;
    const ay = (st.targetY - st.curY) * STIFFNESS / MASS;

    st.vx = (st.vx + ax) * (1 - DAMPING);
    st.vy = (st.vy + ay) * (1 - DAMPING);

    st.curX += st.vx;
    st.curY += st.vy;

    st.card.style.setProperty('--drag-x', `${st.curX}px`);
    st.card.style.setProperty('--drag-y', `${st.curY}px`);

    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/* ---------- Dev toggle (always above tray) ---------- */
function mountDragToggle() {
  if (!dragBtn) {
    dragBtn = document.createElement('button');
    dragBtn.id = 'dragDevToggle';
    dragBtn.type = 'button';
    dragBtn.style.cssText = `
      position:fixed; left:12px;
      bottom:calc(env(safe-area-inset-bottom,0) + 12px);
      z-index:2147483647;
      padding:8px 10px; border:0; border-radius:10px;
      color:#fff; font-weight:700;
      box-shadow:0 6px 16px rgba(0,0,0,.18); cursor:pointer;
    `;
    dragBtn.addEventListener('click', () => {
      const now = !devDragEnabled();
      if (now) localStorage.setItem('enableDragDev','1');
      else localStorage.removeItem('enableDragDev');
      updateToggleVisual();
    });
  }
  updateToggleVisual();
  document.body.appendChild(dragBtn); // last child → on top
}
function updateToggleVisual() {
  const on = devDragEnabled();
  dragBtn.textContent = on ? 'Drag: ON' : 'Drag: OFF';
  dragBtn.style.background = on ? '#2c7be5' : '#999';
}

/* ---------- boot ---------- */
window.addEventListener('DOMContentLoaded', () => {
  // Always move the tray to end of <body> so it sits above other content
  const tray = document.querySelector('.ribbon-wrap');
  if (tray) document.body.appendChild(tray);

  // Then mount the dev toggle so it sits above the tray
  mountDragToggle();

  // Always block native HTML5 drag ghost
  document.addEventListener('dragstart', e => e.preventDefault(), { passive:false });

  if (!devDragEnabled()){
    console.log('[DRAG] disabled (toggle or ?drag=1 to enable)');
    return;
  }

  ensureDragLayer();

  // Cancel if preview UI appears mid-drag
  new MutationObserver(() => { if (isPreviewOpen()) cancelDragNow(); })
    .observe(document.body, { childList:true, subtree:true });

  document.addEventListener('pointerdown', onDown, { passive:false });
  console.log('[DRAG] enabled');
});