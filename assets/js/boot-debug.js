// boot-debug.js
console.log("[BRIDGE] Drag/Preview bridge (no-clone, jitter-smoothed) loaded");

/* -------------------- Tunables -------------------- */
const DRAG_THRESHOLD       = 9;     // px from press to begin drag (direct)
const PREVIEW_DELAY_MS     = 280;   // hold to preview
const PREVIEW_CANCEL_DIST  = 36;    // wiggle allowed while previewing
const PREVIEW_HYSTERESIS   = 2;     // consecutive over-threshold moves to cancel preview
const PREVIEW_SCALE        = 2.5;   // 250% preview
const PREVIEW_EASE_MS_IN   = 160;   // grow ease (slightly longer for buttery feel)
const PREVIEW_EASE_MS_OUT  = 100;   // shrink ease
const FOLLOW_DAMP          = 0.30;  // drag smoothing (lower = tighter)
/* -------------------------------------------------- */

let layer = null;

(function injectCSS(){
  const id = "drag-safety-css";
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = `
    .card { -webkit-tap-highlight-color: transparent; backface-visibility: hidden; }
    .card.is-pressing { transition: none !important; }
    .card.is-previewing {
      pointer-events: none !important;
      will-change: transform, filter;
      z-index: 2147483000 !important;
      transform: translateZ(0); /* promote to its own layer */
    }
    .card.is-dragging {
      position: fixed !important;
      left: 0 !important; top: 0 !important;
      transform: translate3d(var(--drag-x,0px), var(--drag-y,0px), 0) !important;
      pointer-events: none !important;
      will-change: transform, filter;
      z-index: 2147483000 !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(s);
})();

const st = {
  mode: "idle",      // idle | press | preview | drag
  touchLock: false,
  pid: null,
  card: null,

  // press
  downX: 0, downY: 0,
  pressTimer: 0,

  // preview/drag
  originParent: null,
  originNext: null,
  placeholder: null,

  cancelArmed: 0,

  // drag
  curX: 0, curY: 0,
  targetX: 0, targetY: 0,
  offsetX: 0, offsetY: 0,
  raf: 0
};

function init() {
  layer = document.querySelector(".drag-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "drag-layer";
    Object.assign(layer.style, {
      position: "fixed", inset: 0, pointerEvents: "none",
      zIndex: 2147483000
    });
    document.body.appendChild(layer);
  }

  addEventListener("pointerdown", onDown, { passive: false });
  addEventListener("pointermove", onMove, { passive: false });
  addEventListener("pointerup", hardFinalize, { passive: false });
  addEventListener("pointercancel", hardFinalize, { passive: false });
  addEventListener("visibilitychange", () => { if (document.hidden) hardFinalize(); });
  addEventListener("blur", hardFinalize);
}

function hardFinalize() {
  if (!st.card) { reset(); return; }

  try { st.card.releasePointerCapture(st.pid); } catch {}
  clearTimeout(st.pressTimer);
  cancelAnimationFrame(st.raf);
  document.documentElement.style.removeProperty("touch-action");

  const c = st.card;

  c.classList.remove("is-pressing", "is-previewing", "is-dragging");
  c.style.removeProperty("transform");
  c.style.removeProperty("filter");
  c.style.removeProperty("transition");
  c.style.removeProperty("left");
  c.style.removeProperty("top");
  c.style.removeProperty("width");
  c.style.removeProperty("height");
  c.style.removeProperty("position");
  c.style.removeProperty("--drag-x");
  c.style.removeProperty("--drag-y");
  c.style.removeProperty("transform-origin");
  c.style.removeProperty("will-change");
  c.style.removeProperty("contain");
  c.style.removeProperty("backface-visibility");

  if (st.placeholder && st.originParent) {
    st.originParent.insertBefore(c, st.placeholder);
    st.placeholder.remove();
  }

  reset();
}

function reset() {
  clearTimeout(st.pressTimer);
  cancelAnimationFrame(st.raf);
  st.mode = "idle";
  st.touchLock = false;
  st.pid = null;
  st.card = null;
  st.placeholder = null;
  st.originParent = null;
  st.originNext = null;
  st.cancelArmed = 0;
}

/* -------------------- Handlers -------------------- */

function onDown(e) {
  if (st.touchLock) return;
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button === 2) return;

  e.preventDefault();
  st.touchLock = true;
  st.pid = e.pointerId;
  st.card = card;
  st.mode = "press";
  st.downX = e.pageX;
  st.downY = e.pageY;
  st.cancelArmed = 0;

  try { card.setPointerCapture(st.pid); } catch {}
  card.classList.add("is-pressing");

  st.pressTimer = setTimeout(() => {
    if (st.mode === "press") enterPreview(card);
  }, PREVIEW_DELAY_MS);
}

function onMove(e) {
  if (st.mode === "idle" || e.pointerId !== st.pid) return;

  const dx = e.pageX - st.downX;
  const dy = e.pageY - st.downY;
  const dist = Math.hypot(dx, dy);

  if (st.mode === "press") {
    if (dist > DRAG_THRESHOLD) enterDragFromPress(e);
    return;
  }

  if (st.mode === "preview") {
    if (dist > PREVIEW_CANCEL_DIST) {
      if (++st.cancelArmed >= PREVIEW_HYSTERESIS) handoffPreviewToDrag(e);
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

/* -------------------- Preview (jitter-smoothed) -------------------- */

function enterPreview(card) {
  const r = card.getBoundingClientRect();

  st.originParent = card.parentNode;
  st.originNext   = card.nextSibling;

  // placeholder keeps ribbon spacing
  const ph = document.createElement("div");
  ph.style.width = r.width + "px";
  ph.style.height = r.height + "px";
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // reparent first
  layer.appendChild(card);

  st.mode = "preview";
  card.classList.remove("is-pressing");
  card.classList.add("is-previewing");

  // Baseline fixed position & no transition; lock to GPU
  Object.assign(card.style, {
    position: "fixed",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    transformOrigin: "50% 50%",
    transition: "none",
    willChange: "transform, filter",
    contain: "layout style paint",
    backfaceVisibility: "hidden"
  });

  // Double-RAF to avoid the “pop then shrink” on mobile reparenting
  requestAnimationFrame(() => {
    // Frame A: explicitly set scale(1) so the next transition has a clear start
    card.style.transform = "translate3d(0,0,0) scale(1)";
    card.style.filter = "";
    requestAnimationFrame(() => {
      // Frame B: now enable transition and grow
      card.style.transition = `transform ${PREVIEW_EASE_MS_IN}ms ease, filter ${PREVIEW_EASE_MS_IN}ms ease`;
      card.style.transform  = `translate3d(0,0,0) scale(${PREVIEW_SCALE})`;
      card.style.filter     = "drop-shadow(0 18px 38px rgba(0,0,0,.35))";
    });
  });

  document.documentElement.style.touchAction = "none";
}

function leavePreview(card, cb) {
  // shrink smoothly, then restore to ribbon
  card.style.transition = `transform ${PREVIEW_EASE_MS_OUT}ms ease`;
  // keep transform base to avoid sudden snap
  card.style.transform = "translate3d(0,0,0) scale(1)";
  card.style.filter = "";

  const onEnd = () => {
    card.removeEventListener("transitionend", onEnd);
    restoreToRibbon(card);
    card.classList.remove("is-previewing");
    card.style.removeProperty("transform-origin");
    cb && cb();
  };
  const failSafe = setTimeout(onEnd, PREVIEW_EASE_MS_OUT + 60);
  card.addEventListener("transitionend", () => { clearTimeout(failSafe); onEnd(); });
}

function restoreToRibbon(card) {
  if (st.placeholder && st.originParent) {
    st.originParent.insertBefore(card, st.placeholder);
  }
  card.style.removeProperty("position");
  card.style.removeProperty("left");
  card.style.removeProperty("top");
  card.style.removeProperty("width");
  card.style.removeProperty("height");
  card.style.removeProperty("transition");
  card.style.removeProperty("transform");
  card.style.removeProperty("filter");
  card.style.removeProperty("will-change");
  card.style.removeProperty("contain");
  card.style.removeProperty("backface-visibility");
  st.placeholder?.remove();
  st.placeholder = null;
  document.documentElement.style.removeProperty("touch-action");
}

/* -------------------- Drag -------------------- */

function enterDragFromPress(e) {
  clearTimeout(st.pressTimer);
  st.card.classList.remove("is-pressing");

  const r = st.card.getBoundingClientRect();
  prepareDragWithRect(e, r, /*wasPreview*/ false);
}

function handoffPreviewToDrag(e) {
  const card = st.card;
  // freeze current preview frame before switching
  card.style.transition = "none";
  card.style.transform = "translate3d(0,0,0) scale(1)";
  card.style.filter = "";
  void card.offsetWidth;
  card.classList.remove("is-previewing");
  document.documentElement.style.removeProperty("touch-action");

  const r = card.getBoundingClientRect();
  prepareDragWithRect(e, r, /*wasPreview*/ true);
}

function prepareDragWithRect(e, rect, wasPreview) {
  const card = st.card;

  if (!wasPreview) {
    // create placeholder & reparent now
    st.originParent = card.parentNode;
    st.originNext   = card.nextSibling;
    const ph = document.createElement("div");
    ph.style.width  = rect.width + "px";
    ph.style.height = rect.height + "px";
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
    else st.originParent.appendChild(ph);
    layer.appendChild(card);
  }

  const pageLeft = rect.left + window.scrollX;
  const pageTop  = rect.top  + window.scrollY;

  st.offsetX = e.pageX - pageLeft;
  st.offsetY = e.pageY - pageTop;

  st.curX = pageLeft;
  st.curY = pageTop;
  st.targetX = pageLeft;
  st.targetY = pageTop;

  Object.assign(card.style, { position: "fixed", left: "0px", top: "0px" });
  card.style.setProperty("--drag-x", `${st.curX}px`);
  card.style.setProperty("--drag-y", `${st.curY}px`);

  card.classList.add("is-dragging");
  st.mode = "drag";
  follow();
}

function follow() {
  if (st.mode !== "drag" || !st.card) return;
  st.curX += (st.targetX - st.curX) * FOLLOW_DAMP;
  st.curY += (st.targetY - st.curY) * FOLLOW_DAMP;
  st.card.style.setProperty("--drag-x", `${st.curX}px`);
  st.card.style.setProperty("--drag-y", `${st.curY}px`);
  st.raf = requestAnimationFrame(follow);
}

/* ------------------------------------------------ */

window.addEventListener("pointerup", hardFinalize, { passive: false });
window.addEventListener("pointercancel", hardFinalize, { passive: false });
window.addEventListener("DOMContentLoaded", init);