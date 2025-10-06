// boot-debug.js — 2.5× Hold Preview (always on) + Dev Drag (toggle only)
/* eslint-disable */

console.log("[DRAG] bootstrap — preview ALWAYS on (2.5×), drag gated by toggle");

/* =========================
   Tunables
   ========================= */
const HOLD_MS = 320;                // press-and-hold delay to show preview
const LIFT_THRESHOLD = 10;          // px to start drag before preview (only when drag is ON)
const PREVIEW_CANCEL_THRESHOLD = 20;// movement to cancel pending preview
const PREVIEW_DRAG_THRESHOLD = 18;  // movement to convert preview -> drag (when drag is ON)
const PREVIEW_SCALE = 2.5;          // 250% preview

const RETURN_MS = 220;              // animate back to hand
const SLOT_SNAP_MS = 120;           // animate into slot
const STIFFNESS = 0.34;             // follow feel
const DAMPING = 0.22;
const MASS = 1.0;

/* =========================
   State
   ========================= */
let st = null;
let raf = null;
let holdTimer = null;
let dragLayer = null;
let dragBtn = null;
let previewNode = null;

/* =========================
   Helpers
   ========================= */
const devDragEnabled = () =>
  /\bdrag=1\b/.test(location.search) ||
  localStorage.getItem('enableDragDev') === '1';

const isPreviewOpen = () => !!previewNode;

function ensureDragLayer(){
  dragLayer = document.querySelector('.drag-layer');
  if (!dragLayer){
    dragLayer = document.createElement('div');
    dragLayer.className = 'drag-layer';
    Object.assign(dragLayer.style, {
      position:'fixed', inset:'0', pointerEvents:'none', zIndex:'2147483647'
    });
    document.body.appendChild(dragLayer);
  }
}

function addGlobals(){
  window.addEventListener('pointermove', onMove, { passive:false });
  window.addEventListener('pointerup', onUp, { passive:false });
  window.addEventListener('pointercancel', onUp, { passive:false });
  window.addEventListener('blur', onUp, { passive:false });
}
function removeGlobals(){
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('blur', onUp);
}

function safeReturn(card, originParent, originNext, placeholder){
  try {
    if (placeholder && placeholder.parentNode){
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
      return;
    }
  } catch {}
  if (originParent && originParent.isConnected){
    try {
      if (originNext && originNext.parentNode === originParent){
        originParent.insertBefore(card, originNext);
      } else {
        originParent.appendChild(card);
      }
      return;
    } catch {}
  }
  document.getElementById('ribbon')?.appendChild(card);
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function animateTo(x, y, ms, done){
  if (!st) return;
  const sx = st.curX, sy = st.curY;
  const dx = x - sx, dy = y - sy;
  const t0 = performance.now();

  function step(t){
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

/* =========================
   Preview (true clone @ 2.5×)
   ========================= */
function openPreview(fromCard){
  closePreview();

  const clone = fromCard.cloneNode(true);
  clone.style.boxShadow = '0 18px 60px rgba(0,0,0,.32)';
  clone.style.borderRadius = getComputedStyle(fromCard).borderRadius;

  const cs = getComputedStyle(fromCard);

  Object.assign(clone.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: `translate(-50%,-50%) scale(${PREVIEW_SCALE})`,
    transformOrigin: 'center center',
    width: cs.width,
    height: cs.height,
    zIndex: '2147483647',
    pointerEvents: 'none',
    willChange: 'transform, opacity',
    transition: 'transform .15s ease-out, opacity .15s ease-out',
    opacity: '1'
  });
  clone.classList.remove('is-pressing','grab-intent','is-dragging');

  previewNode = clone;
  document.body.appendChild(previewNode);
}
function closePreview(){
  if (previewNode){
    try { previewNode.remove(); } catch {}
    previewNode = null;
  }
}

/* =========================
   Drag core
   ========================= */
function onDown(e){
  const card = e.target.closest('.ribbon .card');
  if (!card || e.button !== 0) return;

  // prevent accidental page scroll on iOS while handling preview/drag
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
    lifted: false,
    previewed: false,
    placeholder: null,
    originParent: card.parentNode,
    originNext: card.nextSibling,
    isInstant: card.classList.contains('is-instant'),
    lastClientX: e.clientX,
    lastClientY: e.clientY,
  };

  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    if (!st || st.lifted) return;
    openPreview(card);
    st.previewed = true;
  }, HOLD_MS);

  addGlobals();
}

