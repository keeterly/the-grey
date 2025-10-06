// boot-debug.js
console.log("[BRIDGE] UI Drag/Preview bridge loaded");

/* ---------------------------
   Tunables
--------------------------- */
const DRAG_THRESHOLD         = 8;     // px before we decide you are dragging
const PREVIEW_DELAY_MS       = 260;   // hold time to enter preview
const PREVIEW_CANCEL_DIST    = 18;    // px you can wiggle in preview before we handoff to drag
const PREVIEW_SCALE          = 2.5;   // 250%
const PREVIEW_EASE_MS        = 120;   // ease into preview
const FOLLOW_DAMP            = 0.28;  // drag smoothing
/* ------------------------- */

let dragLayer = null;

// Single state object
const st = {
  mode: "idle",                // "idle" | "press" | "preview" | "drag"
  pid: null,
  card: null,

  // press
  downX: 0, downY: 0,          // page coords at pointerdown
  pressTimer: 0,

  // preview
  restore: null,               // original inline styles to restore
  fixedLeft: 0, fixedTop: 0,   // where the fixed card sits

  // drag
  curX: 0, curY: 0,
  targetX: 0, targetY: 0,
  offsetX: 0, offsetY: 0,
  originParent: null,
  originNext: null,
  placeholder: null,
  raf: 0
};

function initDragBridge(){
  // drag layer
  dragLayer = document.querySelector('.drag-layer');
  if(!dragLayer){
    dragLayer = document.createElement('div');
    dragLayer.className = 'drag-layer';
    Object.assign(dragLayer.style, {
      position:'fixed', inset:0, pointerEvents:'none', zIndex: 2147483000
    });
    document.body.appendChild(dragLayer);
  }

  // capture moves at document level
  addEventListener('pointerdown', onDown, {passive:false});
  addEventListener('pointermove', onMove, {passive:false});
  addEventListener('pointerup',   onUp,   {passive:false});
  addEventListener('pointercancel', onUp, {passive:false});
  addEventListener('blur', onUp);
}

function resetState(){
  clearTimeout(st.pressTimer);
  cancelAnimationFrame(st.raf);
  Object.assign(st, {
    mode:"idle", pid:null, card:null, pressTimer:0,
    restore:null, fixedLeft:0, fixedTop:0,
    curX:0, curY:0, targetX:0, targetY:0,
    offsetX:0, offsetY:0, originParent:null, originNext:null, placeholder:null
  });
}

