// boot-debug.js — stable in-place preview + accurate drag pickup
console.log("[BRIDGE] Drag bridge init");

let st = null;
let dragLayer = null;

// Tunables (slightly more forgiving hold)
const HOLD_MS        = 260;  // time to trigger preview
const MOVE_CANCEL    = 14;   // px you can wiggle during hold
const DRAG_THRESHOLD = 14;   // distance to become drag
const FOLLOW_DAMP    = 0.25; // easing for follow

function ensureDragLayer(){
  dragLayer = document.querySelector('.drag-layer');
  if (!dragLayer){
    dragLayer = document.createElement('div');
    dragLayer.className = 'drag-layer';
    document.body.appendChild(dragLayer);
  }
}

function initDragBridge(){
  ensureDragLayer();
  document.addEventListener('pointerdown', onDown, {passive:false});
  document.addEventListener('pointermove', onMove, {passive:false});
  document.addEventListener('pointerup',   onUp,   {passive:false});
  document.addEventListener('pointercancel', onUp, {passive:false});
  window.addEventListener('blur', onUp);
}

function onDown(e){
  if (e.button !== 0) return;

  const card = e.target.closest('.ribbon .card');
  if (!card) return;

  e.preventDefault();
  try{ card.setPointerCapture(e.pointerId); }catch{}

  const rect = card.getBoundingClientRect();
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  st = {
    pid: e.pointerId,
    card,
    startPageX: e.pageX,
    startPageY: e.pageY,
    lastPageX: e.pageX,
    lastPageY: e.pageY,

    // exact finger offset within the visual card
    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,

    // follow state
    curX: pageLeft, curY: pageTop,
    targetX: pageLeft, targetY: pageTop,

    lifted: false,
    previewing: false,
    holdTimer: null,

    originParent: card.parentNode,
    originNext: card.nextSibling,
    placeholder: null
  };

  card.classList.add('is-pressing');

  // Long-press to preview in place
  st.holdTimer = setTimeout(()=>{
    if (!st || st.lifted) return;
    card.classList.add('is-previewing');
    st.previewing = true;
  }, HOLD_MS);
}

function beginDragFromCurrentVisual(){
  const { card } = st;

  // measure the card WHERE IT VISUALLY IS (even if previewing)
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  // set vars BEFORE reparenting so there is no (0,0) frame
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

  // placeholder so hand keeps spacing
  const ph = document.createElement('div');
  ph.style.width  = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // switch classes, stop preview pose
  card.classList.remove('is-pressing', 'is-previewing');
  st.previewing = false;
  card.classList.add('is-dragging');

  // move to drag layer
  dragLayer.appendChild(card);

  // init follow state from the visual page coords
  st.curX = st.targetX = pageLeft;
  st.curY = st.targetY = pageTop;
  st.lifted = true;
  smoothFollow();
}

function onMove(e){
  if (!st) return;

  st.lastPageX = e.pageX;
  st.lastPageY = e.pageY;

  const dx = e.pageX - st.startPageX;
  const dy = e.pageY - st.startPageY;
  const dist = Math.hypot(dx, dy);

  // Cancel preview if finger moves too much
  if (!st.lifted && st.previewing && dist > MOVE_CANCEL){
    st.card.classList.remove('is-previewing');
    st.previewing = false;
  }

  // Start dragging
  if (!st.lifted && dist > DRAG_THRESHOLD){
    clearTimeout(st.holdTimer);
    beginDragFromCurrentVisual();
  }
  if (!st.lifted) return;

  // Follow finger; keep exact grab point under it
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;

  e.preventDefault();
}

function onUp(){
  if (!st) return;
  clearTimeout(st.holdTimer);

  const { card, originParent, placeholder } = st;

  if (card.classList.contains('is-dragging')){
    card.classList.remove('is-dragging');
    card.style.removeProperty('--drag-x');
    card.style.removeProperty('--drag-y');
    if (placeholder && originParent){
      originParent.insertBefore(card, placeholder);
      placeholder.remove();
    }
  }

  card.classList.remove('is-previewing', 'is-pressing');
  st = null;
}

function smoothFollow(){
  if (!st || !st.lifted) return;

  st.curX += (st.targetX - st.curX) * FOLLOW_DAMP;
  st.curY += (st.targetY - st.curY) * FOLLOW_DAMP;

  st.card.style.setProperty('--drag-x', `${st.curX}px`);
  st.card.style.setProperty('--drag-y', `${st.curY}px`);

  requestAnimationFrame(smoothFollow);
}

window.initDragBridge = initDragBridge;
window.addEventListener('DOMContentLoaded', initDragBridge);