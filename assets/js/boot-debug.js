/* eslint-disable */
console.log("[THE GREY][UI] Real-card hold-preview 2.5x; iOS cancel-proof; centered hand; dev drag toggle");

const HOLD_MS = 320;                    // time to hold before preview
const PREVIEW_MOVE_TOL = 24;            // allowed wiggle while waiting
const PREVIEW_SCALE = 2.5;              // 250%

// dev drag (enable with ?drag=1 or the toggle pill)
const LIFT_MOVE = 12;                   // start drag before preview
const CONVERT_MOVE = 18;                // preview -> drag

const RETURN_MS = 220;
const SNAP_MS   = 120;
const STIFFNESS = 0.34;
const DAMPING   = 0.22;

const dragDevOn = () =>
  /\bdrag=1\b/.test(location.search) ||
  localStorage.getItem("enableDragDev") === "1";

let st = null, raf = null, holdTimer = null, dragLayer = null, dragBtn = null;

function ensureDragLayer() {
  dragLayer = document.querySelector(".drag-layer");
  if (!dragLayer) {
    dragLayer = document.createElement("div");
    dragLayer.className = "drag-layer";
    Object.assign(dragLayer.style, {
      position: "fixed", inset: "0",
      pointerEvents: "none", zIndex: "2147483647"
    });
    document.body.appendChild(dragLayer);
  }
}

function addGlobals() {
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp, { passive: false });
  window.addEventListener("pointercancel", onCancel, { passive: false });
  window.addEventListener("blur", onUp, { passive: false });
  document.addEventListener("contextmenu", blockPreviewMenus, { passive: false });
  document.addEventListener("selectstart", blockPreviewMenus, { passive: false });
}
function removeGlobals() {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", onCancel);
  window.removeEventListener("blur", onUp);
  document.removeEventListener("contextmenu", blockPreviewMenus);
  document.removeEventListener("selectstart", blockPreviewMenus);
}

function blockPreviewMenus(e){
  if (st?.previewed && !st?.lifted) e.preventDefault();
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function animateTo(x, y, ms, done){
  if (!st) return;
  const sx = st.curX, sy = st.curY, dx = x - sx, dy = y - sy, t0 = performance.now();
  function step(t){
    if (!st) return;
    const p = Math.min(1, (t - t0) / ms), e = easeOutCubic(p);
    st.curX = sx + dx * e; st.curY = sy + dy * e;
    st.card.style.setProperty("--drag-x", `${st.curX}px`);
    st.card.style.setProperty("--drag-y", `${st.curY}px`);
    if (p < 1) requestAnimationFrame(step); else done && done();
  }
  requestAnimationFrame(step);
}

function safeReturn(card, parent, next, ph){
  try{
    if (ph && ph.parentNode){
      ph.parentNode.insertBefore(card, ph);
      ph.remove();
      return;
    }
  }catch{}
  if (parent && parent.isConnected){
    try{
      if (next && next.parentNode === parent) parent.insertBefore(card, next);
      else parent.appendChild(card);
      return;
    }catch{}
  }
  document.getElementById("ribbon")?.appendChild(card);
}

/* ---------- Real-card preview ---------- */
function applyPreview(card){
  document.documentElement.style.touchAction = "none";
  card.dataset.previewing = "1";
  card.classList.add("is-previewing");
  card.style.setProperty("--preview-scale", PREVIEW_SCALE);
  card.style.setProperty("transform-origin", "50% 50%", "important");
  card.style.setProperty("transform", `translate3d(0,-14px,0) scale(${PREVIEW_SCALE})`, "important");
  card.style.setProperty("filter", "drop-shadow(0 16px 36px rgba(0,0,0,.35))", "important");
  card.style.willChange = "transform, filter";
  card.style.zIndex = "2147483000";
}
function clearPreview(card){
  delete card.dataset.previewing;
  card.classList.remove("is-previewing");
  card.style.removeProperty("transform");
  card.style.removeProperty("filter");
  card.style.removeProperty("will-change");
  card.style.removeProperty("z-index");
  card.style.removeProperty("transform-origin");
  document.documentElement.style.removeProperty("touch-action");
}

/* ---------- Drag core ---------- */
function onDown(e){
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button !== 0) return;

  e.preventDefault();
  try{ card.setPointerCapture(e.pointerId); }catch{}

  ensureDragLayer();

  card.classList.add("is-pressing","grab-intent");

  const r = card.getBoundingClientRect();
  const pageLeft = r.left + window.scrollX;
  const pageTop  = r.top  + window.scrollY;

  st = {
    pid:e.pointerId, card,
    startX:e.pageX, startY:e.pageY,
    offsetX: e.pageX - pageLeft,
    offsetY: e.pageY - pageTop,
    curX: pageLeft, curY: pageTop,
    targetX: pageLeft, targetY: pageTop,
    vx:0, vy:0,
    lifted:false, previewed:false,
    placeholder:null,
    originParent: card.parentNode,
    originNext: card.nextSibling,
    isInstant: card.classList.contains("is-instant"),
    lastClientX:e.clientX, lastClientY:e.clientY
  };

  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    if (!st || st.lifted || st.previewed) return;
    applyPreview(card);
    st.previewed = true;
  }, HOLD_MS);

  addGlobals();
}

