// boot-debug.js — MTGArena feel, transform-only, viewport coords, no clones
console.log("[BRIDGE] drag v4 — arena feel, stable mobile");

/* ---------- Tunables ---------- */
const HOLD_DELAY_MS        = 260;   // press & hold time for preview
const DRAG_THRESHOLD_PX    = 10;    // move before HOLD to start drag immediately
const PREVIEW_CANCEL_DIST  = 44;    // wiggle allowed while previewing
const PREVIEW_SCALE        = 2.5;   // 250% preview size
const PREVIEW_IN_MS        = 140;   // grow duration
const PREVIEW_OUT_MS       = 110;   // shrink duration
/* -------------------------------- */

let st = null;

function resetState(){
  st = {
    mode: "idle",              // idle | press | preview | drag
    pid: null,
    card: null,

    // DOM placement
    originParent: null,
    originNext: null,
    placeholder: null,

    // geometry (viewport space)
    downCX: 0, downCY: 0,      // pointer where press started
    startLeft: 0, startTop: 0, // card top-left at lift (client)
    offsetCX: 0, offsetCY: 0,  // grip inside card (client)
    w: 0, h: 0,

    holdTimer: 0
  };
}
resetState();

/* ---------- tiny helpers ---------- */
function setFixed(el){ el.style.position="fixed"; el.style.zIndex="2147483000"; el.style.pointerEvents="none"; }
function clearFixed(el){ el.style.position=""; el.style.zIndex=""; el.style.pointerEvents=""; }
function setTx(el,x,y,s=1){ el.style.transform=`translate3d(${x}px,${y}px,0) scale(${s})`; }
function makePH(card){
  const r = card.getBoundingClientRect();
  const ph = document.createElement('div');
  const cs = getComputedStyle(card);
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  ph.style.marginLeft = cs.marginLeft;
  return ph;
}
function placeBack(){
  const c = st.card;
  if (!c) return;
  c.classList.remove("is-pressing","is-preview","is-dragging");
  c.style.transition=""; c.style.transform=""; c.style.transformOrigin=""; c.style.willChange="";
  clearFixed(c);
  if (st.placeholder && st.originParent){
    st.originParent.insertBefore(c, st.placeholder);
    st.placeholder.remove();
  }
  st.placeholder = null;
}

/* ---------- global cleanup ---------- */
function finish(){
  clearTimeout(st.holdTimer);
  placeBack();
  document.documentElement.style.removeProperty("touch-action");
  resetState();
}

/* ---------- pointer wiring ---------- */
addEventListener("pointerdown", onDown, {passive:false});
addEventListener("pointermove", onMove, {passive:false});
addEventListener("pointerup",   onUp,   {passive:false});
addEventListener("pointercancel", finish, {passive:true});
addEventListener("blur", finish);
addEventListener("visibilitychange", () => { if (document.hidden) finish(); });

/* ---------- handlers ---------- */
function onDown(e){
  // Only hand cards
  const card = e.target.closest(".ribbon .card");
  if (!card || e.button === 2) return;

  e.preventDefault();
  resetState();

  st.mode = "press";
  st.pid  = e.pointerId;
  st.card = card;
  try { card.setPointerCapture(st.pid); } catch {}

  // baseline press geometry
  const r = card.getBoundingClientRect();
  st.downCX   = e.clientX;
  st.downCY   = e.clientY;
  st.offsetCX = e.clientX - r.left;
  st.offsetCY = e.clientY - r.top;

  card.classList.add("is-pressing");

  // arm hold → preview
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
    // move before hold = direct drag
    if (dist > DRAG_THRESHOLD_PX){
      clearTimeout(st.holdTimer);
      beginDragFromPress();
    }
    return;
  }

  if (st.mode === "preview"){
    // generous wiggle while previewed; if exceeded, switch to drag
    if (dist > PREVIEW_CANCEL_DIST){
      const c = st.card;
      // shrink to 1x in-place and convert to drag in the next frame
      c.style.transition = `transform ${PREVIEW_OUT_MS}ms ease-out`;
      const r = c.getBoundingClientRect();
      setTx(c, r.left, r.top, 1);
      setTimeout(() => {
        c.style.transition = "";
        c.classList.remove("is-preview");
        // compute exact grip & enter drag
        const rr = c.getBoundingClientRect();
        st.offsetCX = e.clientX - rr.left;
        st.offsetCY = e.clientY - rr.top;
        st.mode = "drag";
        c.classList.add("is-dragging");
      }, PREVIEW_OUT_MS);
    }
    return;
  }

  if (st.mode === "drag"){
    // arena feel: stick to the finger (no damping)
    const x = e.clientX - st.offsetCX;
    const y = e.clientY - st.offsetCY;
    setTx(st.card, x, y, 1);
  }
}

function onUp(e){
  if (e.pointerId !== st.pid) return;

  if (st.mode === "press"){
    // tap with no preview/drag
    finish();
    return;
  }
  if (st.mode === "preview"){
    // shrink back smoothly then restore
    const c = st.card;
    const r = c.getBoundingClientRect();
    c.style.transition = `transform ${PREVIEW_OUT_MS}ms ease-out`;
    setTx(c, r.left, r.top, 1);
    setTimeout(finish, PREVIEW_OUT_MS);
    return;
  }
  if (st.mode === "drag"){
    // game logic can read drop target; we restore DOM placement
    finish();
  }
}

/* ---------- Preview ---------- */
function openPreview(){
  const c = st.card;
  const r = c.getBoundingClientRect();

  // keep ribbon layout with a placeholder
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePH(c);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  st.w = r.width; st.h = r.height;
  st.startLeft = r.left; st.startTop = r.top;

  // lift in place
  setFixed(c);
  // scale around the finger (not the center)
  const ox = (st.offsetCX / st.w) * 100;
  const oy = (st.offsetCY / st.h) * 100;
  c.style.transformOrigin = `${ox}% ${oy}%`;
  c.style.willChange = "transform";

  c.classList.remove("is-pressing");
  c.classList.add("is-preview");
  document.documentElement.style.touchAction = "none";

  // grow
  c.style.transition = `transform ${PREVIEW_IN_MS}ms ease-out`;
  setTx(c, st.startLeft, st.startTop, PREVIEW_SCALE);
}

/* ---------- Drag ---------- */
function beginDragFromPress(){
  const c = st.card;
  c.classList.remove("is-pressing");
  c.classList.add("is-dragging");

  // lift to fixed at exact visual rect (no reparenting)
  const r = c.getBoundingClientRect();
  st.originParent = c.parentNode;
  st.originNext   = c.nextSibling;
  st.placeholder  = makePH(c);
  if (st.originNext) st.originParent.insertBefore(st.placeholder, st.originNext);
  else st.originParent.appendChild(st.placeholder);

  setFixed(c);
  setTx(c, r.left, r.top, 1);

  // align transform-origin to grip point (consistency if user starts to hold mid-drag)
  const ox = (st.offsetCX / r.width) * 100;
  const oy = (st.offsetCY / r.height) * 100;
  c.style.transformOrigin = `${ox}% ${oy}%`;
  c.style.willChange = "transform";

  st.mode = "drag";
  document.documentElement.style.touchAction = "none";
}