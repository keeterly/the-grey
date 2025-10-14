/* =========================================================
   Minimal UI engine that restores:
   - hand fan
   - drag/drop with slot gating & pulse
   - draw/discard animations
   - preview on long-press
   - Aether Flow costs + buy/spotlight
   Works with your existing GameLogic.js-rendered DOM.
   ========================================================= */

(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

  /* ---------- Fan the hand like MTGA ---------- */
  function fanHand() {
    const hand = $('.hand');
    if (!hand) return;
    const cards = $$('.hand .card', hand);
    hand.dataset.count = cards.length;

    const N = cards.length;
    const spread = Math.min(16, Math.max(8, N*1.2));  // degrees total
    const offset = (i) => (i - (N-1)/2);              // centered index
    const radius = Math.max(320, 34 * N);             // pixels to arc
    const lift = 24;                                  // vertical lift for middle

    cards.forEach((card, i) => {
      const k = offset(i);
      const rot = (spread/(N||1)) * k;
      const y  = -Math.max(0, lift - Math.abs(k)*3);
      const x  = k * 22; // horizontal spacing
      card.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      card.style.zIndex = String(1000 + i);
    });

    hand.classList.add('fan');
  }

  /* ---------- Long press preview ---------- */
  let pressTimer = null;
  function bindPreview(card){
    const peek = $('#peek-card');
    const previewOn = () => {
      if (!peek) return;
      peek.classList.add('show');
      // clone content (cheap snapshot)
      peek.innerHTML = card.outerHTML;
      const inner = $('.card', peek);
      if (inner) inner.classList.add('peek');
    };
    const previewOff = () => peek && peek.classList.remove('show');

    card.addEventListener('pointerdown', (e)=>{
      if (e.button===2) return;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(previewOn, 280);
    });
    ['pointerup','pointercancel','pointerleave','dragstart'].forEach(ev=>{
      card.addEventListener(ev, ()=>{ clearTimeout(pressTimer); previewOff(); });
    });
  }

  /* ---------- Drag & drop ---------- */
  const state = {
    dragging: null,
    ghost: null,
    fromZone: null,
  };

  function canDrop(cardEl, slotEl){
    if (!slotEl) return false;
    const accepts = slotEl.dataset.accept; // 'spell' | 'glyph' | 'discard'
    const type = (cardEl.dataset.type||'').toLowerCase();
    if (accepts === 'discard') return true;
    if (!type) return false;
    if (accepts === 'spell' && type==='spell') return true;
    if (accepts === 'glyph' && type==='glyph') return true;
    return false;
  }

  function nearestSlot(clientX, clientY){
    const slots = $$('.slot[data-accept]');
    let best = null, bestD = Infinity;
    slots.forEach(sl=>{
      const r = sl.getBoundingClientRect();
      const cx = Math.max(r.left, Math.min(clientX, r.right));
      const cy = Math.max(r.top , Math.min(clientY, r.bottom));
      const dx = clientX - cx, dy = clientY - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD){ bestD = d2; best = sl; }
    });
    return best;
  }

  function clearSlotHints(){ $$('.slot.can-drop').forEach(s=>s.classList.remove('can-drop')); }

  function onDragStart(e){
    const card = e.currentTarget;
    state.dragging = card;
    state.fromZone = card.closest('.hand, .slot, .flow-card');
    card.classList.add('dragging');
    card.setPointerCapture(e.pointerId);
  }
  function onDragMove(e){
    const {dragging} = state; if (!dragging) return;
    const dx = e.movementX, dy = e.movementY;
    const tr = dragging.style.transform || 'translate(0px,0px)';
    dragging.style.transform = tr.replace(/translate\([^)]*\)/,'') || '';
    dragging.style.transform = `translate(${dx}px, ${dy}px)`;
    // Slot pulse hint
    clearSlotHints();
    const sl = nearestSlot(e.clientX, e.clientY);
    if (sl && canDrop(dragging, sl)) sl.classList.add('can-drop');
  }
  function onDragEnd(e){
    const {dragging} = state; if (!dragging) return;
    clearSlotHints();
    const sl = nearestSlot(e.clientX, e.clientY);
    if (sl && canDrop(dragging, sl)){
      // drop success
      if (sl.dataset.accept === 'discard') {
        animateDiscard(dragging, ()=> dragging.remove());
        // inform game logic:
        window?.Game?.onDiscardForAether?.(dragging.dataset.cardId);
      } else {
        // place to slot — show full card in slot
        sl.innerHTML = '';
        sl.appendChild(dragging);
        dragging.style.position = 'static';
        dragging.style.transform = 'none';
        dragging.classList.remove('dragging');
        // notify:
        window?.Game?.onPlayToSlot?.(dragging.dataset.cardId, sl.dataset.accept);
      }
    } else {
      // return to hand
      dragging.classList.remove('dragging');
      dragging.style.transform = '';
      if (state.fromZone?.classList.contains('hand')){
        state.fromZone.appendChild(dragging);
        fanHand();
      }
    }
    state.dragging = null;
    state.fromZone = null;
  }

  function bindCardDrag(card){
    card.addEventListener('pointerdown', onDragStart);
    card.addEventListener('pointermove', onDragMove);
    card.addEventListener('pointerup', onDragEnd);
    card.addEventListener('pointercancel', onDragEnd);
    bindPreview(card);
  }

  /* ---------- Draw / Discard animations ---------- */
  function animateDraw(cardEl){
    cardEl.classList.add('anim-draw');
    setTimeout(()=>cardEl.classList.remove('anim-draw'), 600);
  }
  function animateDiscard(cardEl, after){
    cardEl.classList.add('anim-discard');
    setTimeout(()=>{ cardEl.classList.remove('anim-discard'); after?.(); }, 420);
  }

  /* ---------- Flow costs + buy + spotlight ---------- */
  function renderFlowCosts(){
    $$('#flow-row .flow-card').forEach((fc,i)=>{
      let pip = fc.querySelector('.cost-pip');
      if (!pip){
        pip = document.createElement('div');
        pip.className = 'cost-pip';
        pip.innerHTML = `
          <span class="gem">${svgGem(14,14)}</span>
          <span class="v">${flowCostAt(i)}</span> <span class="to">to buy</span>
        `;
        fc.appendChild(pip);
      }else{
        $('.v',pip).textContent = flowCostAt(i);
      }
    });
  }
  function flowCostAt(i){
    // river pattern 4,3,3,2,2
    return [4,3,3,2,2][i] ?? 2;
  }
  function bindFlowPurchases(){
    $$('#flow-row .flow-card .card').forEach(card=>{
      card.addEventListener('click', ()=>{
        const cost = Number(card.closest('.flow-card')?.querySelector('.v')?.textContent || '0');
        if (window?.Game?.canBuy?.(cost, card.dataset.cardId) === false) return;
        // spotlight and fly to discard
        card.classList.add('spotlight');
        setTimeout(()=>{
          window?.Game?.onBuyFromFlow?.(card.dataset.cardId, cost);
          // simple fly-to discard: ask game for discard position?
          const discard = $('.hud .hud-btn[data-target="discard"]') || $('.slot[data-accept="discard"]');
          if (discard){
            const r1 = card.getBoundingClientRect();
            const r2 = discard.getBoundingClientRect();
            const dx = r2.left - r1.left, dy = r2.top - r1.top;
            card.style.transition = 'transform .35s ease-in, opacity .35s ease-in';
            card.style.transform = `translate(${dx}px, ${dy}px) scale(.72)`;
            card.style.opacity = '0';
            setTimeout(()=> card.remove(), 360);
          } else {
            card.remove();
          }
        }, 560);
      }, {once:false});
    });
  }

  /* ---------- Portrait meters (hearts / gem sizes kept) ---------- */
  function svgGem(w=16,h=16){
    return `<svg viewBox="0 0 24 28" width="${w}" height="${h}" fill="${getComputedStyle(document.documentElement).getPropertyValue('--aether').trim()}"><path d="M12 0l7 7-7 21L5 7l7-7z"/></svg>`;
  }

  /* ---------- Bootstrapping after initial render ---------- */
  function wireAll(){
    // Fan
    fanHand();

    // Make hand cards draggable and previewable
    $$('.hand .card').forEach(bindCardDrag);

    // Slot accepts
    $$('.slot').forEach(sl=>{
      if (!sl.dataset.accept){ // annotate by label text if needed
        const label = (sl.textContent||'').toLowerCase();
        if (label.includes('glyph')) sl.dataset.accept = 'glyph';
        else if (label.includes('spell')) sl.dataset.accept = 'spell';
      }
    });

    // Discard target (your right HUD discard stack should have data-accept="discard")
    $$('.drop-discard, .slot-discard, .slot[data-discard], .slot-discard-target').forEach(el=>{
      el.classList.add('slot'); el.dataset.accept='discard';
    });

    // Flow
    renderFlowCosts();
    bindFlowPurchases();
  }

  /* ---------- Public hooks GameLogic can call ---------- */
  window.UI = {
    onRender: wireAll,              // call after you render a turn
    onHandChanged: ()=>{ fanHand(); $$('.hand .card').forEach(bindCardDrag); },
    onDrawCard: (cardEl)=>{ animateDraw(cardEl); bindCardDrag(cardEl); fanHand(); },
    onDiscardCard: (cardEl)=> animateDiscard(cardEl, ()=>cardEl.remove()),
    pulseSlotsFor: (type)=>{ // 'spell' | 'glyph' | 'discard'
      $$('.slot').forEach(sl=>{
        sl.classList.toggle('can-drop', sl.dataset.accept===type || (type && sl.dataset.accept==='discard'));
      });
      setTimeout(clearSlotHints, 1200);
    }
  };

  /* ---------- Kick once DOM is ready ---------- */
  if (document.readyState !== 'loading') wireAll();
  else document.addEventListener('DOMContentLoaded', wireAll);

  /* Redo hand fan on resize (keeps arc nice) */
  window.addEventListener('resize', ()=>requestAnimationFrame(fanHand));
})();