function lift(fromPreview){
  if (!st || st.lifted) return;
  if (!dragDevOn()) return;            // only when Dev Drag is ON

  clearTimeout(holdTimer);

  const card = st.card;
  let pageLeft, pageTop;

  if (fromPreview && card.dataset.previewing === "1"){
    const rr = card.getBoundingClientRect();
    pageLeft = rr.left + window.scrollX;
    pageTop  = rr.top  + window.scrollY;
    clearPreview(card);                 // remove the scale but keep position
  } else {
    const r = card.getBoundingClientRect();
    pageLeft = r.left + window.scrollX;
    pageTop  = r.top  + window.scrollY;
  }

  // placeholder (uses unscaled size)
  const baseR = card.getBoundingClientRect();
  const ph = document.createElement("div");
  ph.style.width = baseR.width + "px";
  ph.style.height = baseR.height + "px";
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  st.placeholder = ph;
  if (st.originNext) st.originParent.insertBefore(ph, st.originNext);
  else st.originParent.appendChild(ph);

  // set CSS vars first (avoid a 0,0 frame)
  card.style.setProperty("--drag-x", `${pageLeft}px`);
  card.style.setProperty("--drag-y", `${pageTop}px`);

  card.classList.remove("grab-intent","is-pressing");
  card.classList.add("is-dragging");
  if (st.isInstant) card.classList.add("pulsing");

  dragLayer.appendChild(card);

  st.curX = pageLeft; st.curY = pageTop;
  st.targetX = pageLeft; st.targetY = pageTop;
  st.vx = 0; st.vy = 0;
  st.lifted = true;

  momentumLoop();
}

function onMove(e){
  if (!st) return;

  st.lastClientX = e.clientX;
  st.lastClientY = e.clientY;

  const dx = e.pageX - st.startX;
  const dy = e.pageY - st.startY;
  const dist = Math.hypot(dx, dy);

  if (!st.previewed && !st.lifted){
    if (dist > PREVIEW_MOVE_TOL) clearTimeout(holdTimer);
    if (dragDevOn() && dist > LIFT_MOVE) lift(false);
    return;
  }

  if (st.previewed && !st.lifted){
    if (dragDevOn() && dist > CONVERT_MOVE) lift(true);
    return;
  }

  if (!st.lifted) return;

  st.targetX = e.pageX - st.offsetX;
  st.targetY = e.pageY - st.offsetY;
}

function onCancel(){
  // iOS long-press fires pointercancel; keep preview visible
  if (st?.previewed && !st?.lifted) return;
  onUp();
}