function lift(){
  if (!st || st.lifted) return;

  if (!devDragEnabled()) return; // only allow lifting when dev drag is ON

  closePreview();
  clearTimeout(holdTimer);

  const card = st.card;
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  // placeholder keeps ribbon spacing
  const ph = document.createElement('div');
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // set coords before moving to avoid flash at (0,0)
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

  st.lastClientX = e.clientX; st.lastClientY = e.clientY;

  const dx = e.pageX - st.startX;
  const dy = e.pageY - st.startY;
  const dist = Math.hypot(dx, dy);

  // while preview is visible: tolerate small moves; convert to drag after threshold (drag must be ON)
  if (!st.lifted && st.previewed){
    if (devDragEnabled() && dist > PREVIEW_DRAG_THRESHOLD) {
      lift();
    }
    return;
  }

  // before preview fires: cancel intent if user moves enough; start drag if allowed
  if (!st.lifted && !st.previewed){
    if (dist > PREVIEW_CANCEL_THRESHOLD) closePreview();
    if (devDragEnabled() && dist > LIFT_THRESHOLD) lift();
  }

  if (!st.lifted) return;

  closePreview();
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(e){
  if (!st) return;

  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  cancelAnimationFrame(raf);
  removeGlobals();
  clearTimeout(holdTimer);

  // never lifted => just close preview and reset
  if (!st.lifted){
    closePreview();
    st.card.classList.remove('is-pressing','grab-intent');
    st = null;
    return;
  }

  closePreview();

  // Determine drop (player slots only)
  let cx = Number.isFinite(e?.clientX) ? e.clientX : st.lastClientX;
  let cy = Number.isFinite(e?.clientY) ? e.clientY : st.lastClientY;

  let dropSlot = null;
  if (Number.isFinite(cx) && Number.isFinite(cy)) {
    st.card.style.visibility = 'hidden';
    const hit = document.elementFromPoint(cx, cy);
    st.card.style.visibility = '';
    dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
    if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null;
  }

  if (dropSlot){
    const r = dropSlot.getBoundingClientRect();
    const toX = r.left + window.scrollX;
    const toY = r.top  + window.scrollY;
    animateTo(toX, toY, SLOT_SNAP_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove('is-dragging','pulsing');
      st.card.style.removeProperty('--drag-x');
      st.card.style.removeProperty('--drag-y');
      try {
        game?.dispatch?.({
          type:'DROP_CARD',
          cardId: st.card.dataset.id,
          slot: dropSlot.dataset.slot
        });
      } catch {}
      st = null;
    });
  } else {
    // back to placeholder
    const pr = st.placeholder.getBoundingClientRect();
    const toX = pr.left + window.scrollX;
    const toY = pr.top  + window.scrollY;
    animateTo(toX, toY, RETURN_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove('is-dragging','pulsing');
      st.card.style.removeProperty('--drag-x');
      st.card.style.removeProperty('--drag-y');
      st = null;
    });
  }
}

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

/* =========================
   Dev toggle UI
   ========================= */
function mountDragToggle(){
  if (dragBtn) return;
  dragBtn = document.createElement('button');
  dragBtn.id = 'dragDevToggle';
  dragBtn.type = 'button';
  dragBtn.style.cssText = `
    position:fixed; left:12px;
    bottom:calc(env(safe-area-inset-bottom,0) + 12px);
    z-index:2147483647;
    padding:8px 10px; border:0; border-radius:10px;
    color:#fff; font-weight:700;
    background:#2c7be5;
    box-shadow:0 6px 16px rgba(0,0,0,.18); cursor:pointer;
  `;
  dragBtn.addEventListener('click', () => {
    const now = !devDragEnabled();
    if (now) localStorage.setItem('enableDragDev','1');
    else localStorage.removeItem('enableDragDev');
    updateToggleVisual();
  });
  document.body.appendChild(dragBtn);
  updateToggleVisual();
}
function updateToggleVisual(){
  const on = devDragEnabled();
  dragBtn.textContent = on ? 'Drag: ON' : 'Drag: OFF';
  dragBtn.style.background = on ? '#2c7be5' : '#999';
}

/* =========================
   Boot
   ========================= */
window.addEventListener('DOMContentLoaded', () => {
  // ensure the tray is a direct child of body so it never masks the drag layer
  const tray = document.querySelector('.ribbon-wrap');
  if (tray && tray.parentNode !== document.body) document.body.appendChild(tray);

  mountDragToggle();

  // Prevent native ghost image
  document.addEventListener('dragstart', e => e.preventDefault(), { passive:false });

  ensureDragLayer();
  document.addEventListener('pointerdown', onDown, { passive:false });
  console.log('[DRAG] ready — preview 2.5× always ON, drag requires toggle/?drag=1');
});