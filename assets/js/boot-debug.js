// boot-debug.js — disabled for production
console.log('[BOOT] Debug check disabled.');

// ---- Real-element drag with a threshold (so long-press preview still works) ----
(() => {
  const DRAG_THRESHOLD = 6; // px before we "lift" into dragging

  // Create a drag layer once
  const dragLayer = document.createElement('div');
  dragLayer.className = 'drag-layer';
  document.body.appendChild(dragLayer);

  let state = null; // active drag state

  function onPointerDown(e) {
    // Only start on a card inside the ribbon
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;

    // Prevent native drag image behavior
    e.preventDefault();
    card.setPointerCapture?.(e.pointerId);

    const rect = card.getBoundingClientRect();
    state = {
      card,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      lifted: false,
      originParent: card.parentNode,
      originNext: card.nextSibling,
      placeholder: null,
      isInstant: card.classList.contains('is-instant'),
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp, { once: true });
  }

  function lift() {
    if (!state || state.lifted) return;
    const { card, originParent, originNext } = state;

    // Keep layout stable: drop a placeholder where the card was
    const rect = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.style.width = rect.width + 'px';
    ph.style.height = rect.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    state.placeholder = ph;

    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // Move the actual card into the drag layer (same node, animations preserved)
    dragLayer.appendChild(card);
    card.classList.add('is-dragging');

    // If instant, keep the gold pulse while held
    if (state.isInstant) card.classList.add('pulsing');

    state.lifted = true;
  }

  function onPointerMove(e) {
    if (!state) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    // Only lift after a small move so long-press preview still works
    if (!state.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();

    if (state.lifted) {
      const x = e.clientX - state.offsetX;
      const y = e.clientY - state.offsetY;
      state.card.style.setProperty('--drag-x', x + 'px');
      state.card.style.setProperty('--drag-y', y + 'px');
    }
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);

    if (!state) return;
    const { card, originParent, originNext, placeholder, isInstant } = state;

    if (state.lifted) {
      // TODO: resolve your drop target here if you have slot logic,
      // before returning the card to its origin.

      // Return card to original DOM spot
      if (originNext) originParent.insertBefore(card, originNext);
      else originParent.appendChild(card);

      if (placeholder) placeholder.remove();
      card.classList.remove('is-dragging');

      // Stop pulsing unless a preview is open (instants should pulse there)
      const previewOpen = !!document.querySelector('.preview-overlay');
      if (!previewOpen && isInstant) card.classList.remove('pulsing');
    }

    state = null;
  }

  // Kill native HTML5 drag imagery everywhere
  document.addEventListener('dragstart', (e) => e.preventDefault());

  // Delegate from ribbon so newly-rendered cards work automatically
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onPointerDown);
})();


(() => {
  const DRAG_THRESHOLD = 6;
  const dragLayer = document.querySelector('.drag-layer') || (() => {
    const dl = document.createElement('div');
    dl.className = 'drag-layer';
    document.body.appendChild(dl);
    return dl;
  })();

  let st = null;

  function onDown(e){
    const card = e.target.closest('.ribbon .card');
    if (!card || e.button !== 0) return;
    e.preventDefault();
    card.setPointerCapture?.(e.pointerId);

    const r = card.getBoundingClientRect();
    st = {
      card,
      startX: e.clientX,
      startY: e.clientY,
      // store offset inside the card where the pointer is
      offsetX: e.clientX - (r.left + window.scrollX),
      offsetY: e.clientY - (r.top  + window.scrollY),
      lifted: false,
      originParent: card.parentNode,
      originNext: card.nextSibling,
      placeholder: null,
      isInstant: card.classList.contains('is-instant'),
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once:true });
    window.addEventListener('pointercancel', onUp, { once:true });
  }

  function lift(){
    if (!st || st.lifted) return;
    const { card, originParent, originNext } = st;

    const r = card.getBoundingClientRect();
    // placeholder keeps fan spacing
    const ph = document.createElement('div');
    ph.style.width  = r.width + 'px';
    ph.style.height = r.height + 'px';
    ph.style.marginLeft = getComputedStyle(card).marginLeft;
    st.placeholder = ph;
    if (originNext) originParent.insertBefore(ph, originNext);
    else originParent.appendChild(ph);

    // move the REAL node into drag layer
    dragLayer.appendChild(card);
    card.classList.add('is-dragging');

    // *** INIT COORDS RIGHT AWAY (prevents jump to 0,0) ***
    const x = r.left + window.scrollX;
    const y = r.top  + window.scrollY;
    card.style.setProperty('--drag-x', x + 'px');
    card.style.setProperty('--drag-y', y + 'px');

    if (st.isInstant) card.classList.add('pulsing');

    st.lifted = true;
  }

  function onMove(e){
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.lifted && Math.hypot(dx, dy) > DRAG_THRESHOLD) lift();
    if (!st.lifted) return;

    // position = pointer - offset + page scroll
    const x = e.clientX - st.offsetX;
    const y = e.clientY - st.offsetY;
    st.card.style.setProperty('--drag-x', x + 'px');
    st.card.style.setProperty('--drag-y', y + 'px');
  }

  function onUp(){
    window.removeEventListener('pointermove', onMove);
    if (!st) return;

    const { card, originParent, originNext, placeholder, isInstant } = st;

    if (st.lifted){
      // TODO: your drop/slot logic here
      if (originNext) originParent.insertBefore(card, originNext);
      else originParent.appendChild(card);
      if (placeholder) placeholder.remove();
      card.classList.remove('is-dragging');

      const previewOpen = !!document.querySelector('.preview-overlay');
      if (!previewOpen && isInstant) card.classList.remove('pulsing');
    }
    st = null;
  }

  // disable native HTML5 drag ghost
  document.addEventListener('dragstart', (e)=> e.preventDefault());

  // delegate from ribbon so new cards work too
  const ribbon = document.getElementById('ribbon');
  if (ribbon) ribbon.addEventListener('pointerdown', onDown);
})();

