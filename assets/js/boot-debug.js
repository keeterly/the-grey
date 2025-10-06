// boot-debug.js — smooth preview + drag (viewport coords, RAF tween)
console.log("[BRIDGE] drag/preview v2 (RAF, client coords)");

/* ---- Tunables ---- */
const DRAG_THRESHOLD        = 12;     // px movement to start drag (from press)
const PREVIEW_DELAY_MS      = 260;    // hold time to open preview
const PREVIEW_CANCEL_DIST   = 44;     // allowed wiggle while previewing
const PREVIEW_CANCEL_TICKS  = 2;      // require a couple frames beyond dist
const PREVIEW_SCALE         = 2.5;    // 250%
const PREVIEW_IN_MS         = 170;    // grow duration
const PREVIEW_OUT_MS        = 120;    // shrink duration
const FOLLOW_DAMP           = 0.30;   // drag smoothing (0.25–0.35)

/* ---- State ---- */
let st = reset();

function reset() {
  return {
    mode: "idle",       // idle | press | previewTween | preview | drag | shrinkTween
    pid: null,
    card: null,
    placeholder: null,
    originParent: null,
    originNext: null,

    // press / hysteresis
    downCX: 0, downCY: 0,             // client coords at press
    pressTimer: 0,
    cancelTicks: 0,

    // fixed positioning (viewport coords)
    startCX: 0, startCY: 0,           // top-left at pickup (client)
    offsetCX: 0, offsetCY: 0,         // pointer inside-card offset (client)
    curX: 0, curY: 0,
    targetX: 0, targetY: 0,
    raf: 0,

    // tween
    tweenRAF: 0,
    tweenStart: 0,
    tweenFrom: 1,
    tweenTo: 1,
    tweenDur: 0
  };
}

/* ---- Helpers ---- */
const ease = t => (t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2); // cubic in/out

function setFixed(c){
  c.style.position = "fixed";
  c.style.zIndex = "2147483000";
  c.style.pointerEvents = "none";
}
function clearFixed(c){
  c.style.position = "";
  c.style.zIndex = "";
  c.style.pointerEvents = "";
}
function setTx(c, x, y, s=1){
  c.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
}
function makePH(c, r){
  const ph = document.createElement("div");
  ph.style.width  = r.width + "px";
  ph.style.height = r.height + "px";
  ph.style.marginLeft = getComputedStyle(c).marginLeft;
  return ph;
}
function stopRAF(id){ if(id) cancelAnimationFrame(id); }

/* ---- Cleanup ---- */
function finalize(){
  stopRAF(st.raf);
  stopRAF(st.tweenRAF);
  clearTimeout(st.pressTimer);

  if (st.card){
    const c = st.card;
    c.classList.remove("is-pressing","is-previewing","is-dragging");
    c.style.willChange = "";
    c.style.transform = "";
    clearFixed(c);
    if (st.placeholder && st.originParent){
      st.originParent.insertBefore(c, st.placeholder);
      st.placeholder.remove();
    }
  }
  document.documentElement.style.removeProperty("touch-action");
  st = reset();
}

/* ---- Events ---- */
addEventListener("pointerdown", onDown, {passive:false});
addEventListener("pointermove", onMove, {passive:false});
addEventListener("pointerup",   onUp,   {passive:false});
addEventListener("pointercancel", finalize, {passive:true});
addEventListener("blur", finalize);
addEventListener("visibilitychange", () => { if (document.hidden) finalize(); });

function onDown(e){
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button === 2) return;

  e.preventDefault();

  st.mode = "press";
  st.pid  = e.pointerId;
  st.card = card;

  try{ card.setPointerCapture(st.pid); }catch{}
  card.classList.add("is-pressing");
  card.style.willChange = "transform"; // pre-promote

  st.downCX = e.clientX; st.downCY = e.clientY;

  st.pressTimer = setTimeout(() => {
    if (st.mode === "press") beginPreviewTween();
  }, PREVIEW_DELAY_MS);
}

