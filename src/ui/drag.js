import { A } from '../engine/rules.js';
import { CARD_TYPES } from '../engine/state.js';

const LONGPRESS_MS = 220;
let pressTimer = null;
let dragging = null;

function toggleHighlights(root, type, on, cardEl){
  const yourBoard = root.querySelector('[data-board="YOU"]');
  const slots = [...yourBoard.querySelectorAll('[data-drop="slot"]')];
  const glyph = yourBoard.querySelector('[data-drop="glyph"]');
  const well  = document.getElementById('aetherWell');

  slots.forEach(s=> s.classList.toggle('highlight', on && type===CARD_TYPES.SPELL));
  if (glyph) glyph.classList.toggle('highlight', on && type===CARD_TYPES.GLYPH);
  if (well)  well.classList.toggle('highlight', on && Number(cardEl?.dataset.gain || cardEl?.getAttribute('data-gain') || 0) > 0);
}

export function wireHandDrag(root, dispatch) {
  const cleanup = (cardEl)=>{
    toggleHighlights(root, cardEl.dataset.type, false, cardEl);
    cardEl.classList.remove('is-dragging','is-held-instant');
    cardEl.style.transform='';
  };

  root.addEventListener('pointerdown', e=>{
    const cardEl = e.target.closest('[data-card-id][data-zone="hand"]');
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    const isInstant = cardEl.dataset.type === 'INSTANT';
    const gainAttr = cardEl.querySelector('.gain-chip')?.dataset.gain;
    if (gainAttr) cardEl.dataset.gain = gainAttr;

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
        toggleHighlights(root, cardEl.dataset.type, true, cardEl);
        cardEl.setPointerCapture(ev.pointerId);
        cardEl.classList.add('is-dragging');
      }
      if (dragging) { cardEl.style.transform = `translate(${dx}px, ${dy}px)`; }
    };

    const onUp = (ev)=>{
      clearTimeout(pressTimer);
      if (dragging) {
        const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
        const yourBoard = root.querySelector('[data-board="YOU"]');
        const slotEl = dropTarget?.closest('[data-drop="slot"]');
        const onYourBoard = slotEl && yourBoard.contains(slotEl);
        const toGlyph = dropTarget?.closest('[data-drop="glyph"]');
        const onYourGlyph = toGlyph && yourBoard.contains(toGlyph);
        const well = document.getElementById('aetherWell');
        const onWell = well && (dropTarget===well || well.contains(dropTarget));

        if (onYourGlyph) dispatch({type:A.PLAY_TO_GLYPH, cardId});
        else if (onYourBoard) dispatch({type:A.PLAY_TO_SLOT, cardId, slotIndex:Number(slotEl.dataset.slotIndex||0)});
        else if (onWell) dispatch({type:A.DISCARD_FOR_AETHER, cardId});
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
