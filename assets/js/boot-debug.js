// boot-debug.js
console.log("[BRIDGE] Drag/Preview bridge (no-clone) loaded");

/* ---------- Tunables ---------- */
const DRAG_THRESHOLD       = 8;      // px to start drag during press
const PREVIEW_DELAY_MS     = 260;    // press & hold time
const PREVIEW_CANCEL_DIST  = 30;     // wiggle allowed during preview
const PREVIEW_SCALE        = 2.5;    // 250% preview
const PREVIEW_EASE_MS      = 140;    // zoom ease
const FOLLOW_DAMP          = 0.28;   // drag smoothing (lower = tighter)
/* -------------------------------- */

let dragLayer = null;

// Ensure we have the minimal CSS needed even if component.css is stale
(function injectSafetyCSS(){
  const id = "drag-safety-css";
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = `
    .card.is-pressing { transition: none !important; }
    .card.is-previewing {
      pointer-events: none !important;
      will-change: transform, filter;
      z-index: 2147483000 !important;
    }
    .card.is-dragging {
      position: fixed !important;
      left: 0 !important; top: 0 !important;
      transform: translate3d(var(--drag-x,0px), var(--drag-y,0px), 0) !important;
      pointer-events: none !important;
      will-change: transform, filter;
      z-index: 2147483000 !important;
    }
  `;
  document.head.appendChild(s);
})();

const st = {
  mode: "idle",    // "idle" | "press" | "preview" | "drag"
  pid: null,
  card: null,

  // press
  downX: 0, downY: 0,
  pressTimer: 0,

  // preview/drag shared
  originParent: null,
  originNext:   null,
  placeholder:  null,
  restore:      null,

  // cancel hysteresis
  cancelArmed: 0,

  // drag
  curX: 0, curY: 0,
  targetX: 0, targetY: 0,
  offsetX: 0, offsetY: 0,
  raf: 0
};

function initBridge(){
  dragLayer = document.querySelector(".drag-layer");
  if (!dragLayer) {
    dragLayer = document.createElement("div");
    dragLayer.className = "drag-layer";
    Object.assign(dragLayer.style, {
      position: "fixed", inset: 0, pointerEvents: "none",
      zIndex: 2147483000
    });
    document.body.appendChild(dragLayer);
  }

  addEventListener("pointerdown", onDown, {passive:false});
  addEventListener("pointermove", onMove, {passive:false});
  addEventListener("pointerup", onUp, {passive:false});
  addEventListener("pointercancel", onUp, {passive:false});
  addEventListener("blur", onUp);
}

function reset(){
  clearTimeout(st.pressTimer);
  cancelAnimationFrame(st.raf);
  // restore touch-action if we disabled it
  document.documentElement.style.removeProperty("touch-action");
  st.placeholder?.remove();
  st.placeholder = null;
  st.card = null;
  st.mode = "idle";
  st.pid = null;
  st.cancelArmed = 0;
}

/* ---------- Handlers ---------- */

function onDown(e){
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try { card.setPointerCapture(e.pointerId); } catch {}

  st.mode  = "press";
  st.pid   = e.pointerId;
  st.card  = card;
  st.downX = e.pageX;
  st.downY = e.pageY;
  st.cancelArmed = 0;

  card.classList.add("is-pressing");

  st.pressTimer = setTimeout(() => {
    if (st.mode === "press") enterPreview(card);
  }, PREVIEW_DELAY_MS);
}

function onMove(e){
  if (st.pid !== e.pointerId || st.mode === "idle") return;

  const dx = e.pageX - st.downX;
  const dy = e.pageY - st.downY;
  const dist = Math.hypot(dx, dy);

  if (st.mode === "press") {
    if (dist > DRAG_THRESHOLD) enterDragFromPress(e);
    return;
  }

  if (st.mode === "preview") {
    // hysteresis: need to exceed threshold on two consecutive moves
    if (dist > PREVIEW_CANCEL_DIST) {
      if (++st.cancelArmed >= 2) handoffPreviewToDrag(e);
    } else {
      st.cancelArmed = 0;
    }
    return;
  }

  if (st.mode === "drag") {
    st.targetX = e.pageX - st.offsetX;
    st.targetY = e.pageY - st.offsetY;
  }
}

function onUp(e){
  if (st.pid !== e.pointerId) return;

  if (st.mode === "preview") {
    leavePreview(st.card);
    reset();
    return;
  }

  if (st.mode === "drag") {
    endDrag();
    reset();
    return;
  }

  // simple press release
  st.card?.classList.remove("is-pressing");
  reset();
}

/* ---------- Preview (same node) ---------- */

