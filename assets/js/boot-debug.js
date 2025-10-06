// boot-debug.js
console.log("[BRIDGE] UI Drag/Preview bridge loaded");

/* ---------- Tunables ---------- */
const DRAG_THRESHOLD       = 8;      // px to start drag during press
const PREVIEW_DELAY_MS     = 260;    // hold time to preview
const PREVIEW_CANCEL_DIST  = 18;     // wiggle allowed in preview before drag
const PREVIEW_SCALE        = 2.5;    // 250%
const PREVIEW_EASE_MS      = 120;    // preview ease-in
const FOLLOW_DAMP          = 0.28;   // drag smoothing
/* -------------------------------- */

let dragLayer = null;

const st = {
  mode: "idle",            // "idle" | "press" | "preview" | "drag"
  pid: null,
  card: null,

  // press
  downX: 0, downY: 0,
  pressTimer: 0,

  // preview/drag shared
  originParent: null,
  originNext: null,
  placeholder: null,
  restore: null,           // original inline styles

  // drag
  curX: 0, curY: 0,
  targetX: 0, targetY: 0,
  offsetX: 0, offsetY: 0,
  raf: 0
};

function initDragBridge(){
  dragLayer = document.querySelector('.drag-layer');
  if(!dragLayer){
    dragLayer = document.createElement('div');
    dragLayer.className = 'drag-layer';
    Object.assign(dragLayer.style, {
      position:'fixed', inset:0,
      pointerEvents:'none', zIndex:2147483000
    });
    document.body.appendChild(dragLayer);
  }

  addEventListener('pointerdown', onDown, {passive:false});
  addEventListener('pointermove', onMove, {passive:false});
  addEventListener('pointerup', onUp, {passive:false});
  addEventListener('pointercancel', onUp, {passive:false});
  addEventListener('blur', onUp);
}

function resetState(){
  clearTimeout(st.pressTimer);
  cancelAnimationFrame(st.raf);
  Object.assign(st, {
    mode:"idle", pid:null, card:null,
    downX:0, downY:0, pressTimer:0,
    originParent:null, originNext:null, placeholder:null,
    restore:null,
    curX:0, curY:0, targetX:0, targetY:0, offsetX:0, offsetY:0, raf:0
  });
}

