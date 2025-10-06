// boot-debug.js — transform-only, no reparent, smooth preview + drag
console.log("[BRIDGE] drag/preview (transform-only) loaded");

const DRAG_THRESHOLD       = 10;     // px to start direct drag (from press)
const PREVIEW_DELAY_MS     = 260;    // hold to preview
const PREVIEW_CANCEL_DIST  = 38;     // wiggle allowed while previewing
const PREVIEW_CANCEL_TICKS = 2;      // hysteresis
const PREVIEW_SCALE        = 2.5;    // 250%
const PREVIEW_IN_MS        = 160;
const PREVIEW_OUT_MS       = 110;
const FOLLOW_DAMP          = 0.30;   // 0.25–0.35 feels good

let st = resetState();

function resetState() {
  return {
    mode: "idle",    // idle | press | preview | drag
    pid: null,
    card: null,
    placeholder: null,
    originParent: null,
    originNext: null,

    downX: 0, downY: 0,
    pressTimer: 0,
    cancelTicks: 0,

    // drag
    offsetX: 0, offsetY: 0,
    curX: 0, curY: 0,
    targetX: 0, targetY: 0,
    raf: 0,

    // animations
    growAnim: null, shrinkAnim: null,
  };
}

/* ---------- Utilities ---------- */
function pagePosOfRect(r){ return { x: r.left + window.scrollX, y: r.top + window.scrollY }; }
function setFixed(card){
  card.style.position = "fixed";
  card.style.zIndex = "2147483000";
  card.style.pointerEvents = "none";
}
function clearFixed(card){
  card.style.position = "";
  card.style.zIndex = "";
  card.style.pointerEvents = "";
}
function setTransform(card, x, y, scale = 1){
  card.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}
function makePlaceholder(card, r){
  const ph = document.createElement("div");
  ph.style.width = r.width + "px";
  ph.style.height = r.height + "px";
  ph.style.marginLeft = getComputedStyle(card).marginLeft;
  return ph;
}
function stopAnim(a){ try{ a?.cancel(); }catch{} }

/* ---------- Lifecycle ---------- */
function finalize(){
  cancelAnimationFrame(st.raf);
  clearTimeout(st.pressTimer);
  stopAnim(st.growAnim); stopAnim(st.shrinkAnim);

  if (st.card){
    const c = st.card;
    c.classList.remove("is-pressing","is-previewing","is-dragging");
    c.style.willChange = "";
    c.style.transform = "";
    clearFixed(c);
    // put back into flow
    if (st.placeholder && st.originParent){
      st.originParent.insertBefore(c, st.placeholder);
      st.placeholder.remove();
    }
  }
  st = resetState();
  document.documentElement.style.removeProperty("touch-action");
}

/* ---------- Event handlers ---------- */
addEventListener("pointerdown", onDown, {passive:false});
addEventListener("pointermove", onMove, {passive:false});
addEventListener("pointerup",   onUp,   {passive:false});
addEventListener("pointercancel", finalize);
addEventListener("blur", finalize);
addEventListener("visibilitychange", ()=>{ if (document.hidden) finalize(); });

function onDown(e){
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button === 2) return;

  e.preventDefault();
  st.mode = "press";
  st.pid = e.pointerId;
  st.card = card;
  st.downX = e.pageX; st.downY = e.pageY;
  st.cancelTicks = 0;

  try{ card.setPointerCapture(st.pid); }catch{}
  card.classList.add("is-pressing");
  card.style.willChange = "transform";     // pre-promote layer

  st.pressTimer = setTimeout(() => {
    if (st.mode === "press") enterPreview();
  }, PREVIEW_DELAY_MS);
}

function onMove(e){
  if (e.pointerId !== st.pid) return;

  const dx = e.pageX - st.downX;
  const dy = e.pageY - st.downY;
  const d  = Math.hypot(dx, dy);

  if (st.mode === "press"){
    if (d > DRAG_THRESHOLD) enterDragFromPress(e);
    return;
  }
  if (st.mode === "preview"){
    if (d > PREVIEW_CANCEL_DIST){ if(++st.cancelTicks>=PREVIEW_CANCEL_TICKS) handoffPreviewToDrag(e); }
    else st.cancelTicks = 0;
    return;
  }
  if (st.mode === "drag"){
    st.targetX = e.pageX - st.offsetX;
    st.targetY = e.pageY - st.offsetY;
  }
}

