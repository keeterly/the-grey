import { A } from '../engine/rules.js';
import { CARD_TYPES } from '../engine/state.js';

const LONGPRESS_MS = 220;
let pressTimer = null;
let dragging = null;

function toggleHighlights(root, type, on){
  const slots = [...root.querySelectorAll('[data-drop="slot"]')];
  const glyph = root.querySelector('[data-drop="glyph"]');
  slots.forEach(s=>s.classList.toggle('highlight', on && type===CARD_TYPES.SPELL));
  if (glyph) glyph.classList.toggle('highlight', on && type===CARD_TYPES.GLYPH);
}

export function wireHandDrag(root, dispatch) {
  const cleanup = (cardEl)=>{
    toggleHighlights(root, cardEl.dataset.type, false);
    cardEl.classList.remove('is-dragging','is-held-instant');
    cardEl.style.transform='';
  };

  root.addEventListener('pointerdown', e=>{
    const cardEl = e.target.closest('[data-card-id][data-zone="hand"]');
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    const isInstant = cardEl.dataset.type === 'INSTANT';
    const startX = e.clientX, startY = e.clientY;

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
        toggleHighlights(root, cardEl.dataset.type, true);
        cardEl.setPointerCapture(ev.pointerId);
        cardEl.classList.add('is-dragging');
      }
      if (dragging) { cardEl.style.transform = `translate(${dx}px, ${dy}px)`; }
    };

    const onUp = (ev)=>{
      clearTimeout(pressTimer);
      if (dragging) {
        const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
        const slotEl = dropTarget?.closest('[data-drop="slot"]');
        const toGlyph = dropTarget?.closest('[data-drop="glyph"]');
        if (toGlyph) dispatch({type:A.PLAY_TO_GLYPH, cardId});
        else if (slotEl) dispatch({type:A.PLAY_TO_SLOT, cardId, slotIndex:Number(slotEl.dataset.slotIndex||0)});
        cleanup(cardEl);
        dragging = null;
      } else {
        cardEl.classList.toggle('is-preview');
      }
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onCancel);
    };

    const onCancel = ()=>{
      clearTimeout(pressTimer);
      if (dragging) { cleanup(cardEl); dragging=null; }
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onCancel);
    };

    root.addEventListener('pointermove', onMove, {passive:true});
    root.addEventListener('pointerup', onUp, {passive:true});
    root.addEventListener('pointercancel', onCancel, {passive:true});

    window.addEventListener('pointerup', onUp, {once:true});
    window.addEventListener('pointercancel', onCancel, {once:true});
    window.addEventListener('blur', onCancel, {once:true});
  }, {passive:true});
}
