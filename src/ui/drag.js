import { A } from '../engine/rules.js';

const LONGPRESS_MS = 220;
let pressTimer = null;
let dragging = null;

export function wireHandDrag(root, dispatch) {
  root.addEventListener('pointerdown', e=>{
    const cardEl = e.target.closest('[data-card-id][data-zone="hand"]');
    if (!cardEl) return;

    const cardId = cardEl.dataset.cardId;
    const isInstant = cardEl.dataset.type === 'INSTANT';
    const startX = e.clientX, startY = e.clientY;

    // long press preview
    pressTimer = setTimeout(()=>{
      if (dragging) return;
      cardEl.classList.add('is-preview');
      if (isInstant) cardEl.classList.add('is-held-instant');
    }, LONGPRESS_MS);

    const onMove = (ev)=>{
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && (Math.abs(dx)>5 || Math.abs(dy)>5)) {
        clearTimeout(pressTimer);
        cardEl.classList.remove('is-preview');
        if (isInstant) cardEl.classList.add('is-held-instant');
        dragging = { cardEl, cardId };
        cardEl.setPointerCapture(ev.pointerId);
        cardEl.classList.add('is-dragging');
      }
      if (dragging) {
        cardEl.style.transform = `translate(${dx}px, ${dy}px)`; // direct move, no dampening
      }
    };

    const finish = (ev)=>{
      clearTimeout(pressTimer);
      if (dragging) {
        cardEl.classList.remove('is-dragging');
        cardEl.style.transform = '';
        const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
        const slotEl = dropTarget?.closest('[data-drop="slot"]');
        const toGlyph = dropTarget?.closest('[data-drop="glyph"]');
        if (toGlyph) dispatch({type:A.PLAY_TO_GLYPH, cardId});
        else if (slotEl) {
          const slotIndex = Number(slotEl.dataset.slotIndex || 0);
          dispatch({type:A.PLAY_TO_SLOT, cardId, slotIndex});
        }
      } else {
        cardEl.classList.toggle('is-preview');
      }
      cardEl.classList.remove('is-held-instant');
      dragging = null;
      cardEl.releasePointerCapture?.(ev.pointerId);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', finish);
      root.removeEventListener('pointercancel', finish);
    };

    root.addEventListener('pointermove', onMove, {passive:true});
    root.addEventListener('pointerup', finish, {passive:true});
    root.addEventListener('pointercancel', finish, {passive:true});
  }, {passive:true});
}
