// =========================================================
// THE GREY — Drag & Drop (classic + module)
// =========================================================
(function () {
  const $  = (s) => (s[0] === '#' ? document.getElementById(s.slice(1)) : document.querySelector(s));
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let dragging=null, overSlot=null;

  function addTargetHighlights(cardType){
    clearTargetHighlights();
    if (cardType==='Instant') return;
    $$('#playerSlots .slotCell').forEach(cell=>{
      const isGlyph = cell.classList.contains('glyph');
      const ok = (cardType==='Glyph') ? isGlyph : !isGlyph;
      cell.classList.add(ok?'drop-ok':'drop-no');
    });
  }
  function clearTargetHighlights(){
    $$('.slotCell').forEach(c=>c.classList.remove('drop-ok','drop-no','drop-hover'));
  }

  function down(e){
    const card = e.target.closest('.handCard'); if(!card) return;
    const type = card.dataset.ctype||'';

    if (type==='Instant'){
      card.classList.add('instantPulse'); setTimeout(()=>card.classList.remove('instantPulse'),500);
      return;
    }

    const pt = e.touches?e.touches[0]:e;
    dragging = { node:card, type, sx:pt.clientX, sy:pt.clientY, dx:0, dy:0 };
    card.classList.add('dragging');
    addTargetHighlights(type);

    window.addEventListener('pointermove', move, {passive:true});
    window.addEventListener('pointerup', up, {once:true});
  }
  function move(e){
    if(!dragging) return;
    const x=e.clientX, y=e.clientY;
    dragging.dx = x-dragging.sx;
    dragging.dy = y-dragging.sy;
    dragging.node.style.transform=`translate(${dragging.dx}px,${dragging.dy}px) rotate(${dragging.dx*.04}deg)`;

    const el=document.elementFromPoint(x,y);
    const slot = el?.closest?.('#playerSlots .slotCell') || null;
    if (slot!==overSlot){
      overSlot?.classList.remove('drop-hover');
      overSlot=slot;
      if (overSlot && overSlot.classList.contains('drop-ok')) overSlot.classList.add('drop-hover');
    }
  }
  function up(){
    if(!dragging) return;
    const n=dragging.node;
    window.removeEventListener('pointermove', move);

    let played=false;
    if (overSlot && overSlot.classList.contains('drop-ok')){
      n.click(); played=true; // UI click handler will dispatch
    }
    n.classList.remove('dragging');
    n.style.transform='';

    clearTargetHighlights(); overSlot=null; dragging=null;

    if(!played){ n.classList.add('drag-bounce'); setTimeout(()=>n.classList.remove('drag-bounce'),160); }
  }

  function attach(){
    const ribbon = document.querySelector('.ribbon'); if(!ribbon) return;
    ribbon.addEventListener('pointerdown', down, {passive:true});
    console.log('[Drag] initialized (classic): typed drop-target highlights');
  }

  window.DragCards = { refresh: ()=>{} };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// Named export for bridge-based import (no default)
export const DragCards = (typeof window!=='undefined' ? (window.DragCards||{}) : {});
