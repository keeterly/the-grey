/* THE GREY — Stable Drag (ribbon-only, no global hooks, no reparenting) */

(() => {
  const ribbon = document.getElementById('ribbon');
  if (!ribbon) {
    console.warn('[Drag] No #ribbon found; drag disabled.');
    return;
  }

  let st = null;
  let raf = null;

  const DRAG_THRESHOLD = 6;   // px to lift
  const SMOOTH = 0.18;        // small dampening
  const SNAP = 24;            // snap to cursor when far

  function onDown(e){
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    // don’t break text selection or links elsewhere
    e.preventDefault();

    try { card.setPointerCapture(e.pointerId); } catch {}

    // visual press like hover
    card.classList.add('is-pressing');

    const rect = card.getBoundingClientRect();
    const pageX = rect.left + window.scrollX;
    const pageY = rect.top  + window.scrollY;

    st = {
      pid: e.pointerId,
      card,
      startX: e.pageX,
      startY: e.pageY,
      offsetX: e.pageX - pageX,
      offsetY: e.pageY - pageY,
      curX: pageX,
      curY: pageY,
      targetX: pageX,
      targetY: pageY,
      ph: null,
      lifted: false,
      originParent: card.parentNode,
      originNext: card.nextSibling,
      prevStyle: {
        position: card.style.position || '',
        left: card.style.left || '',
        top: card.style.top || '',
        transform: card.style.transform || '',
        transition: card.style.transition || ''
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  }

  function lift(){
    if (!st || st.lifted) return;
    const { card, originParent, originNext } = st;

    // hold spacing with a placeholder (simple block)
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.ph = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // convert the existing element to fixed; no reparenting
    card.classList.remove('is-pressing');
    card.classList.add('is-dragging');

    // IMPORTANT: set fixed position via transform; keep border/shadow
    card.style.position = 'fixed';
    card.style.left = '0';
    card.style.top = '0';
    card.style.transition = 'none';
    card.style.transform = `translate3d(${st.curX}px, ${st.curY}px, 0) scale(1.02)`;

    st.lifted = true;
    smoothFollow();
  }

  function smoothFollow(){
    cancelAnimationFrame(raf);

    const toHalf = v => Math.round(v * 2) / 2; // stable subpixel

    const step = () => {
      if (!st || !st.lifted) return;

      const dx = st.targetX - st.curX;
      const dy = st.targetY - st.curY;
      const dist = Math.hypot(dx, dy);

      if (dist > SNAP) {
        st.curX = st.targetX;
        st.curY = st.targetY;
      } else {
        st.curX += dx * SMOOTH;
        st.curY += dy * SMOOTH;
      }

      st.card.style.transform =
        `translate3d(${toHalf(st.curX)}px, ${toHalf(st.curY)}px, 0) scale(1.02)`;

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
  }

  function onMove(e){
    if (!st) return;
    const dx = e.pageX - st.startX;
    const dy = e.pageY - st.startY;

    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    st.targetX = e.pageX - st.offsetX;
    st.targetY = e.pageY - st.offsetY;
  }

  function restoreCardStyles(){
    const { card, prevStyle } = st;
    card.style.position = prevStyle.position;
    card.style.left = prevStyle.left;
    card.style.top = prevStyle.top;
    card.style.transform = prevStyle.transform;
    card.style.transition = prevStyle.transition;
  }

  function onUp(){
    if (!st) return;
    try { st.card.releasePointerCapture?.(st.pid); } catch {}
    cancelAnimationFrame(raf);

    // Always restore element and remove placeholder
    st.card.classList.remove('is-dragging','is-pressing');
    if (st.ph && st.ph.parentNode) {
      st.originParent.insertBefore(st.card, st.ph);
      st.ph.remove();
    }
    restoreCardStyles();

    st = null;

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
  }

  ribbon.addEventListener('pointerdown', onDown);
})();