function enterPreview(card){
  // measure BEFORE moving/transforming
  const r = card.getBoundingClientRect();

  // keep ribbon layout
  st.originParent = card.parentNode;
  st.originNext   = card.nextSibling;
  const ph = document.createElement("div");
  ph.style.width  = r.width + "px";
  ph.style.height = r.height + "px";
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // save inline to restore
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

  // reparent to the global fixed layer FIRST (prevents transform containing block issues)
  dragLayer.appendChild(card);

  st.mode = "preview";
  card.classList.remove("is-pressing");
  card.classList.add("is-previewing");

  Object.assign(card.style, {
    position: "fixed",
    left: `${r.left}px`,
    top:  `${r.top}px`,
    width: `${r.width}px`,
    height:`${r.height}px`,
    transition: `transform ${PREVIEW_EASE_MS}ms ease`,
    transformOrigin: "50% 50%"
  });

  // one smooth zoom
  // (force reflow so the transition starts)
  void card.offsetWidth;
  card.style.transform = `translate3d(0,0,0) scale(${PREVIEW_SCALE})`;
  card.style.filter = "drop-shadow(0 18px 38px rgba(0,0,0,.35))";

  // avoid iOS long-press text selection / scroll
  document.documentElement.style.touchAction = "none";
}

function leavePreview(card){
  // shrink back immediately (no flicker)
  card.style.transition = "transform 90ms ease";
  card.style.transform  = "translate3d(0,0,0) scale(1)";
  card.style.filter     = "";

  requestAnimationFrame(() => {
    restoreToRibbon(card);
    card.classList.remove("is-previewing");
    card.style.removeProperty("transform-origin");
  });
}

function restoreToRibbon(card){
  const s = st.restore || {};
  if (st.placeholder && st.originParent) {
    st.originParent.insertBefore(card, st.placeholder);
  }
  card.style.position   = s.position ?? "";
  card.style.left       = s.left ?? "";
  card.style.top        = s.top ?? "";
  card.style.width      = s.width ?? "";
  card.style.height     = s.height ?? "";
  card.style.transform  = s.transform ?? "";
  card.style.filter     = s.filter ?? "";
  card.style.zIndex     = s.zIndex ?? "";
  card.style.transition = s.transition ?? "";
  st.placeholder?.remove();
  st.placeholder = null;
}

/* ---------- Drag ---------- */

function enterDragFromPress(e){
  clearTimeout(st.pressTimer);
  st.card.classList.remove("is-pressing");

  const r = st.card.getBoundingClientRect();
  startDragAtRect(e, r, /*cameFromPreview=*/false);
}

function handoffPreviewToDrag(e){
  const card = st.card;

  // kill transition, snap scale to 1 without animating (prevents jitter)
  card.style.transition = "none";
  card.style.transform  = "translate3d(0,0,0) scale(1)";
  card.style.filter     = "";
  void card.offsetWidth; // reflow to commit

  const r = card.getBoundingClientRect();
  card.classList.remove("is-previewing");
  card.style.removeProperty("transform-origin");
  document.documentElement.style.removeProperty("touch-action");

  startDragAtRect(e, r, /*cameFromPreview=*/true);
}

function startDragAtRect(e, rect, cameFromPreview){
  const card = st.card;

  if (!cameFromPreview) {
    // create placeholder & move to layer now
    st.originParent = card.parentNode;
    st.originNext   = card.nextSibling;
    const ph = document.createElement("div");
    ph.style.width  = rect.width + "px";
    ph.style.height = rect.height + "px";
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
    else st.originParent.appendChild(ph);

    dragLayer.appendChild(card);
  }

  // set fixed baseline and CSS vars BEFORE drag class to avoid (0,0) flash
  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  st.offsetX = e.pageX - pageLeft;
  st.offsetY = e.pageY - pageTop;

  st.curX = pageLeft;
  st.curY = pageTop;
  st.targetX = pageLeft;
  st.targetY = pageTop;

  card.style.position = "fixed";
  card.style.left = "0";
  card.style.top  = "0";
  card.style.setProperty("--drag-x", `${st.curX}px`);
  card.style.setProperty("--drag-y", `${st.curY}px`);

  card.classList.add("is-dragging");
  follow();
}

function follow(){
  if (st.mode !== "drag") return;
  st.curX += (st.targetX - st.curX) * FOLLOW_DAMP;
  st.curY += (st.targetY - st.curY) * FOLLOW_DAMP;
  const c = st.card;
  c.style.setProperty("--drag-x", `${st.curX}px`);
  c.style.setProperty("--drag-y", `${st.curY}px`);
  st.raf = requestAnimationFrame(follow);
}

function endDrag(){
  const c = st.card;
  c.classList.remove("is-dragging");
  c.style.removeProperty("--drag-x");
  c.style.removeProperty("--drag-y");
  c.style.left = c.style.top = c.style.position = "";

  if (st.placeholder && st.originParent) {
    st.originParent.insertBefore(c, st.placeholder);
    st.placeholder.remove();
  }
}

/* ---------- init ---------- */
window.addEventListener("DOMContentLoaded", initBridge);