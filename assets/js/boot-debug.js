// boot-debug.js — MTGArena-like: hold-to-preview (real node), direct drag, no clones.
console.log("[BRIDGE] drag v3 — arena feel");

const HOLD_DELAY_MS        = 260;  // time to press & hold for preview
const DRAG_THRESHOLD_PX    = 10;   // move this much before HOLD to start drag
const PREVIEW_CANCEL_DIST  = 44;   // finger wiggle allowed while preview is open
const PREVIEW_SCALE        = 2.5;  // 250 %
const PREVIEW_IN_MS        = 140;  // grow
const PREVIEW_OUT_MS       = 120;  // shrink

let st = null;  // state bucket

function reset() {
  st = {
    mode: "idle",         // idle | press | preview | drag
    pid: null,
    card: null,

    // DOM
    originParent: null,
    originNext: null,
    placeholder: null,

    // positions (viewport / client coords only)
    downCX: 0, downCY: 0,     // where the press started
    startLeft: 0, startTop: 0,// where the card visually was at lift
    offsetCX: 0, offsetCY: 0, // where inside the card we grabbed
    w: 0, h: 0,               // card size

    holdTimer: 0,
    cancelArmed: false,       // for preview cancel hysteresis
  };
}

/* ---------- tiny DOM helpers ---------- */
function setFixed(c){ c.style.position="fixed"; c.style.zIndex="2147483000"; c.style.pointerEvents="none"; }
function clearFixed(c){ c.style.position=""; c.style.zIndex=""; c.style.pointerEvents=""; }
function setTx(c,x,y,s=1){ c.style.transform=`translate3d(${x}px,${y}px,0) scale(${s})`; }
function makePH(c, r){
  const ph = document.createElement('div');
  const cs = getComputedStyle(c);
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = cs.marginLeft;
  return ph;
}
function installPH(){
  const c = st.card;
  const r = c.getBoundingClientRect();
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePH(c, r);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  st.w = r.width; st.h = r.height;
  st.startLeft = r.left; st.startTop = r.top;

  setFixed(c);
  // start exactly where the card is
  setTx(c, st.startLeft, st.startTop, 1);
  // transform origin at the finger position so scale grows around finger
  const ox = (st.offsetCX / st.w) * 100;
  const oy = (st.offsetCY / st.h) * 100;
  c.style.transformOrigin = `${ox}% ${oy}%`;
  c.style.willChange = "transform";
}

function restoreCard(){
  const c = st.card;
  if (!c) return;
  c.classList.remove("is-pressing","is-preview","is-dragging");
  c.style.willChange = "";
  c.style.transformOrigin = "";
  c.style.transition = "";
  c.style.transform = "";
  clearFixed(c);
  if (st.placeholder && st.originParent){
    st.originParent.insertBefore(c, st.placeholder);
    st.placeholder.remove();
  }
  st.placeholder = null;
}

/* ---------- global teardown ---------- */
function finish(){
  clearTimeout(st?.holdTimer);
  if (st?.card) restoreCard();
  document.documentElement.style.removeProperty("touch-action");
  reset();
}

/* ---------- pointer wiring ---------- */
addEventListener("pointerdown", onDown, {passive:false});
addEventListener("pointermove", onMove, {passive:false});
addEventListener("pointerup",   onUp,   {passive:false});
addEventListener("pointercancel", finish, {passive:true});
addEventListener("blur", finish);
addEventListener("visibilitychange", () => { if (document.hidden) finish(); });

reset();

/* ---------- handlers ---------- */
function onDown(e){
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button === 2) return;

  e.preventDefault();
  reset();

  st.mode = "press";
  st.pid  = e.pointerId;
  st.card = card;
  try { card.setPointerCapture(st.pid); } catch {}

  const r = card.getBoundingClientRect();
  st.downCX   = e.clientX;
  st.downCY   = e.clientY;
  st.offsetCX = e.clientX - r.left;
  st.offsetCY = e.clientY - r.top;

  card.classList.add("is-pressing");

  // arm the hold-to-preview
  st.holdTimer = setTimeout(() => {
    if (st.mode === "press") openPreview();
  }, HOLD_DELAY_MS);
}

function onMove(e){
  if (e.pointerId !== st.pid) return;

  const dx = e.clientX - st.downCX;
  const dy = e.clientY - st.downCY;
  const dist = Math.hypot(dx, dy);

  if (st.mode === "press"){
    // moved early enough = start dragging immediately
    if (dist > DRAG_THRESHOLD_PX){
      clearTimeout(st.holdTimer);
      beginDragFromPress();
    }
    return;
  }

  if (st.mode === "preview"){
    // allow some wiggle without cancel
    if (dist > PREVIEW_CANCEL_DIST){
      // cancel preview and switch to drag
      shrinkPreview(false, () => {
        // keep fixed; just switch to drag tracking
        st.mode = "drag";
        st.card.classList.remove("is-preview");
        st.card.classList.add("is-dragging");
        // recompute current placement and exact offsets
        const r = st.card.getBoundingClientRect();
        st.startLeft = r.left; st.startTop = r.top;
        st.offsetCX = e.clientX - r.left;
        st.offsetCY = e.clientY - r.top;
      });
    }
    return;
  }

  if (st.mode === "drag"){
    // no damping → stick to finger (arena feel)
    const x = e.clientX - st.offsetCX;
    const y = e.clientY - st.offsetCY;
    setTx(st.card, x, y, 1);
  }
}

function onUp(e){
  if (e.pointerId !== st.pid) return;

  if (st.mode === "press"){
    // short tap with no drag: just cleanup
    finish();
    return;
  }

  if (st.mode === "preview"){
    // shrink back into place smoothly
    shrinkPreview(true, finish);
    return;
  }

  if (st.mode === "drag"){
    // let game logic decide slotting; we just restore to origin DOM
    finish();
  }
}

/* ---------- preview ---------- */
function openPreview(){
  if (st.mode !== "press") return;
  const c = st.card;

  // install placeholder & lift to fixed coords
  installPH();

  // grow in place
  c.classList.remove("is-pressing");
  c.classList.add("is-preview");

  document.documentElement.style.touchAction = "none";

  c.style.transition = `transform ${PREVIEW_IN_MS}ms ease-out`;
  setTx(c, st.startLeft, st.startTop, PREVIEW_SCALE);

  st.mode = "preview";
}

function shrinkPreview(backToFlow, done){
  const c = st.card;
  if (!c) return done?.();

  c.style.transition = `transform ${PREVIEW_OUT_MS}ms ease-out`;
  // shrink at the current on-screen position
  const r = c.getBoundingClientRect();
  setTx(c, r.left, r.top, 1);

  // after shrink, optionally put it back into the flow immediately
  setTimeout(() => {
    c.style.transition = "";
    if (backToFlow){
      // place back before we end, so it snaps to original slot visually
      restoreCard();
    } else {
      // keep fixed (for drag handoff)
      c.classList.remove("is-preview");
    }
    done && done();
  }, PREVIEW_OUT_MS);
}

/* ---------- drag ---------- */
function beginDragFromPress(){
  const c = st.card;
  c.classList.remove("is-pressing");
  c.classList.add("is-dragging");

  installPH(); // lift to fixed at exact visual position
  document.documentElement.style.touchAction = "none";

  st.mode = "drag";
}