function onUp(e){
  if (e.pointerId !== st.pid) return;
  if (st.mode === "preview"){
    // smooth shrink back
    leavePreview(() => finalize());
  } else {
    finalize();
  }
}

/* ---------- Modes ---------- */
function enterPreview(){
  const c = st.card;
  const r = c.getBoundingClientRect();
  const {x,y} = pagePosOfRect(r);

  // placeholder to keep fan spacing
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePlaceholder(c, r);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  // take out of flow but keep same parent (no reparent)
  setFixed(c);
  setTransform(c, r.left, r.top, 1);

  // flag & grow via WAAPI (compositor)
  c.classList.remove("is-pressing");
  c.classList.add("is-previewing");
  document.documentElement.style.touchAction = "none";

  stopAnim(st.growAnim);
  st.growAnim = c.animate(
    [
      { transform: `translate3d(${r.left}px, ${r.top}px, 0) scale(1)` },
      { transform: `translate3d(${r.left}px, ${r.top}px, 0) scale(${PREVIEW_SCALE})` }
    ],
    { duration: PREVIEW_IN_MS, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards", composite: "replace" }
  );

  st.mode = "preview";
}

function leavePreview(done){
  const c = st.card;
  const r = c.getBoundingClientRect(); // current on-screen rect

  stopAnim(st.growAnim);
  stopAnim(st.shrinkAnim);
  st.shrinkAnim = c.animate(
    [
      { transform: `translate3d(${r.left}px, ${r.top}px, 0) scale(${PREVIEW_SCALE})` },
      { transform: `translate3d(${r.left}px, ${r.top}px, 0) scale(1)` }
    ],
    { duration: PREVIEW_OUT_MS, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards", composite: "replace" }
  );
  st.shrinkAnim.addEventListener("finish", () => {
    c.classList.remove("is-previewing");
    // put back visually before removing fixed
    setTransform(c, r.left, r.top, 1);
    // restore to flow
    if (st.placeholder && st.originParent){
      st.originParent.insertBefore(c, st.placeholder);
      st.placeholder.remove();
      st.placeholder = null;
    }
    clearFixed(c);
    c.style.transform = "";
    done && done();
  }, { once:true });
}

function handoffPreviewToDrag(e){
  const c = st.card;
  stopAnim(st.growAnim); stopAnim(st.shrinkAnim);
  const r = c.getBoundingClientRect();

  // keep it fixed, but drop scale to 1 in place (one frame)
  setTransform(c, r.left, r.top, 1);
  c.classList.remove("is-previewing");

  // compute grip
  st.offsetX = e.pageX - (r.left + window.scrollX);
  st.offsetY = e.pageY - (r.top  + window.scrollY);

  st.curX = r.left;
  st.curY = r.top;
  st.targetX = st.curX;
  st.targetY = st.curY;

  c.classList.add("is-dragging");
  st.mode = "drag";
  st.raf = requestAnimationFrame(follow);
}

function enterDragFromPress(e){
  clearTimeout(st.pressTimer);

  const c = st.card;
  const r = c.getBoundingClientRect();

  // placeholder & fixed, no reparent
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePlaceholder(c, r);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  setFixed(c);
  setTransform(c, r.left, r.top, 1);

  // compute grip
  st.offsetX = e.pageX - (r.left + window.scrollX);
  st.offsetY = e.pageY - (r.top  + window.scrollY);

  st.curX = r.left;
  st.curY = r.top;
  st.targetX = st.curX;
  st.targetY = st.curY;

  c.classList.remove("is-pressing");
  c.classList.add("is-dragging");
  document.documentElement.style.touchAction = "none";

  st.mode = "drag";
  st.raf = requestAnimationFrame(follow);
}

function follow(){
  if (st.mode !== "drag" || !st.card) return;
  st.curX += (st.targetX - st.curX) * FOLLOW_DAMP;
  st.curY += (st.targetY - st.curY) * FOLLOW_DAMP;
  setTransform(st.card, st.curX, st.curY, 1);
  st.raf = requestAnimationFrame(follow);
}