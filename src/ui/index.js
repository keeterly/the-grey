// =========================================================
// THE GREY — UI ENTRY (v4.0, "Cleaner Look")
// =========================================================
//
// • Market buy: fly → center pop (glow pause) → player discard
// • Fixed MTG rows, aligned backgrounds
// • Big Aethergem pulse with flare on Æ gain
// • New top header: centered buttons; trance bar removed
// • HP rows (hearts): grey when lost; gold glow when Trance ready
// • Heart tooltip: shows Trance effects (active vs inactive)
// • 3 spell slots + 1 glyph, draw/discard fans, AI visible flights
//
// Drop-in replacement for /src/ui/index.js
// =========================================================

export function init(game) {
  // ----------------- Helpers -----------------
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const R  = (el) => el.getBoundingClientRect();
  const T  = (el, v) => { if (el) el.textContent = String(v); };
  const clamp = (n, a, b)=> Math.max(a, Math.min(b, n));
  const wait = (ms)=> new Promise(res=> setTimeout(res, ms));

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';
  const MAX_HP = 5;

  // change trackers
  let prevHandIds   = [];
  let prevAISig     = [];
  let prevAIHand    = 0;
  let prevFlowCards = [];
  let prevFlowRects = [];
  let prevAE        = 0;
  let firstPaint    = true;

  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);
  const slotSig = (s) => !s ? null : `${s.c?.id ?? s.c?.n ?? 'X'}:${s.ph ?? 1}`;

  // ----------------- DOM Boot -----------------
  buildTopHeader();     // centered controls + HP hearts
  ensureAetherGem();    // bottom-right diamond

  // Pile viewers (deck/discard chips should exist in your HTML)
  const deckBtn = $('#chipDeck');
  const discBtn = $('#chipDiscard');
  if (deckBtn) deckBtn.onclick = () => openPile('Deck',    (game.state?.deck)||[]);
  if (discBtn) discBtn.onclick = () => openPile('Discard', (game.state?.disc)||[]);

  // Button actions
  const onDraw  = () => game.dispatch({ type:'DRAW' });
  const onEnd   = () => game.dispatch({ type:'END_TURN' });
  const onReset = () => {
    try {
      game.dispatch({ type:'RESET', playerWeaver: DEFAULT_WEAVER_YOU, aiWeaver: DEFAULT_WEAVER_AI });
      game.dispatch({ type:'ENSURE_MARKET' });
      game.dispatch({ type:'START_GAME' });
      game.dispatch({ type:'START_TURN', first:true });
    } catch(e){ console.error('[UI] reset failed', e); }
  };
  $('#btnDraw') ?.addEventListener('click', onDraw);
  $('#btnEnd')  ?.addEventListener('click', onEnd);
  $('#btnReset')?.addEventListener('click', onReset);

  // ----------------- Ghost & Anim -----------------
  function makeGhostFromCard(card, fromRect, wide=false) {
    const g = document.createElement('div');
    g.className = 'cardFrame ghostFly';
    Object.assign(g.style, {
      position: 'fixed',
      left: `${fromRect.left}px`,
      top:  `${fromRect.top}px`,
      width: wide ? 'var(--card-w)' : `${Math.max(140, fromRect.width)}px`,
      margin: 0, zIndex: 9999, opacity: '1', pointerEvents: 'none'
    });
    g.innerHTML = `
      <div class="cardTop">
        <div class="cardTitle">${card?.n ?? 'Card'}</div>
        <div class="cardSub">${card?.t ?? ''}</div>
      </div>
      <div class="cardBottom">
        <div class="cardVal">${card?.v != null ? ('+'+card.v+'⚡') : ''}${card?.p != null ? (' · '+card.p+'ϟ') : ''}</div>
      </div>`;
    document.body.appendChild(g);
    return g;
  }
  function pathFrames(fromRect, toEl, { lift=0.18, rotate=8, scaleEnd=0.96 }={}) {
    const to = R(toEl);
    const dx = to.left - fromRect.left;
    const dy = to.top  - fromRect.top;
    const dist = Math.hypot(dx,dy);
    const arc = clamp(dist*lift, 80, 260);
    const side= Math.random()<.5 ? -1 : 1;
    const rot = side*rotate;
    return [
      { transform: `translate(0,0) rotate(0deg) scale(1)`, opacity: 1, offset: 0 },
      { transform: `translate(${dx*.55}px, ${dy*.45-arc}px) rotate(${rot}deg) scale(1.06)`, opacity: .95, offset: .55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot/2}deg) scale(${scaleEnd})`, opacity: .08, offset: 1 }
    ];
  }
  function animateDrawFan(deckBtn, newEls) {
    if (!deckBtn || !newEls?.length) return;
    const deck = R(deckBtn);
    newEls.forEach((el, i) => {
      const t = R(el);
      const dx = deck.left - t.left;
      const dy = deck.top  - t.top;
      el.style.transform  = `translate(${dx}px, ${dy}px) scale(.2) rotate(-12deg)`;
      el.style.opacity    = '0';
      el.style.transition = 'none'; void el.offsetWidth;
      const delay = i*130;
      el.style.transition = `transform .8s cubic-bezier(.2,.8,.3,1), opacity .8s ease`;
      setTimeout(()=>{ el.style.transform='translate(0,0) scale(1) rotate(0)'; el.style.opacity='1'; }, delay);
    });
  }
  function animateDiscardFanSameNodes(handEls, discardBtn) {
    if (!handEls?.length || !discardBtn) return Promise.resolve();
    const to = R(discardBtn);
    const last = handEls.length - 1;
    const promises = handEls.map((el,i)=> new Promise((resolve)=>{
      const r = R(el);
      const dx = to.left - r.left;
      const dy = to.top  - r.top;
      const spread = (i - last/2) * 12;
      el.style.transition='none'; void el.offsetWidth;
      el.style.transition=`transform .9s cubic-bezier(.26,.7,.32,1.06), opacity .9s ease`;
      el.style.transform =`translate(${dx}px, ${dy}px) scale(.72) rotate(${spread*.2}deg)`;
      el.style.opacity  ='.06';
      const done=()=>{ el.style.transition=''; el.style.transform=''; el.style.opacity=''; el.removeEventListener('transitionend',done); resolve(); };
      setTimeout(()=> el.addEventListener('transitionend',done,{once:true}), 0);
    }));
    return Promise.all(promises);
  }

  // ---- “Center pop” helper for BUY impact ----
  async function centerPopThen(toEl, ghostEl, { pause=420, scale=1.24 }={}) {
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
    const cx = vw/2, cy = vh/2;

    const gr = R(ghostEl);
    const dx = cx - (gr.left + gr.width/2);
    const dy = cy - (gr.top  + gr.height/2);

    // fly to center + enlarge and glow
    await new Promise((resolve)=>{
      ghostEl.style.transition = 'transform .42s cubic-bezier(.22,.8,.25,1), filter .42s ease';
      ghostEl.style.transform  = `translate(${dx}px, ${dy}px) scale(${scale})`;
      ghostEl.style.filter     = `drop-shadow(0 10px 40px rgba(255,190,80,.55)) saturate(1.08)`;
      setTimeout(resolve, 420);
    });

    // pause (hold)
    await wait(pause);

    // fly to target
    await new Promise((resolve)=>{
      const frames = pathFrames(R(ghostEl), toEl, { scaleEnd:.72 });
      ghostEl.animate(frames, { duration: 760, easing:'cubic-bezier(.2,.75,.25,1)', fill:'forwards' })
        .onfinish = ()=>{ ghostEl.remove(); resolve(); };
    });
  }

  // ----------------- Anchors for AI ghosts -----------------
  function aiDeckAnchor() {
    let a = $('#aiDeckAnchor');
    const slots = $('#aiSlots');
    if (!slots) return null;
    if (!a) {
      a = document.createElement('div');
      a.id = 'aiDeckAnchor';
      a.style.position='fixed';
      a.style.width='10px'; a.style.height='16px';
      a.style.pointerEvents='none';
      a.style.zIndex = 2;
      document.body.appendChild(a);
    }
    const r = R(slots);
    a.style.left = `${r.right - Math.min(120, r.width*0.15)}px`;
    a.style.top  = `${r.top - 18}px`;
    return a;
  }
  function aiAeAnchor() {
    return $('#aiHpRow') || $('#aiSlots') || null;
  }
  function aiDiscardAnchor() {
    let d = $('#aiDiscardChip');
    const ref = $('#aiSlots') || $('#aiHpRow');
    if (!ref) return null;
    if (!d) {
      d = document.createElement('button');
      d.id = 'aiDiscardChip';
      d.className = 'chipCirc ai';
      d.setAttribute('aria-label','AI Discard');
      d.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 10h10M9 7h6"/></svg>`;
      d.style.position = 'fixed';
      d.style.zIndex = 3;
      document.body.appendChild(d);
    }
    const r = R(ref);
    d.style.left = `${r.right + 10}px`;
    d.style.top  = `${r.top + 6}px`;
    return d;
  }

  // ----------------- HUD & Rows -----------------
  function renderHUD(S){
    T($('#deckCount'),    S.deck?.length ?? 0);
    T($('#discardCount'), S.disc?.length ?? 0);

    // hearts for you + ai
    drawHearts($('#youHpRow'), S.hp ?? 0, S.trance?.you);
    drawHearts($('#aiHpRow'),  S.ai?.hp ?? 0, S.trance?.ai);

    // aether gem
    T($('#aetherGemNum'), S.ae ?? 0);
    if ((S.ae ?? 0) > prevAE) bigGemPulse();
    prevAE = S.ae ?? 0;
  }
  function drawHearts(row, hp, trance) {
    if (!row) return;
    const max = MAX_HP;
    const ready = (trance?.cur ?? 0) >= (trance?.cap ?? 6);
    const effects = ready ? (trance?.effects ?? ['Trance Ready']) : (trance?.effects ?? ['Trance Inactive']);

    row.innerHTML = '';
    for (let i=0;i<max;i++){
      const h = document.createElement('div');
      h.className = 'heart';
      if (i >= hp) h.classList.add('lost');
      if (ready)  h.classList.add('glow');
      h.setAttribute('data-i', i);
      h.title = ready ? 'Trance Active' : 'Trance Inactive';
      h.onclick = (e)=> showTranceTooltip(e.currentTarget, ready, effects);
      row.appendChild(h);
    }
  }
  function showTranceTooltip(anchor, ready, effects){
    let tip = $('#tranceTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tranceTip';
      document.body.appendChild(tip);
    }
    tip.className = 'tranceTip';
    tip.innerHTML = `
      <div class="tt-head">${ready? 'Trance Effects' : 'Trance (inactive)'}</div>
      <ul class="tt-list">${(effects||[]).map(s=>`<li>${s}</li>`).join('')}</ul>`;
    const r = R(anchor);
    tip.style.left = `${r.left + r.width/2}px`;
    tip.style.top  = `${r.bottom + 8}px`;
    tip.classList.add('open');
    document.addEventListener('click', closeTipOnce, { once:true });
    function closeTipOnce(){ tip?.classList.remove('open'); }
  }

  // ----------------- Flow & Slots & Hand -----------------
  function renderFlow(S){
    const cells = $$('.marketCard');
    prevFlowCards = [];
    prevFlowRects = [];
    for (let i=0;i<cells.length;i++){
      const el = cells[i];
      const c = S.flowRow?.[i] || null;
      el.innerHTML=''; el.classList.toggle('empty', !c);
      el.onclick = null;
      prevFlowCards[i] = c ? { n:c.n, t:c.t, v:c.v, p:c.p, id:c.id } : null;
      prevFlowRects[i] = R(el);
      if (c){
        const card=document.createElement('div');
        card.className='cardFrame marketCardPanel';
        card.dataset.flowIndex=i;
        card.dataset.cardId=c.id ?? '';
        card.innerHTML=`
          <div class="cardTop"><div class="cardTitle">${c.n}</div><div class="cardSub">${c.t||''}</div></div>
          <div class="cardBottom"><div class="cardVal">${(c.v!=null?('+'+c.v+'⚡'):'')}${(c.p!=null?(' · '+c.p+'ϟ'):'')}</div></div>`;
        el.appendChild(card);

        el.onclick = () => { try { game.dispatch({ type:'BUY_FLOW', index:i }); } catch(e){ console.error('[UI] buy', e); } };
      }
    }
  }
  function renderHand(S){
    const ribbon = $('#ribbon');
    const beforeIds = prevHandIds.slice(0);
    ribbon.innerHTML='';
    const hand = S.hand || [];
    hand.forEach((c,i)=>{
      const el = document.createElement('div');
      el.className = 'cardFrame handCard';
      el.dataset.index=i; el.dataset.cardId=c?.id ?? '';
      el.innerHTML=`
        <div class="cardTop"><div class="cardTitle">${c.n}</div><div class="cardSub">${c.t||''}</div></div>
        <div class="cardBottom"><div class="cardVal">${(c.v!=null?('+'+c.v+'⚡'):'')}${(c.p!=null?(' · '+c.p+'ϟ'):'')}</div></div>`;
      el.onclick = () => {
        try {
          if (c.t==='Instant') game.dispatch({ type:'CHANNEL_FROM_HAND', index:i });
          else                 game.dispatch({ type:'PLAY_FROM_HAND',    index:i });
        } catch(e){ console.error('[UI] hand click', e); }
      };
      ribbon.appendChild(el);
    });
    const afterIds = cardIds(hand);
    const newIds = afterIds.filter(id=>!beforeIds.includes(id));
    if (newIds.length && !firstPaint){
      const deckBtn = $('#chipDeck');
      if (deckBtn){
        const newEls = newIds.map(id=> ribbon.querySelector(`.handCard[data-card-id="${id}"]`)).filter(Boolean);
        animateDrawFan(deckBtn, newEls);
      }
    }
    prevHandIds = afterIds;
  }

  const GLYPH_BACK = `
    <div class="cardFrame glyphBack">
      <div class="cardTop"><div class="cardTitle">Glyph</div><div class="cardSub">Face Down</div></div>
      <div class="cardBottom"><div class="cardVal">✶</div></div>
    </div>`;

  function renderGlyphSlot(glyphs) {
    const wrap = document.createElement('div');
    wrap.className = 'glyphSlot';
    if (!glyphs || glyphs.length === 0) {
      wrap.innerHTML = '<div class="slotGhost">Empty</div>';
      return wrap;
    }
    wrap.innerHTML = GLYPH_BACK;
    const badge = document.createElement('div');
    badge.className = 'glyphCount';
    badge.textContent = glyphs.length;
    wrap.appendChild(badge);
    return wrap;
  }

  function renderSlots(S){
    const youEl=$('#playerSlots'), aiEl=$('#aiSlots');

    if (youEl){
      youEl.innerHTML='';
      const spells = (S.slots||[]);
      for (let i=0;i<3;i++){
        const s = spells[i] || null;
        const cell = document.createElement('div');
        cell.className='slotCell';
        cell.dataset.slot=i;
        if (!s){ cell.classList.add('empty'); cell.innerHTML='<div class="slotGhost">Empty</div>'; }
        else {
          cell.innerHTML=`
            <div class="cardFrame slotPanel">
              <div class="cardTop"><div class="cardTitle">${s.c.n}</div><div class="cardSub">${s.c.t||'Spell'}</div></div>
              <div class="cardBottom"><div class="cardVal">${(s.c.v!=null?('+'+s.c.v+'⚡'):'')} · ${s.ph||1}/${s.c.p||1}</div></div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }
        cell.onclick=()=>{ if (s) game.dispatch({ type:'ADVANCE', slot:i }); };
        youEl.appendChild(cell);
      }
      const glyphCell = document.createElement('div');
      glyphCell.className = 'slotCell glyph';
      glyphCell.appendChild(renderGlyphSlot(S.glyphs||[]));
      youEl.appendChild(glyphCell);
    }

    if (aiEl){
      aiEl.innerHTML='';
      const spells = (S.ai?.slots||[]);
      for (let i=0;i<3;i++){
        const s = spells[i] || null;
        const cell = document.createElement('div');
        cell.className='slotCell ai';
        if (!s){ cell.classList.add('empty'); cell.innerHTML='<div class="slotGhost">Empty</div>'; }
        else {
          cell.innerHTML=`
            <div class="cardFrame slotPanel">
              <div class="cardTop"><div class="cardTitle">${s.c.n}</div><div class="cardSub">${s.c.t||'Spell'}</div></div>
              <div class="cardBottom"><div class="cardVal">${(s.c.v!=null?('+'+s.c.v+'⚡'):'')} · ${s.ph||1}/${s.c.p||1}</div></div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }
        aiEl.appendChild(cell);
      }
      const glyphCell = document.createElement('div');
      glyphCell.className = 'slotCell ai glyph';
      glyphCell.appendChild(renderGlyphSlot((S.ai?.glyphs)||[]));
      aiEl.appendChild(glyphCell);
    }
  }

  // ----------------- Modal (pile viewer) -----------------
  let modal=null;
  function ensureModal(){
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id='pileModal';
    modal.innerHTML = `
      <div class="pm-backdrop"></div>
      <div class="pm-sheet">
        <div class="pm-head">
          <div class="pm-title" id="pmTitle">Pile</div>
          <button class="pm-close" id="pmClose">×</button>
        </div>
        <div class="pm-grid" id="pmGrid"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.pm-backdrop').onclick = closeModal;
    modal.querySelector('#pmClose').onclick = closeModal;
    window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });
    return modal;
  }
  function openPile(title, cards){
    ensureModal();
    $('#pmTitle').textContent = title;
    const grid = $('#pmGrid');
    grid.innerHTML='';
    (cards||[]).forEach(c=>{
      const el=document.createElement('div');
      el.className='cardFrame pmCard';
      el.innerHTML=`
        <div class="cardTop"><div class="cardTitle">${c.n}</div><div class="cardSub">${c.t||''}</div></div>
        <div class="cardBottom"><div class="cardVal">${(c.v!=null?('+'+c.v+'⚡'):'')}${(c.p!=null?(' · '+c.p+'ϟ'):'')}</div></div>`;
      grid.appendChild(el);
    });
    modal.classList.add('open');
  }
  function closeModal(){ if (modal) modal.classList.remove('open'); }

  // ----------------- Draw Tick + AI turn -----------------
  async function draw(){
    const S = game.state || {};

    // capture before
    const oldAISig  = prevAISig.slice(0);
    const oldAIHand = prevAIHand;
    const oldFlow   = prevFlowCards.map(c=> c ? ({...c}) : null);
    const oldRects  = prevFlowRects.slice(0);

    renderHUD(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    // update after
    prevAISig  = (S.ai?.slots||[]).map(slotSig);
    prevAIHand = (S.ai?.hand?.length ?? 0);

    // AI ghosts (skip first paint)
    if (!firstPaint) {
      try{
        const deckA = aiDeckAnchor();
        const aeA   = aiAeAnchor();
        const aiDisc= aiDiscardAnchor();

        // play
        const aiCells = $$('#aiSlots .slotCell');
        for (let i=0;i<prevAISig.length;i++){
          if (oldAISig[i]===null && prevAISig[i]!==null) {
            const target = aiCells[i]?.querySelector('.slotPanel') || aiCells[i];
            const slot = (S.ai?.slots||[])[i];
            if (deckA && target && slot?.c){
              const fr = R(deckA);
              const ghost = makeGhostFromCard(slot.c, fr);
              ghost.animate(
                pathFrames(fr, target, { scaleEnd:.95 }),
                { duration: 840, easing: 'cubic-bezier(.18,.75,.25,1)', fill: 'forwards' }
              ).onfinish = ()=> ghost.remove();
            }
          }
        }
        // channel
        const newSlot = prevAISig.some((sig,i)=> oldAISig[i]===null && sig!==null);
        if (!newSlot && prevAIHand < oldAIHand) {
          const deckA2 = aiDeckAnchor();
          if (deckA2 && aeA){
            const fr = R(deckA2);
            const ghost = makeGhostFromCard({ n:'Channel', t:'Instant', v:1 }, fr);
            ghost.animate(
              pathFrames(fr, aeA, { scaleEnd:.45 }),
              { duration: 760, easing: 'cubic-bezier(.2,.7,.2,1)', fill:'forwards' }
            ).onfinish = ()=> ghost.remove();
          }
        }
        // buy
        const flowCells = $$('.marketCard');
        for (let i=0;i<oldFlow.length;i++){
          if (oldFlow[i] && !prevFlowCards[i]) {
            const fromRect = oldRects[i] || R(flowCells[i]);
            if (aiDisc) {
              const ghost = makeGhostFromCard(oldFlow[i], fromRect);
              ghost.animate(
                pathFrames(fromRect, aiDisc, { scaleEnd:.72 }),
                { duration: 780, easing:'cubic-bezier(.18,.75,.25,1)', fill:'forwards' }
              ).onfinish = ()=> ghost.remove();
            }
          }
        }
        // advance pulse
        for (let i=0;i<prevAISig.length;i++){
          const a=prevAISig[i], b=oldAISig[i];
          if (a && b && a!==b){
            const cell = $$('#aiSlots .slotCell')[i];
            if (cell){ cell.classList.add('pulse'); setTimeout(()=>cell.classList.remove('pulse'), 520); }
          }
        }
      }catch(e){ console.warn('[UI] AI ghost diff failed', e); }
    }

    // refresh drag
    if (window.DragCards?.refresh) window.DragCards.refresh();

    firstPaint = false;
  }

  async function runAiTurn(){
    game.dispatch({ type:'AI_DRAW'  }); await draw(); await wait(220);
    game.dispatch({ type:'AI_PLAY_SPELL' }); await draw(); await wait(260);
    game.dispatch({ type:'AI_CHANNEL' }); await draw(); await wait(220);
    game.dispatch({ type:'AI_ADVANCE' }); await draw(); await wait(260);
    game.dispatch({ type:'AI_BUY' });    await draw(); await wait(220);
    game.dispatch({ type:'AI_SPEND_TRANCE' }); await draw(); await wait(200);
  }

  // ----------------- Dispatch wrapper -----------------
  if (game && typeof game.dispatch==='function' && !game.__uiWrapped){
    const orig = game.dispatch;

    game.dispatch = async (action) => {

      // BUY: fly → center pop → discard, then state
      if (action?.type === 'BUY_FLOW' && typeof action.index === 'number') {
        const idx = action.index;
        const flowCell = $$('.marketCard')[idx];
        const fromRect = flowCell ? R(flowCell) : prevFlowRects[idx];
        const c = prevFlowCards[idx];
        const discardBtn = $('#chipDiscard');

        if (c && fromRect && discardBtn) {
          const ghost = makeGhostFromCard(c, fromRect, true);
          // first, fly to original center (smooth out if starting far)
          await new Promise((resolve)=>{
            ghost.animate(
              pathFrames(fromRect, document.body, { scaleEnd:1 }),
              { duration: 300, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' }
            ).onfinish = resolve;
          });
          await centerPopThen(discardBtn, ghost, { pause: 420, scale: 1.28 });
        }
        const res = orig(action); await draw(); return res;
      }

      // END_TURN: discard fan, AI, then START_TURN
      if (action?.type === 'END_TURN') {
        const liveHand = Array.from(document.querySelectorAll('.ribbon .handCard'));
        const discardBtn = $('#chipDiscard');
        await animateDiscardFanSameNodes(liveHand, discardBtn);
        const res = orig(action); await draw();
        await runAiTurn();
        orig({ type:'START_TURN' }); await draw();
        return res;
      }

      // PLAY_FROM_HAND: hand → slot or glyph
      if (action?.type === 'PLAY_FROM_HAND' && typeof action.index === 'number') {
        const handEl = document.querySelector(`.ribbon .handCard[data-index="${action.index}"]`);
        const fromRect = handEl ? R(handEl) : null;

        const before = (game.state || {});
        const wasEmptyIdx = (before.slots||[]).findIndex(s=>!s);
        const isGlyph = before.hand?.[action.index]?.t === 'Glyph';

        const res = orig(action); await draw();

        let targetEl = null;
        if (isGlyph) {
          targetEl = $('#playerSlots .glyphSlot .glyphBack') || $('#playerSlots .glyph');
        } else {
          const after = (game.state || {}).slots || [];
          let filledIndex = after.findIndex((s,i)=> s && i === (wasEmptyIdx===-1? i : wasEmptyIdx));
          if (filledIndex < 0) filledIndex = after.findIndex(s=>s);
          const cell = $$('#playerSlots .slotCell')[filledIndex];
          targetEl = cell?.querySelector('.slotPanel') || cell;
          if (cell) { cell.classList.add('pulse'); setTimeout(()=>cell.classList.remove('pulse'), 520); }
        }

        if (fromRect && targetEl) {
          const ghost = makeGhostFromCard(before.hand?.[action.index] || {n:'Card'}, fromRect);
          ghost.animate(
            pathFrames(fromRect, targetEl, { scaleEnd:.9 }),
            { duration: 720, easing: 'cubic-bezier(.2,.75,.25,1)', fill:'forwards' }
          ).onfinish = ()=> ghost.remove();
        }
        return res;
      }

      const result = orig(action);
      await draw();
      return result;
    };
    game.__uiWrapped = true;
  }

  // ----------------- First paint -----------------
  draw();
  console.log('[UI] v4.0 — centered controls, hearts, big gem pulse, center-pop buy, aligned rows');

  // ----------------- UI builders -----------------
  function buildTopHeader(){
    if ($('#topHeader')) return;
    const bar = document.createElement('div');
    bar.id = 'topHeader';
    bar.innerHTML = `
      <div id="youHpRow" class="hpRow left"></div>
      <div class="topCtrls">
        <button id="btnReset" title="Reset">↺</button>
        <button id="btnDraw"  title="Draw">⇧</button>
        <button id="btnEnd"   title="End Turn">⏵</button>
      </div>
      <div id="aiHpRow" class="hpRow right"></div>`;
    document.body.appendChild(bar);
  }

  function ensureAetherGem(){
    if (!$('#aetherGem')) {
      const gem = document.createElement('div');
      gem.id = 'aetherGem';
      gem.innerHTML = `<div class="diamond"><span id="aetherGemNum">0</span><div class="flare"></div></div>`;
      document.body.appendChild(gem);
    }
  }
  function bigGemPulse(){
    const gem = $('#aetherGem');
    if (!gem) return;
    gem.classList.remove('shimmer'); // restart
    void gem.offsetWidth;
    gem.classList.add('shimmer');
    setTimeout(()=> gem.classList.remove('shimmer'), 950);
  }
}

// ----------------- Embedded styles -----------------
const style = document.createElement('style');
style.textContent = `
  :root {
    --card-w: 160px;                     /* MTG 63×88 aspect */
    --card-h: calc(var(--card-w) * 88 / 63);
    --row-pad: 12px;
    --zone-h: calc(var(--card-h) + var(--row-pad) * 2);
  }

  /* Remove old trance meter region if still present */
  .tranceDock, .tranceMenu { display:none !important; }

  /* Fixed-height zones perfectly aligned */
  .zone { min-height: var(--zone-h); max-height: var(--zone-h); }
  .flowWrap { min-height: var(--zone-h); max-height: var(--zone-h); }
  .wrap > .zone { display:block; }

  /* Aetherflow grid */
  .flowGrid { display:grid; grid-template-columns: repeat(5, var(--card-w)); justify-content:center; gap:16px; }
  .marketCard { width: var(--card-w); height: var(--card-h); display:flex; align-items:center; justify-content:center; }
  .marketCard.empty { background: transparent; border-radius: 12px; border: 1px dashed rgba(0,0,0,.08); }

  /* Hand ribbon */
  .ribbon { display:flex; flex-wrap:nowrap; overflow-x:auto; justify-content:center; padding:12px; gap:10px; }

  .cardFrame {
    aspect-ratio: 63 / 88;
    width: var(--card-w);
    border-radius: 12px;
    background: #fff;
    border: 1px solid rgba(0,0,0,.10);
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    display:flex; flex-direction:column; justify-content:space-between;
  }
  .cardTop { padding: 8px 10px 0; }
  .cardBottom { padding: 0 10px 8px; }
  .cardTitle { font-weight:700; font-size:15px; line-height:1.15; color:#262626; }
  .cardSub   { font-size:12.5px; color:#616161; margin-top:2px; }
  .cardVal   { font-size:13px; color:#b21d1d; margin-top:4px; }
  .handCard  { cursor:pointer; transition:transform .2s, box-shadow .2s; background: linear-gradient(180deg,#fff 0%,#faf7ef 100%); }
  .handCard:hover { transform: translateY(-4px); box-shadow: 0 10px 18px rgba(0,0,0,.22); }
  .marketCardPanel { background: linear-gradient(180deg,#fff 0%,#f6f6ff 100%); }

  /* 3 spells + 1 glyph (both sides) */
  #playerSlots, #aiSlots {
    display:grid; grid-template-columns: repeat(4, var(--card-w));
    gap: 16px; padding: var(--row-pad); justify-content:center;
    min-height: var(--zone-h); max-height: var(--zone-h); align-items:center;
  }
  .slotCell {
    display:flex; align-items:center; justify-content:center;
    width: var(--card-w); height: var(--card-h);
    border-radius:16px; background:#fffaf4;
    border:1px solid rgba(0,0,0,.06); box-shadow:0 2px 6px rgba(0,0,0,.05) inset;
    transition: transform .15s, box-shadow .15s;
  }
  .slotCell:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.12); }
  .slotCell.empty { color:#9a9a9a; font-size:12px; }
  .slotCell.ai { background:#f7f7fb; }
  .slotCell.advUsed { opacity:.85; }
  .slotCell.pulse { animation: slotPulse .52s ease-out; }
  @keyframes slotPulse {
    0% { box-shadow:0 0 0 0 rgba(90,140,220,0); }
    50%{ box-shadow:0 0 0 8px rgba(90,140,220,.18); }
    100%{ box-shadow:0 0 0 0 rgba(90,140,220,0); }
  }

  .slotCell.glyph { background: #fbfbff; }
  .glyphSlot { position:relative; display:flex; align-items:center; justify-content:center; width:100%; height:100%; }
  .glyphBack { width:100%; height:100%; background:linear-gradient(180deg,#fff 0%, #eef1ff 100%); }
  .glyphCount {
    position:absolute; right:6px; bottom:6px;
    background:#222; color:#fff; font-size:11px; padding:2px 6px; border-radius:10px;
  }

  /* Fancy ghost */
  .ghostFly { border-radius:12px; overflow:hidden; will-change: transform, opacity, filter; }

  /* Top header (cleaner look) */
  #topHeader {
    position: fixed; top: 8px; left: 0; right: 0; z-index: 5000;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items:center;
    pointer-events:none;
  }
  .topCtrls { pointer-events:auto; display:flex; gap:10px; justify-content:center; }
  .topCtrls button {
    width:38px; height:38px; border-radius:12px; border:1px solid rgba(0,0,0,.12);
    background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.14); cursor:pointer; font-size:16px;
  }
  .topCtrls button:hover { transform:translateY(-1px); }

  .hpRow { display:flex; gap:8px; align-items:center; justify-content:flex-start; padding:0 12px; }
  .hpRow.right { justify-content:flex-end; }
  .heart {
    width:22px; height:22px; border-radius:50%;
    background: radial-gradient(circle at 40% 35%, #ff6d6d 0%, #d73c3c 60%, #942727 100%);
    box-shadow: 0 1px 0 rgba(255,255,255,.5) inset, 0 2px 6px rgba(0,0,0,.25);
    position:relative; cursor:pointer; transition: transform .12s;
  }
  .heart:hover { transform: translateY(-1px) scale(1.05); }
  .heart.lost { background: linear-gradient(180deg,#dfdfdf,#bfbfbf); box-shadow: 0 0 0 1px rgba(0,0,0,.12) inset; }
  .heart.glow { animation: heartGlow 1.2s ease-in-out infinite; }
  @keyframes heartGlow {
    0%   { box-shadow: 0 0 0 0 rgba(240,170,40,.0), 0 2px 6px rgba(0,0,0,.25); }
    50%  { box-shadow: 0 0 14px 6px rgba(255,200,80,.55), 0 2px 10px rgba(0,0,0,.3); }
    100% { box-shadow: 0 0 0 0 rgba(240,170,40,.0), 0 2px 6px rgba(0,0,0,.25); }
  }

  /* Trance tooltip */
  #tranceTip { position:fixed; transform:translateX(-50%); background:#fff; border:1px solid rgba(0,0,0,.1);
    border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.25); padding:10px 12px; z-index:8000;
    opacity:0; pointer-events:none; transition:opacity .18s ease; }
  #tranceTip.open { opacity:1; pointer-events:auto; }
  .tt-head{ font-weight:700; margin-bottom:6px; }
  .tt-list{ margin:0; padding-left:18px; }

  /* Aethergem (diamond + flare) */
  #aetherGem {
    position:fixed; right:18px; bottom:110px; z-index:4000;
    width:64px; height:64px; display:flex; align-items:center; justify-content:center;
    pointer-events:none;
  }
  #aetherGem .diamond {
    width: 52px; height: 52px; transform: rotate(45deg);
    background: linear-gradient(135deg, #f9e29a 0%, #f2c65b 50%, #e29b2e 100%);
    border: 2px solid #8d5a1a; border-radius: 10px;
    display:flex; align-items:center; justify-content:center; position:relative;
  }
  #aetherGem .diamond span {
    transform: rotate(-45deg); font-weight:800; color:#3b2a14; text-shadow:0 1px 0 rgba(255,255,255,.6); font-size:16px;
  }
  #aetherGem .diamond .flare {
    position:absolute; inset:-6px; border-radius:12px; transform: rotate(-45deg);
    background: radial-gradient(closest-side, rgba(255,220,140,.55), rgba(255,220,140,0));
    opacity:0; filter: blur(2px);
  }
  #aetherGem.shimmer .diamond .flare { animation: gemFlare .95s ease both; }
  @keyframes gemFlare {
    0% { opacity:0; transform: rotate(-45deg) scale(.9); }
    30%{ opacity:.9; transform: rotate(-45deg) scale(1.1); }
    100%{ opacity:0; transform: rotate(-45deg) scale(1.25); }
  }

  /* Hide old bottom FABs */
  .fabDial { display: none !important; }

  /* Modal (fixed size) */
  #pileModal { position:fixed; inset:0; z-index:10000; display:none; }
  #pileModal.open { display:block; }
  .pm-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.28); backdrop-filter:saturate(120%) blur(1px); }
  .pm-sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width: 920px; height: 620px; background:#fff; border-radius:16px; box-shadow:0 12px 60px rgba(0,0,0,.35);
    display:flex; flex-direction:column; }
  .pm-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid rgba(0,0,0,.07); }
  .pm-title { font-weight:700; }
  .pm-close { background:transparent; border:0; font-size:24px; line-height:1; cursor:pointer; }
  .pm-grid { padding:16px; display:grid; grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr)); gap:12px; overflow:auto; }
  .pmCard { background:linear-gradient(180deg,#fff 0%, #f7f7ff 100%); }
`;
document.head.appendChild(style);

if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