function onMove(e){
  if (e.pointerId !== st.pid) return;

  const dCX = e.clientX - st.downCX;
  const dCY = e.clientY - st.downCY;
  const dist = Math.hypot(dCX, dCY);

  if (st.mode === "press"){
    if (dist > DRAG_THRESHOLD) startDragFromPress(e);
    return;
  }

  if (st.mode === "preview" || st.mode === "previewTween"){
    // tolerate a couple frames beyond cancel distance
    if (dist > PREVIEW_CANCEL_DIST){
      if (++st.cancelTicks >= PREVIEW_CANCEL_TICKS){
        // convert preview → drag
        endPreviewTweenImmediate();
        startDragFromPreview(e);
      }
    } else {
      st.cancelTicks = 0;
    }
    return;
  }

  if (st.mode === "drag"){
    st.targetX = e.clientX - st.offsetCX;
    st.targetY = e.clientY - st.offsetCY;
  }
}

function onUp(e){
  if (e.pointerId !== st.pid) return;

  if (st.mode === "preview" || st.mode === "previewTween"){
    // shrink back smoothly
    beginShrinkTween(() => finalize());
  } else {
    finalize();
  }
}

/* ---- Preview ---- */
function beginPreviewTween(){
  const c = st.card;
  const r = c.getBoundingClientRect();

  // install placeholder to keep fan spacing
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePH(c, r);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  // switch to fixed at current viewport position
  setFixed(c);
  setTx(c, r.left, r.top, 1);

  c.classList.remove("is-pressing");
  c.classList.add("is-previewing");
  document.documentElement.style.touchAction = "none";

  // record for later drag handoff
  st.startCX  = r.left;
  st.startCY  = r.top;

  // tween 1 → PREVIEW_SCALE
  st.mode = "previewTween";
  st.tweenFrom = 1;
  st.tweenTo   = PREVIEW_SCALE;
  st.tweenDur  = PREVIEW_IN_MS;
  st.tweenStart = performance.now();
  runTween();
}

function runTween(){
  const now = performance.now();
  let t = (now - st.tweenStart) / st.tweenDur;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const k = ease(t);
  const s = st.tweenFrom + (st.tweenTo - st.tweenFrom) * k;

  setTx(st.card, st.startCX, st.startCY, s);

  if (t < 1 && (st.mode === "previewTween" || st.mode === "shrinkTween")){
    st.tweenRAF = requestAnimationFrame(runTween);
  } else {
    stopRAF(st.tweenRAF);
    if (st.mode === "previewTween"){
      st.mode = "preview";
    } else if (st.mode === "shrinkTween"){
      // restore flow before finishing
      st.card.classList.remove("is-previewing");
      if (st.placeholder && st.originParent){
        st.originParent.insertBefore(st.card, st.placeholder);
        st.placeholder.remove();
        st.placeholder = null;
      }
      clearFixed(st.card);
      st.card.style.transform = "";
      finalize();
    }
  }
}

function endPreviewTweenImmediate(){
  // snap to scale=1 in place so we can begin drag
  stopRAF(st.tweenRAF);
  setTx(st.card, st.startCX, st.startCY, 1);
  st.card.classList.remove("is-previewing");
}

function beginShrinkTween(done){
  // tween PREVIEW_SCALE → 1 at the current on-screen location
  const r = st.card.getBoundingClientRect();
  st.startCX = r.left;
  st.startCY = r.top;

  st.mode = "shrinkTween";
  st.tweenFrom = PREVIEW_SCALE;
  st.tweenTo   = 1;
  st.tweenDur  = PREVIEW_OUT_MS;
  st.tweenStart = performance.now();
  st.tweenRAF = requestAnimationFrame(runTween);
}

/* ---- Drag ---- */
function startDragFromPreview(e){
  const c = st.card;
  const r = c.getBoundingClientRect();

  setTx(c, r.left, r.top, 1);       // ensure scale=1
  c.classList.add("is-dragging");

  st.offsetCX = e.clientX - r.left; // client offsets
  st.offsetCY = e.clientY - r.top;

  st.curX = r.left;
  st.curY = r.top;
  st.targetX = st.curX;
  st.targetY = st.curY;

  st.mode = "drag";
  st.raf = requestAnimationFrame(follow);
}

function startDragFromPress(e){
  clearTimeout(st.pressTimer);

  const c = st.card;
  const r = c.getBoundingClientRect();

  // placeholder
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePH(c, r);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  setFixed(c);
  setTx(c, r.left, r.top, 1);

  st.offsetCX = e.clientX - r.left;
  st.offsetCY = e.clientY - r.top;

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
  setTx(st.card, st.curX, st.curY, 1);
  st.raf = requestAnimationFrame(follow);
}