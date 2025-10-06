// boot-debug.js — stable drag + in-place preview (200%)
console.log("[BRIDGE] Game + UI + Drag initialized");

let st = null;
let dragLayer = null;

// Tunables
const HOLD_MS        = 260;  // long-press time to preview
const MOVE_CANCEL    = 12;   // px tolerance while holding
const DRAG_THRESHOLD = 14;   // distance to begin drag
const FOLLOW_DAMP    = 0.25; // easing for follow loop

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
  // only left/primary
  if (e.button !== 0) return;

  const card = e.target.closest('.ribbon .card');
  if (!card) return;

  e.preventDefault();
  try{ card.setPointerCapture(e.pointerId); }catch{}

  // measure visual position (never subtract transforms ourselves)
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

    // keep exact finger offset inside the card
    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,

    // current/target used by the follow loop
    curX: pageLeft, curY: pageTop,
    targetX: pageLeft, targetY: pageTop,

    lifted: false,
    previewing: false,
    holdTimer: null,

    originParent: card.parentNode,
    originNext: card.nextSibling,
    placeholder: null
  };

  // Make press look like hover + freeze transitions
  card.classList.add('is-pressing');

  // schedule preview if the finger stays mostly still
  st.holdTimer = setTimeout(()=>{
    if (!st || st.lifted) return;
    card.classList.add('is-previewing');
    st.previewing = true;
  }, HOLD_MS);
}

function lift(){
  if (!st || st.lifted) return;
  const { card, originParent, originNext } = st;

  // re-measure right before moving
  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  // placeholder to preserve hand spacing
  const ph = document.createElement('div');
  ph.style.width  = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (originNext) originParent.insertBefore(ph, originNext);
  else originParent.appendChild(ph);

  // IMPORTANT: set CSS vars BEFORE adding .is-dragging or moving node
  card.style.setProperty('--drag-x', `${pageLeft}px`);
  card.style.setProperty('--drag-y', `${pageTop}px`);

  card.classList.remove('is-pressing', 'is-previewing');
  st.previewing = false;

  card.classList.add('is-dragging');
  dragLayer.appendChild(card);

  // initialize follow state
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

  // cancel preview if we move too much while holding
  if (!st.lifted && st.previewing && dist > MOVE_CANCEL){
    st.card.classList.remove('is-previewing');
    st.previewing = false;
  }

  // begin drag after threshold
  if (!st.lifted && dist > DRAG_THRESHOLD){
    clearTimeout(st.holdTimer);
    lift();
  }
  if (!st.lifted) return;

  // keep the exact grab point under the finger
  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;

  e.preventDefault();
}

function onUp(){
  if (!st) return;
  clearTimeout(st.holdTimer);

  const { card, originParent, placeholder } = st;

  // restore to hand if dragging
  if (card.classList.contains('is-dragging')){
    card.classList.remove('is-dragging');
    card.style.removeProperty('--drag-x');
    card.style.removeProperty('--drag-y');
    if (placeholder && originParent){
      originParent.insertBefore(card, placeholder);
      placeholder.remove();
    }
  }

  // end preview if any
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