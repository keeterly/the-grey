// boot-debug.js — Dev Drag + 500% Hold Preview
console.log("[DRAG] dev drag bootstrap (500% preview)");

/* =========================
   Tunables
   ========================= */
const LIFT_THRESHOLD = 10;      // px (more tolerant than before)
const HOLD_MS = 350;            // press-and-hold to preview
const RETURN_MS = 220;          // animate back to hand
const SLOT_SNAP_MS = 120;       // animate into slot
const STIFFNESS = 0.34;         // spring-ish follow
const DAMPING = 0.22;
const MASS = 1.0;

/* =========================
   State
   ========================= */
let st = null;                  // active drag
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
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.appendChild(card);
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
   Preview (500% clone)
   ========================= */
function openPreview(fromCard){
  closePreview(); // safety
  // Clone so the real card stays put
  const clone = fromCard.cloneNode(true);
  Object.assign(clone.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) scale(5)', // 500%
    transformOrigin: 'center center',
    zIndex: '9999',
    pointerEvents: 'none',
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
  if (!devDragEnabled()) return;
  if (isPreviewOpen()) return;

  const card = e.target.closest('.ribbon .card'); // only drag from hand
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
    lifted: false,
    placeholder: null,
    originParent: card.parentNode,
    originNext: card.nextSibling,
    isInstant: card.classList.contains('is-instant'),
    lastClientX: e.clientX,
    lastClientY: e.clientY,
  };

  // Start hold-to-preview timer
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    if (!st || st.lifted) return;       // don't preview if we've started dragging
    openPreview(card);
  }, HOLD_MS);

  addGlobals();
}

function lift(){
  if (!st || st.lifted) return;

  // If a preview is open, close it before lifting
  closePreview();
  clearTimeout(holdTimer);

  const card = st.card;
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  // keep hand spacing
  const ph = document.createElement('div');
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // set vars BEFORE moving node to avoid 0,0 flash
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

  // If user moves more than threshold, cancel preview and start drag
  if (!st.lifted && Math.hypot(dx, dy) > LIFT_THRESHOLD){
    lift();
  }

  if (!st.lifted) return;

  closePreview(); // preview must not stay while dragging
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onUp(e){
  if (!st) return;

  try { st.card.releasePointerCapture?.(st.pid); } catch {}
  cancelAnimationFrame(raf);
  removeGlobals();

  clearTimeout(holdTimer);
  closePreview();

  // Determine drop (player slots only)
  let cx = Number.isFinite(e?.clientX) ? e.clientX : st.lastClientX;
  let cy = Number.isFinite(e?.clientY) ? e.clientY : st.lastClientY;

  let dropSlot = null;
  if (st.lifted && Number.isFinite(cx) && Number.isFinite(cy)) {
    st.card.style.visibility = 'hidden';
    const hit = document.elementFromPoint(cx, cy);
    st.card.style.visibility = '';
    dropSlot = hit && hit.closest ? hit.closest('.slotCell') : null;
    if (dropSlot && !dropSlot.closest('#playerSlots')) dropSlot = null; // only player board
  }

  if (st.lifted && dropSlot){
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
  } else if (st.lifted){
    // animate back to placeholder
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
  } else {
    // never dragged; just clear press state
    st.card.classList.remove('is-pressing','grab-intent');
    st = null;
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
   Dev toggle
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
  // Put tray at end of body so it sits above normal content
  const tray = document.querySelector('.ribbon-wrap');
  if (tray) document.body.appendChild(tray);

  mountDragToggle();

  // Always block native HTML5 ghost
  document.addEventListener('dragstart', e => e.preventDefault(), { passive:false });

  if (!devDragEnabled()){
    console.log('[DRAG] disabled (toggle or ?drag=1 to enable)');
    return;
  }

  ensureDragLayer();

  // If preview somehow appears mid-drag, cancel cleanly
  new MutationObserver(() => { if (isPreviewOpen() && (!st || st.lifted)) {/* noop */} })
    .observe(document.body, { childList:true, subtree:true });

  document.addEventListener('pointerdown', onDown, { passive:false });
  console.log('[DRAG] enabled with 500% hold-preview');
});