/* ---------- Handlers ---------- */
function onDown(e){
  const card = e.target.closest('.ribbon .card');
  if(!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  st.mode = "press";
  st.pid = e.pointerId;
  st.card = card;
  st.downX = e.pageX;
  st.downY = e.pageY;

  card.classList.add('is-pressing');

  st.pressTimer = setTimeout(() => {
    if(st.mode === "press") enterPreview(card);
  }, PREVIEW_DELAY_MS);
}

function onMove(e){
  if(st.pid !== e.pointerId || st.mode === "idle") return;

  const dx = e.pageX - st.downX;
  const dy = e.pageY - st.downY;
  const dist = Math.hypot(dx, dy);

  if(st.mode === "press"){
    if(dist > DRAG_THRESHOLD) enterDragFromPress(e);
    return;
  }

  if(st.mode === "preview"){
    if(dist > PREVIEW_CANCEL_DIST) handoffPreviewToDrag(e);
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
    st.card?.classList.remove('is-pressing');
  }
  resetState();
}

/* ---------- Preview (same node, reparented) ---------- */
function enterPreview(card){
  // measure BEFORE moving
  const r = card.getBoundingClientRect();

  // save inline styles to restore later
  st.restore = {
    position: card.style.position,
    left: card.style.left,
    top: card.style.top,
    width: card.style.width,
    height: card.style.height,
    transform: card.style.transform,
    filter: card.style.filter,
    zIndex: card.style.zIndex,
    transition: card.style.transition
  };

  // placeholder to keep ribbon layout
  st.originParent = card.parentNode;
  st.originNext   = card.nextSibling;
  const ph = document.createElement('div');
  ph.style.width  = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if(st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // RE-PARENT to global layer FIRST, then fix-position (avoids transform-containing block)
  dragLayer.appendChild(card);

  st.mode = "preview";
  card.classList.remove('is-pressing');
  card.classList.add('is-previewing');

  Object.assign(card.style, {
    position:'fixed',
    left: `${r.left}px`,
    top:  `${r.top}px`,
    width: `${r.width}px`,
    height:`${r.height}px`,
    zIndex:'2147483000',
    transition:`transform ${PREVIEW_EASE_MS}ms ease`
  });

  card.style.transformOrigin = '50% 50%';
  card.style.transform = `translate3d(0,0,0) scale(${PREVIEW_SCALE})`;
  card.style.filter = 'drop-shadow(0 18px 38px rgba(0,0,0,.35))';

  // stop iOS long-press scroll
  document.documentElement.style.touchAction = 'none';
}

function leavePreview(card){
  // shrink back to 1:1 quickly
  card.style.transition = 'transform 90ms ease';
  card.style.transform  = 'translate3d(0,0,0) scale(1)';
  card.style.filter     = '';

  requestAnimationFrame(() => {
    restoreToRibbon(card);           // back to original parent / inline
    card.classList.remove('is-previewing');
    card.style.removeProperty('transform-origin');
    document.documentElement.style.removeProperty('touch-action');
  });
}

function restoreToRibbon(card){
  const s = st.restore || {};
  // return to original parent at placeholder
  if(st.placeholder && st.originParent){
    st.originParent.insertBefore(card, st.placeholder);
  }
  // restore inline styles
  card.style.position   = s.position ?? '';
  card.style.left       = s.left ?? '';
  card.style.top        = s.top ?? '';
  card.style.width      = s.width ?? '';
  card.style.height     = s.height ?? '';
  card.style.transform  = s.transform ?? '';
  card.style.filter     = s.filter ?? '';
  card.style.zIndex     = s.zIndex ?? '';
  card.style.transition = s.transition ?? '';
  // remove placeholder
  st.placeholder?.remove();
  st.placeholder = null;
}

/* ---------- Drag ---------- */
function enterDragFromPress(e){
  clearTimeout(st.pressTimer);
  st.card.classList.remove('is-pressing');

  const r = st.card.getBoundingClientRect();
  previewToDrag(e, r, /*cameFromPreview=*/false);
}

function handoffPreviewToDrag(e){
  // currently fixed in dragLayer and scaled. Unscale first frame, then drag.
  const card = st.card;
  card.style.transition = 'transform 90ms ease';
  card.style.transform  = 'translate3d(0,0,0) scale(1)';
  card.style.filter     = '';

  requestAnimationFrame(() => {
    card.classList.remove('is-previewing');
    card.style.removeProperty('transform-origin');
    document.documentElement.style.removeProperty('touch-action');

    const r = card.getBoundingClientRect(); // fixed coords in viewport
    previewToDrag(e, r, /*cameFromPreview=*/true);
  });
}

function previewToDrag(e, rect, cameFromPreview){
  const card = st.card;

  // If we arrived from press (not preview), we must create placeholder + reparent now.
  if(!cameFromPreview){
    // placeholder
    st.originParent = card.parentNode;
    st.originNext   = card.nextSibling;
    const ph = document.createElement('div');
    ph.style.width  = rect.width + 'px';
    ph.style.height = rect.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if(st.originNext) st.originParent.insertBefore(ph, st.originNext);
    else st.originParent.appendChild(ph);

    // reparent to layer before any fixed/translate work
    dragLayer.appendChild(card);
  }

  st.mode = "drag";

  // page-space position & grip offset
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;
  st.offsetX = e.pageX - pageLeft;
  st.offsetY = e.pageY - pageTop;

  st.curX = pageLeft;
  st.curY = pageTop;
  st.targetX = pageLeft;
  st.targetY = pageTop;

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

  if(st.placeholder && st.originParent){
    st.originParent.insertBefore(c, st.placeholder);
    st.placeholder.remove();
  }
}

/* ---------- init ---------- */
window.addEventListener('DOMContentLoaded', initDragBridge);