// =========================================================
// THE GREY — UI ENTRY (v4.1)
// • Adds typed drop-target highlighting (pairs with drag.js v2.1)
// • Instants self-pulse when picked up
// • Hides boot check
// • Safer ghost math (viewport clamp + fallbacks) to avoid off-screen jumps
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const R  = (el) => el.getBoundingClientRect();
  const T  = (el, v) => { if (el) el.textContent = String(v); };
  const clamp = (n, a, b)=> Math.max(a, Math.min(b, n));
  const wait = (ms)=> new Promise(res=> setTimeout(res, ms));

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';
  const MAX_HP = 5;

  let prevHandIds   = [];
  let prevAISig     = [];
  let prevAIHand    = 0;
  let prevFlowCards = [];
  let prevFlowRects = [];
  let prevAE        = 0;
  let firstPaint    = true;

  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);
  const slotSig = (s) => !s ? null : `${s.c?.id ?? s.c?.n ?? 'X'}:${s.ph ?? 1}`;

  // Hide boot check overlay if present
  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  buildTopHeader();
  ensureAetherGem();

  const deckBtn = $('#chipDeck');
  const discBtn = $('#chipDiscard');
  if (deckBtn) deckBtn.onclick = () => openPile('Deck',    (game.state?.deck)||[]);
  if (discBtn) discBtn.onclick = () => openPile('Discard', (game.state?.disc)||[]);

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

  // ---------- Ghost helpers (stutter/off-screen safe) ----------
  function safeRect(el, fallbackCenter=false) {
    try {
      if (el) return R(el);
    } catch {}
    const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const w = 160, h = w * 88 / 63;
    if (fallbackCenter) {
      return { left: vw/2 - w/2, top: vh/2 - h/2, width:w, height:h, right: vw/2 + w/2, bottom: vh/2 + h/2 };
    }
    return { left: 10, top: 10, width:w, height:h, right: 10+w, bottom: 10+h };
  }

  function makeGhostFromCard(card, fromRect, wide=false) {
    const g = document.createElement('div');
    g.className = 'cardFrame ghostFly';
    Object.assign(g.style, {
      position: 'fixed',
      left: `${fromRect.left}px`,
      top:  `${fromRect.top}px`,
      width: `${Math.max(140, fromRect.width)}px`,
      margin: 0, zIndex: 9999, opacity: '1', pointerEvents: 'none',
      willChange: 'transform, opacity, filter'
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
    const toRect = safeRect(toEl, true);
    const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    // clamp deltas to viewport (avoid wild off-screen)
    let dx = toRect.left - fromRect.left;
    let dy = toRect.top  - fromRect.top;
    dx = clamp(dx, -vw, vw);
    dy = clamp(dy, -vh, vh);

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

  async function centerPopThen(toEl, ghostEl, { pause=420, scale=1.24 }={}) {
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
    const cx = vw/2, cy = vh/2;

    const gr = safeRect(ghostEl);
    const dx = cx - (gr.left + gr.width/2);
    const dy = cy - (gr.top  + gr.height/2);

    await new Promise((resolve)=>{
      ghostEl.style.transition = 'transform .42s cubic-bezier(.22,.8,.25,1), filter .42s ease';
      ghostEl.style.transform  = `translate(${dx}px, ${dy}px) scale(${scale})`;
      ghostEl.style.filter     = `drop-shadow(0 10px 40px rgba(255,190,80,.55)) saturate(1.08)`;
      setTimeout(resolve, 420);
    });
    await wait(pause);
    await new Promise((resolve)=>{
      const frames = pathFrames(safeRect(ghostEl), toEl, { scaleEnd:.72 });
      ghostEl.animate(frames, { duration: 760, easing:'cubic-bezier(.2,.75,.25,1)', fill:'forwards' })
        .onfinish = ()=>{ ghostEl.remove(); resolve(); };
    });
  }

  // --------- AI anchors (unchanged logic, now safer) ----------
  function aiDeckAnchor() {
    let a = $('#aiDeckAnchor');
    const slots = $('#aiSlots');
    if (!slots) return null;
    if (!a) {
      a = document.createElement('div');
      a.id = 'aiDeckAnchor';
      a.style.position='fixed';
      a.style.width='10px'; a.style.height='16px';
      a.style.pointerEvents='none'; a.style.zIndex = 2;
      document.body.appendChild(a);
    }
    const r = safeRect(slots);
    a.style.left = `${r.right - Math.min(120, r.width*0.15)}px`;
    a.style.top  = `${r.top - 18}px`;
    return a;
  }
  function aiAeAnchor() { return $('#aiHpRow') || $('#aiSlots') || null; }
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
      d.style.position = 'fixed'; d.style.zIndex = 3;
      document.body.appendChild(d);
    }
    const r = safeRect(ref);
    d.style.left = `${r.right + 10}px`;
    d.style.top  = `${r.top + 6}px`;
    return d;
  }

  // ---------- HUD / rows ----------
  function renderHUD(S){
    T($('#deckCount'),    S.deck?.length ?? 0);
    T($('#discardCount'), S.disc?.length ?? 0);
    drawHearts($('#youHpRow'), S.hp ?? 0, S.trance?.you);
    drawHearts($('#aiHpRow'),  S.ai?.hp ?? 0, S.trance?.ai);
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
    document.addEventListener('click', () => tip.classList.remove('open'), { once:true });
  }

  // ---------- Flow / Hand / Slots ----------
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
      prevFlowRects[i] = safeRect(el);
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
      el.dataset.index   = i;
      el.dataset.cardId  = c?.id ?? '';
      el.dataset.ctype   = c?.t   ?? '';
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

  // ---------- Modal ----------
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

  // ---------- Anim pieces reused ----------
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

  // ---------- Draw loop ----------
  async function draw(){
    const S = game.state || {};

    const oldAISig  = prevAISig.slice(0);
    const oldAIHand = prevAIHand;
    const oldFlow   = prevFlowCards.map(c=> c ? ({...c}) : null);
    const oldRects  = prevFlowRects.slice(0);

    renderHUD(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    prevAISig  = (S.ai?.slots||[]).map(slotSig);
    prevAIHand = (S.ai?.hand?.length ?? 0);

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
              const fr = safeRect(deckA, true);
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
            const fr = safeRect(deckA2, true);
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
            const fromRect = oldRects[i] || safeRect(flowCells[i], true);
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

  if (game && typeof game.dispatch==='function' && !game.__uiWrapped){
    const orig = game.dispatch;

    game.dispatch = async (action) => {
      if (action?.type === 'BUY_FLOW' && typeof action.index === 'number') {
        const idx = action.index;
        const flowCell = $$('.marketCard')[idx];
        const fromRect = flowCell ? R(flowCell) : prevFlowRects[idx];
        const c = prevFlowCards[idx];
        const discardBtn = $('#chipDiscard');

        if (c && fromRect && discardBtn) {
          const ghost = makeGhostFromCard(c, fromRect, true);
          // smooth first hop
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

      if (action?.type === 'END_TURN') {
        const liveHand = Array.from(document.querySelectorAll('.ribbon .handCard'));
        const discardBtn = $('#chipDiscard');
        await animateDiscardFanSameNodes(liveHand, discardBtn);
        const res = orig(action); await draw();
        await runAiTurn();
        orig({ type:'START_TURN' }); await draw();
        return res;
      }

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

  draw();
  console.log('[UI] v4.1 — typed highlights, instant pulse, safer ghosts, boot-check hidden');

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
    gem.classList.remove('shimmer'); void gem.offsetWidth;
    gem.classList.add('shimmer');
    setTimeout(()=> gem.classList.remove('shimmer'), 950);
  }
}

// ------------- Styles & highlights -------------
const style = document.createElement('style');
style.textContent = `
  /* Hide boot check completely */
  .bootCheck { display: none !important; }

  /* Drop target highlighting */
  .slotCell.drop-ok    { outline: 2px solid rgba(72, 140, 255, .65); box-shadow: 0 8px 20px rgba(72,140,255,.20); }
  .slotCell.drop-hover { outline-color: rgba(72, 140, 255, 1);  box-shadow: 0 10px 30px rgba(72,140,255,.28); transform: translateY(-2px) scale(1.02); }
  .slotCell.drop-no    { outline: 2px dashed rgba(0,0,0,.12); filter: grayscale(.2) opacity(.8); }

  /* Instant pick-up pulse */
  .handCard.instantPulse {
    animation: instantPulse .5s ease both;
    box-shadow: 0 12px 24px rgba(255,160,60,.25), 0 0 0 4px rgba(255,190,120,.35);
  }
  @keyframes instantPulse {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.06); }
    100% { transform: scale(1); }
  }

  /* Small snap bounce when canceled */
  .drag-bounce { animation: dragBounce .16s ease; }
  @keyframes dragBounce {
    0% { transform: translateY(0); }
    50%{ transform: translateY(-3px); }
    100%{ transform: translateY(0); }
  }
`;
document.head.appendChild(style);

if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