function onUp(e){
  if (!st) return;
  try{ st.card.releasePointerCapture?.(st.pid); }catch{}
  cancelAnimationFrame(raf);
  removeGlobals();
  clearTimeout(holdTimer);

  if (!st.lifted){
    clearPreview(st.card);
    st.card.classList.remove("is-pressing","grab-intent");
    st = null;
    return;
  }

  // drop hit test (player slots only)
  let cx = Number.isFinite(e?.clientX) ? e.clientX : st.lastClientX;
  let cy = Number.isFinite(e?.clientY) ? e.clientY : st.lastClientY;

  let dropSlot = null;
  if (Number.isFinite(cx) && Number.isFinite(cy)){
    st.card.style.visibility = "hidden";
    const hit = document.elementFromPoint(cx, cy);
    st.card.style.visibility = "";
    dropSlot = hit?.closest?.(".slotCell") || null;
    if (dropSlot && !dropSlot.closest("#playerSlots")) dropSlot = null;
  }

  if (dropSlot){
    const r = dropSlot.getBoundingClientRect();
    const toX = r.left + window.scrollX;
    const toY = r.top  + window.scrollY;
    animateTo(toX, toY, SNAP_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove("is-dragging","pulsing");
      st.card.style.removeProperty("--drag-x");
      st.card.style.removeProperty("--drag-y");
      try {
        game?.dispatch?.({
          type: "DROP_CARD",
          cardId: st.card.dataset.id,
          slot: dropSlot.dataset.slot
        });
      } catch {}
      st = null;
    });
  } else {
    const pr = st.placeholder.getBoundingClientRect();
    const toX = pr.left + window.scrollX;
    const toY = pr.top  + window.scrollY;
    animateTo(toX, toY, RETURN_MS, () => {
      safeReturn(st.card, st.originParent, st.originNext, st.placeholder);
      st.card.classList.remove("is-dragging","pulsing");
      st.card.style.removeProperty("--drag-x");
      st.card.style.removeProperty("--drag-y");
      st = null;
    });
  }
}

function momentumLoop(){
  cancelAnimationFrame(raf);
  const step = () => {
    if (!st || !st.lifted) return;
    const ax = (st.targetX - st.curX) * STIFFNESS;
    const ay = (st.targetY - st.curY) * STIFFNESS;
    st.vx = (st.vx + ax) * (1 - DAMPING);
    st.vy = (st.vy + ay) * (1 - DAMPING);
    st.curX += st.vx; st.curY += st.vy;
    st.card.style.setProperty("--drag-x", `${st.curX}px`);
    st.card.style.setProperty("--drag-y", `${st.curY}px`);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/* ---------- Dev drag toggle ---------- */
function mountDragToggle(){
  if (dragBtn) return;
  dragBtn = document.createElement("button");
  dragBtn.id = "dragDevToggle";
  dragBtn.type = "button";
  dragBtn.style.cssText = `
    position:fixed; left:12px;
    bottom:calc(env(safe-area-inset-bottom,0) + 12px);
    z-index:2147483647;
    padding:8px 10px; border:0; border-radius:10px;
    color:#fff; font-weight:700;
    background:#2c7be5; box-shadow:0 6px 16px rgba(0,0,0,.18);
    cursor:pointer;
  `;
  dragBtn.addEventListener("click", () => {
    const on = !dragDevOn();
    if (on) localStorage.setItem("enableDragDev","1");
    else localStorage.removeItem("enableDragDev");
    updateToggleText();
  });
  document.body.appendChild(dragBtn);
  updateToggleText();
}
function updateToggleText(){
  if (!dragBtn) return;
  dragBtn.textContent = dragDevOn() ? "Drag: ON" : "Drag: OFF";
  dragBtn.style.background = dragDevOn() ? "#2c7be5" : "#999";
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  // ensure hand tray isn't inside a clipping container
  const tray = document.querySelector(".ribbon-wrap");
  if (tray && tray.parentNode !== document.body) document.body.appendChild(tray);

  document.addEventListener("dragstart", e => e.preventDefault(), { passive:false });

  ensureDragLayer();
  mountDragToggle();

  document.addEventListener("pointerdown", onDown, { passive:false });

  console.log("[THE GREY][UI] ready: real-card preview 2.5x; long-press safe; drag via toggle/?drag=1");
});