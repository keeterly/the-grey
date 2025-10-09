import { A } from '../engine/rules.js';
import { CARD_TYPES } from '../engine/state.js';

const LONGPRESS_MS = 180;
let pressTimer = null;
let dragging = null;

function baseTransform(el){ return el.getAttribute('data-base') || ''; }
function applyTransform(el, dx=0, dy=0, scale=1){ const base = baseTransform(el); el.style.transform = `scale(${scale}) ${base} translate(${dx}px, ${dy}px)`; }

function toggleHighlights(root, type, on, cardEl){
  const yourBoard = root.querySelector('[data-board="YOU"]');
  const slots = [...yourBoard.querySelectorAll('[data-drop="slot"]')];
  const glyph = yourBoard.querySelector('[data-drop="glyph"]');
  const well  = document.getElementById('aetherWell');
  slots.forEach(s=> s.classList.toggle('highlight', on && type===CARD_TYPES.SPELL));
  if (glyph) glyph.classList.toggle('highlight', on && type===CARD_TYPES.GLYPH);
  if (well)  well.classList.toggle('highlight', on && Number(cardEl?.querySelector('.gain-chip')?.dataset.gain || 0) > 0);
}

function showHint(msg){
  const el = document.getElementById('hint');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 900);
}

export function wireHandDrag(root, dispatch) {
  const cleanup = (cardEl)=>{
    toggleHighlights(root, cardEl.dataset.type, false, cardEl);
    cardEl.classList.remove('is-dragging','is-held-instant','is-preview');
    applyTransform(cardEl, 0, 0, 1);
  };

  root.addEventListener('pointerdown', e=>{
    const cardEl = e.target.closest('[data-card-id][data-zone="hand"]');
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    const isInstant = cardEl.dataset.type === 'INSTANT';
    const startX = e.clientX, startY = e.clientY;

    pressTimer = setTimeout(()=>{
      cardEl.classList.add('is-preview');
      applyTransform(cardEl, 0, 0, 1.06);
      if (isInstant) cardEl.classList.add('is-held-instant');
    }, LONGPRESS_MS);

    const onMove = (ev)=>{
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && (Math.abs(dx)>5 || Math.abs(dy)>5)) {
        clearTimeout(pressTimer);
        cardEl.classList.remove('is-preview');
        dragging = { cardEl, cardId };
        toggleHighlights(root, cardEl.dataset.type, true, cardEl);
        cardEl.setPointerCapture(ev.pointerId);
        cardEl.classList.add('is-dragging');
      }
      if (dragging) { applyTransform(cardEl, dx, dy, 1.04); }
    };

    const onUp = (ev)=>{
      clearTimeout(pressTimer);
      const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
      const yourBoard = root.querySelector('[data-board="YOU"]');
      const slotEl = dropTarget?.closest('[data-drop="slot"]');
      const toGlyph = dropTarget?.closest('[data-drop="glyph"]');
      const well = document.getElementById('aetherWell');
      const onWell = well && (dropTarget===well || well.contains(dropTarget));

      if (dragging) {
        const onYourBoard = slotEl && yourBoard.contains(slotEl);
        const onYourGlyph = toGlyph && yourBoard.contains(toGlyph);
        if (onYourGlyph) dispatch({type:A.PLAY_TO_GLYPH, cardId});
        else if (onYourBoard) dispatch({type:A.PLAY_TO_SLOT, cardId, slotIndex:Number(slotEl.dataset.slotIndex||0)});
        else if (onWell) dispatch({type:A.DISCARD_FOR_AETHER, cardId});
        else {
          cardEl.classList.add('shake');
          showHint(cardEl.dataset.type==='SPELL' ? 'Spells go in your Spell Slots.' :
                   cardEl.dataset.type==='GLYPH' ? 'Glyphs go in your Glyph Slot.' :
                   'Drag gold-chip cards to the ⚡ Aetherwell.');
          setTimeout(()=>cardEl.classList.remove('shake'), 260);
        }
        cleanup(cardEl);
        dragging = null;
      } else {
        if (cardEl.classList.contains('is-preview')) { cardEl.classList.remove('is-preview'); applyTransform(cardEl,0,0,1); }
        else { cardEl.classList.add('is-preview'); applyTransform(cardEl,0,0,1.06); }
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
    window.addEventListener('mouseleave', onCancel, {once:true});
    window.addEventListener('blur', onCancel, {once:true});
  }, {passive:true});
}
