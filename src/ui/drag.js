// drag.js — robust pointer-based drag for cards -> slots
// Assumes draggable elements have [data-draggable="card"]
// and droppable slots have [data-slot].

(() => {
  'use strict';

  const DRAG_SELECTOR = '[data-draggable="card"]';
  const SLOT_SELECTOR = '[data-slot]';

  let dragging = null;        // { el, startX, startY, offsetX, offsetY, originParent, originNext }
  let activePointerId = null;

  const getPoint = (evt) => {
    if (evt instanceof PointerEvent) return { x: evt.clientX, y: evt.clientY };
    if (evt.touches && evt.touches[0]) return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
    if (evt.changedTouches && evt.changedTouches[0]) return { x: evt.changedTouches[0].clientX, y: evt.changedTouches[0].clientY };
    return { x: 0, y: 0 };
  };

  const setDraggingStyle = (el, isDragging) => {
    if (isDragging) {
      el.style.willChange = 'transform';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '999';
      el.classList.add('dragging');
    } else {
      el.style.transform = '';
      el.style.willChange = '';
      el.style.pointerEvents = '';
      el.style.zIndex = '';
      el.classList.remove('dragging');
    }
  };

  const onPointerDown = (evt) => {
    const target = evt.target.closest(DRAG_SELECTOR);
    if (!target) return;

    // only one drag at a time
    if (dragging) return;

    activePointerId = evt.pointerId ?? null;
    target.setPointerCapture?.(activePointerId);

    const rect = target.getBoundingClientRect();
    const { x, y } = getPoint(evt);

    dragging = {
      el: target,
      startX: x,
      startY: y,
      offsetX: x - (rect.left + rect.width / 2),
      offsetY: y - (rect.top + rect.height / 2),
      originParent: target.parentElement,
      originNext: target.nextElementSibling
    };

    setDraggingStyle(target, true);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (evt) => {
    if (!dragging) return;
    if (activePointerId !== null && evt.pointerId !== activePointerId) return;

    const { x, y } = getPoint(evt);
    const dx = x - dragging.startX;
    const dy = y - dragging.startY;

    // translate relative to initial center, plus small offset to feel natural
    dragging.el.style.transform = `translate(${dx - dragging.offsetX}px, ${dy - dragging.offsetY}px)`;
  };

  const findDropSlot = (x, y) => {
    // temporarily hide the dragging element to hit-test below it
    const el = dragging.el;
    const prevVis = el.style.visibility;
    el.style.visibility = 'hidden';
    const tgt = document.elementFromPoint(x, y);
    el.style.visibility = prevVis;

    return tgt ? tgt.closest(SLOT_SELECTOR) : null;
  };

  const onPointerUp = (evt) => {
    if (!dragging) return;
    if (activePointerId !== null && evt.pointerId !== activePointerId) return;

    const { x, y } = getPoint(evt);

    // drop logic
    const slot = findDropSlot(x, y);

    if (slot) {
      // If your game has capacity rules, check them here:
      // if (!slot.dataset.accepts || !slot.dataset.accepts.includes(dragging.el.dataset.type)) { ... }
      slot.appendChild(dragging.el);
      dragging.el.dispatchEvent(new CustomEvent('card:dropped', { bubbles: true, detail: { slot } }));
    } else {
      // return to original location
      const { originParent, originNext, el } = dragging;
      if (originNext && originNext.parentElement === originParent) {
        originParent.insertBefore(el, originNext);
      } else {
        originParent.appendChild(el);
      }
    }

    // cleanup
    setDraggingStyle(dragging.el, false);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);

    dragging = null;
    activePointerId = null;
  };

  // Public initializer: call after your hand/slots render
  const initDrag = (root = document) => {
    // Use event delegation on the root
    root.addEventListener('pointerdown', onPointerDown, { passive: true });
  };

  // Auto-init on DOM ready for convenience
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDrag(document));
  } else {
    initDrag(document);
  }

  // Expose for manual re-init after rerenders
  window.DragCards = { init: initDrag };
})();