/* ---------------------------
   Pointer handlers
--------------------------- */
function onDown(e){
  // Only start from hand cards
  const card = e.target.closest('.ribbon .card');
  if(!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  const r = card.getBoundingClientRect();
  st.mode = "press";
  st.pid = e.pointerId;
  st.card = card;
  st.downX = e.pageX;
  st.downY = e.pageY;

  // “press pose” matches your hover pose (no drop)
  card.classList.add('is-pressing');

  // schedule preview
  st.pressTimer = setTimeout(() => {
    if(st.mode === "press"){
      enterPreview(card, r);
    }
  }, PREVIEW_DELAY_MS);
}

function onMove(e){
  if(st.pid !== e.pointerId || st.mode === "idle") return;

  const dx = e.pageX - st.downX;
  const dy = e.pageY - st.downY;
  const dist = Math.hypot(dx, dy);

  if(st.mode === "press"){
    if(dist > DRAG_THRESHOLD){
      // start drag immediately (no preview)
      enterDragFromPress(e);
    }
    return;
  }

  if(st.mode === "preview"){
    // allow small wiggle; beyond that, handoff to drag
    if(dist > PREVIEW_CANCEL_DIST){
      handoffPreviewToDrag(e);
    }
    return;
  }

  if(st.mode === "drag"){
    st.targetX = e.pageX - st.offsetX;
    st.targetY = e.pageY - st.offsetY;
  }
}

function onUp(e){
  if(st.pid !== e.pointerId) return;

  if(st.mode === "preview"){
    leavePreview(st.card);
  } else if(st.mode === "drag"){
    endDrag();
  } else {
    // press but not moved nor previewed
    st.card?.classList.remove('is-pressing');
  }
  resetState();
}

/* ---------------------------
   Preview (same DOM node)
--------------------------- */
function enterPreview(card, rect){
  // capture original inline styles to restore 1:1 later
  st.restore = {
    position: card.style.position,
    left:     card.style.left,
    top:      card.style.top,
    width:    card.style.width,
    height:   card.style.height,
    transform:card.style.transform,
    filter:   card.style.filter,
    zIndex:   card.style.zIndex,
    transition: card.style.transition
  };

  st.mode = "preview";

  const {left, top, width, height} = rect;
  st.fixedLeft = left;
  st.fixedTop  = top;

  // take the card out of flow exactly where it is
  Object.assign(card.style, {
    position:'fixed',
    left: `${left}px`,
    top:  `${top}px`,
    width: `${width}px`,
    height:`${height}px`,
    zIndex: '2147483000',
    transition: `transform ${PREVIEW_EASE_MS}ms ease`
  });

  card.classList.remove('is-pressing');
  card.classList.add('is-previewing');
  card.style.transformOrigin = '50% 50%';
  card.style.transform = `translate3d(0,0,0) scale(${PREVIEW_SCALE})`;
  card.style.filter = 'drop-shadow(0 18px 38px rgba(0,0,0,.35))';

  // iOS: prevent inadvertent page scroll during long-press
  document.documentElement.style.touchAction = 'none';
}

function leavePreview(card){
  if(st.mode !== "preview") return;

  // quick unscale, then restore inline styles on next frame
  card.style.transition = 'transform 90ms ease';
  card.style.transform = 'translate3d(0,0,0) scale(1)';
  card.style.filter = '';

  requestAnimationFrame(() => {
    const s = st.restore || {};
    card.style.position   = s.position ?? '';
    card.style.left       = s.left ?? '';
    card.style.top        = s.top ?? '';
    card.style.width      = s.width ?? '';
    card.style.height     = s.height ?? '';
    card.style.zIndex     = s.zIndex ?? '';
    card.style.transition = s.transition ?? '';
    card.style.transform  = s.transform ?? '';
    card.style.filter     = s.filter ?? '';
    card.classList.remove('is-previewing');
    card.style.removeProperty('transform-origin');
    document.documentElement.style.removeProperty('touch-action');
  });
}

/* ---------------------------
   Drag (real-node, smooth follow)
--------------------------- */
function enterDragFromPress(e){
  const card = st.card;
  if(!card) return;

  clearTimeout(st.pressTimer);
  card.classList.remove('is-pressing');

  const r = card.getBoundingClientRect();
  actuallyEnterDrag(e, card, r);
}

function handoffPreviewToDrag(e){
  // we are currently fixed & scaled. First, restore to 1:1 fixed at same spot,
  // then convert into the drag flow so there is no flicker.
  const card = st.card;
  if(!card) return;

  // unscale visually but keep it fixed this frame
  card.style.transition = 'transform 90ms ease';
  card.style.transform  = 'translate3d(0,0,0) scale(1)';
  card.style.filter     = '';

  // next frame, compute rect and enter drag
  requestAnimationFrame(() => {
    card.classList.remove('is-previewing');
    card.style.removeProperty('transform-origin');
    document.documentElement.style.removeProperty('touch-action');

    const r = card.getBoundingClientRect();
    leaveFixedRestoreInline(card);            // put back original inline styles
    actuallyEnterDrag(e, card, r);
  });
}

function leaveFixedRestoreInline(card){
  const s = st.restore || {};
  card.style.position   = s.position ?? '';
  card.style.left       = s.left ?? '';
  card.style.top        = s.top ?? '';
  card.style.width      = s.width ?? '';
  card.style.height     = s.height ?? '';
  card.style.zIndex     = s.zIndex ?? '';
  card.style.transition = s.transition ?? '';
  card.style.transform  = s.transform ?? '';
  card.style.filter     = s.filter ?? '';
}

function actuallyEnterDrag(e, card, rect){
  st.mode = "drag";

  // keep spacing in the ribbon
  st.originParent = card.parentNode;
  st.originNext   = card.nextSibling;
  const ph = document.createElement('div');
  ph.style.width = rect.width + 'px';
  ph.style.height = rect.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if(st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // starting position & grip offset
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;
  st.offsetX = e.pageX - pageLeft;
  st.offsetY = e.pageY - pageTop;

  st.curX = pageLeft;
  st.curY = pageTop;
  st.targetX = pageLeft;
  st.targetY = pageTop;

  // hand to drag layer; note: pointer-events:none on layer so hit-testing slots still works
  dragLayer.appendChild(card);
  card.classList.add('is-dragging');
  card.style.setProperty('--drag-x', `${st.curX}px`);
  card.style.setProperty('--drag-y', `${st.curY}px`);

  follow();
}

function follow(){
  if(st.mode !== "drag") return;
  st.curX += (st.targetX - st.curX) * FOLLOW_DAMP;
  st.curY += (st.targetY - st.curY) * FOLLOW_DAMP;
  const c = st.card;
  c.style.setProperty('--drag-x', `${st.curX}px`);
  c.style.setProperty('--drag-y', `${st.curY}px`);
  st.raf = requestAnimationFrame(follow);
}

function endDrag(){
  const c = st.card;
  c.classList.remove('is-dragging');
  c.style.removeProperty('--drag-x');
  c.style.removeProperty('--drag-y');

  // return to hand at placeholder
  if(st.placeholder && st.originParent){
    st.originParent.insertBefore(c, st.placeholder);
    st.placeholder.remove();
  }
}

/* --------------------------- */
window.addEventListener('DOMContentLoaded', initDragBridge);