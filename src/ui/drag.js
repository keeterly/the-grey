import { A } from '../engine/rules.js';
import { CARD_TYPES } from '../engine/state.js';
const LONGPRESS_MS=150; let pressTimer=null; let dragging=null;
const baseOf=el=>el.getAttribute('data-base')||'';
const apply=(el,dx=0,dy=0,scale=1)=>{el.style.transform=`scale(${scale}) ${baseOf(el)} translate3d(${dx}px,${dy}px,0)`;}
function toggle(root,type,on,cardEl){const br=root.querySelector('[data-board="YOU"]'); const slots=[...br.querySelectorAll('[data-drop="slot"]')]; const glyph=br.querySelector('[data-drop="glyph"]'); const well=document.getElementById('aetherWell'); slots.forEach(s=>s.classList.toggle('highlight',on && type===CARD_TYPES.SPELL)); glyph?.classList.toggle('highlight', on && type===CARD_TYPES.GLYPH); if(well) well.classList.toggle('highlight', on && Number(cardEl?.querySelector('.gain-chip')?.dataset.gain||0)>0);}
export function wireHandDrag(root, dispatch){
  const cleanup=(el)=>{toggle(root,el.dataset.type,false,el); el.classList.remove('is-dragging','is-preview'); el.style.pointerEvents=''; apply(el,0,0,1);};
  root.addEventListener('pointerdown',e=>{
    const el=e.target.closest('[data-card-id][data-zone="hand"]'); if(!el) return; const id=el.dataset.cardId; const sx=e.clientX, sy=e.clientY;
    pressTimer=setTimeout(()=>{el.classList.add('is-preview'); apply(el,0,0,1.06);}, LONGPRESS_MS);
    const onMove=ev=>{const dx=ev.clientX-sx, dy=ev.clientY-sy; if(!dragging && (Math.abs(dx)>5||Math.abs(dy)>5)){clearTimeout(pressTimer); el.classList.remove('is-preview'); dragging={el,id}; toggle(root,el.dataset.type,true,el); el.setPointerCapture(ev.pointerId); el.classList.add('is-dragging'); el.style.pointerEvents='none';} if(dragging){ ev.preventDefault(); apply(el,dx,dy,1.04);} };
    const onUp=ev=>{clearTimeout(pressTimer); const t=document.elementFromPoint(ev.clientX,ev.clientY); const your=root.querySelector('[data-board="YOU"]'); const slot=t?.closest('[data-drop="slot"]'); const glyph=t?.closest('[data-drop="glyph"]'); const well=document.getElementById('aetherWell'); const onWell=well&&(t===well||well.contains(t));
      if(dragging){ if(glyph && your.contains(glyph)) dispatch({type:A.PLAY_TO_GLYPH, cardId:id});
        else if(slot && your.contains(slot)) dispatch({type:A.PLAY_TO_SLOT, cardId:id, slotIndex:Number(slot.dataset.slotIndex||0)});
        else if(onWell) dispatch({type:A.DISCARD_FOR_AETHER, cardId:id}); cleanup(el); dragging=null; } else { if(el.classList.contains('is-preview')){el.classList.remove('is-preview'); apply(el,0,0,1);} else { el.classList.add('is-preview'); apply(el,0,0,1.06);} }
      root.removeEventListener('pointermove',onMove); root.removeEventListener('pointerup',onUp); root.removeEventListener('pointercancel',onCancel); };
    const onCancel=()=>{clearTimeout(pressTimer); if(dragging){cleanup(el); dragging=null;} root.removeEventListener('pointermove',onMove); root.removeEventListener('pointerup',onUp); root.removeEventListener('pointercancel',onCancel);};
    root.addEventListener('pointermove',onMove,{passive:false}); root.addEventListener('pointerup',onUp,{passive:false}); root.addEventListener('pointercancel',onCancel,{passive:false});
    window.addEventListener('pointerup',onUp,{once:true}); window.addEventListener('pointercancel',onCancel,{once:true}); window.addEventListener('blur',onCancel,{once:true}); }, {passive:false}); }