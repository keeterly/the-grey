// =========================================================
// THE GREY — UI ENTRY (v3.9)
// =========================================================
//
// • Fixed card/row layout (MTG 63×88 ratio) — row heights never shift
// • 3 spell slots + 1 glyph slot (both sides). Glyphs face-down; badge shows count
// • Draw fan: deck → hand (real hand DOM nodes)
// • Discard fan: hand → discard (reverse of draw) before END_TURN dispatch
// • Player BUY anim: market → your discard (ghost) then state
// • AI visible flights (play/channel/buy/advance), first paint suppressed
// • Top-right controls; bottom FABs hidden via CSS
// • Aethergem (minimal diamond) bottom-right, shimmer on Æ gain
// • Clickable deck/discard open fixed-size modals
//
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const R  = (el) => el.getBoundingClientRect();
  const T  = (el, v) => { if (el) el.textContent = String(v); };
  const pct= (n, d)=> `${(100 * (n ?? 0)) / (d || 1)}%`;
  const clamp = (n, a, b)=> Math.max(a, Math.min(b, n));
  const wait = (ms)=> new Promise(res=> setTimeout(res, ms));

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';

  // ----- Snapshots / flags -----
  let prevHandIds   = [];
  let prevAISig     = [];  // per-slot signature "id:ph"
  let prevAIHand    = 0;
  let prevFlowCards = [];
  let prevFlowRects = [];
  let prevAE        = 0;
  let firstPaint    = true;

  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);
  const slotSig = (s) => !s ? null : `${s.c?.id ?? s.c?.n ?? 'X'}:${s.ph ?? 1}`;

  // ---------- Anchors ----------
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
    return $('#aiAeValue') || $('#pillAi') || $('#aiTranceFill') || null;
  }
  function aiDiscardAnchor() {
    let d = $('#aiDiscardChip');
    const ref = $('#aiSlots') || $('#pillAi') || $('#aiTranceFill');
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

  // ---------- Fancy ghost card ----------
  function makeGhostFromCard(card, fromRect) {
    const g = document.createElement('div');
    g.className = 'cardFrame ghostFly';
    Object.assign(g.style, {
      position: 'fixed',
      left: `${fromRect.left}px`,
      top:  `${fromRect.top}px`,
      width: `${Math.max(140, fromRect.width)}px`,
      height: 'auto',
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

  // ---------- Draw / Discard (real nodes) ----------
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
      el.style.transition=`transform .85s cubic-bezier(.26,.7,.32,1.12), opacity .85s ease`;
      el.style.transform =`translate(${dx}px, ${dy}px) scale(.72) rotate(${spread*.2}deg)`;
      el.style.opacity  ='.06';
      const done=()=>{ el.style.transition=''; el.style.transform=''; el.style.opacity=''; el.removeEventListener('transitionend',done); resolve(); };
      setTimeout(()=> el.addEventListener('transitionend',done,{once:true}), 0);
    }));
    return Promise.all(promises);
  }

  // ---------- Aether shimmer ----------
  function maybeShimmerAE(newAE){
    const gem = $('#aetherGem');
    if (!gem) return;
    if (newAE > prevAE){
      gem.classList.remove('shimmer'); // restart
      void gem.offsetWidth;
      gem.classList.add('shimmer');
      setTimeout(()=> gem.classList.remove('shimmer'), 700);
    }
    prevAE = newAE;
  }

  // ---------- HUD / counts ----------
  function renderHUD(S){
    T($('#hpValue'),   S.hp ?? 0);
    T($('#aeValue'),   S.ae ?? 0);
    T($('#aiHpValue'), S.ai?.hp ?? 0);
    T($('#aiAeValue'), S.ai?.ae ?? 0);

    const you=S.trance?.you||{cur:0,cap:6}, ai=S.trance?.ai||{cur:0,cap:6};
    $('#youTranceFill').style.width = pct(you.cur, you.cap||6);
    $('#aiTranceFill').style.width  = pct(ai.cur,  ai.cap ||6);
    T($('#youTranceCount'), `${you.cur ?? 0}/${you.cap ?? 6}`);
    T($('#aiTranceCount'),  `${ai.cur ?? 0}/${ai.cap ?? 6}`);

    // Aethergem number + shimmer on gain
    T($('#aetherGemNum'), S.ae ?? 0);
    maybeShimmerAE(S.ae ?? 0);
  }
  function renderCounts(S){
    T($('#deckCount'),    S.deck?.length ?? 0);
    T($('#discardCount'), S.disc?.length ?? 0);
  }

  // ---------- Market ----------
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

        // BUY handler (player)
        el.onclick = () => {
          try { game.dispatch({ type:'BUY_FLOW', index:i }); } catch(e){ console.error('[UI] buy', e); }
        };
      }
    }
  }

  // ---------- Hand ----------
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

  // ---------- Glyph helpers ----------
  const GLYPH_BACK = `
    <div class="cardFrame glyphBack">
      <div class="cardTop"><div class="cardTitle">Glyph</div><div class="cardSub">Face Down</div></div>
      <div class="cardBottom"><div class="cardVal">✶</div></div>
    </div>`;

  function renderGlyphSlot(side, glyphs) {
    const wrap = document.createElement('div');
    wrap.className = 'glyphSlot';
    if (!glyphs || glyphs.length === 0) {
      wrap.innerHTML = '<div class="slotGhost">Empty</div>';
      return wrap;
    }
    // stack face-down, count badge
    wrap.innerHTML = GLYPH_BACK;
    const badge = document.createElement('div');
    badge.className = 'glyphCount';
    badge.textContent = glyphs.length;
    wrap.appendChild(badge);
    return wrap;
  }

  // ---------- Slots (3 spell + 1 glyph) ----------
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
      // glyph slot as 4th
      const glyphCell = document.createElement('div');
      glyphCell.className = 'slotCell glyph';
      glyphCell.appendChild(renderGlyphSlot('you', S.glyphs||[]));
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
      glyphCell.appendChild(renderGlyphSlot('ai', (S.ai?.glyphs)||[]));
      aiEl.appendChild(glyphCell);
    }
  }

  // ---------- Modal (pile viewer) ----------
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

  // ---------- Render tick ----------
  async function draw(){
    const S = game.state || {};

    // capture old AI/flow BEFORE render
    const oldAISig  = prevAISig.slice(0);
    const oldAIHand = prevAIHand;
    const oldFlow   = prevFlowCards.map(c=> c ? ({...c}) : null);
    const oldRects  = prevFlowRects.slice(0);

    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    // update AFTER render
    prevAISig  = (S.ai?.slots||[]).map(slotSig);
    prevAIHand = (S.ai?.hand?.length ?? 0);

    // ----- AI Ghosts by diff (skip on first paint) -----
    if (!firstPaint) {
      try{
        const deckA = aiDeckAnchor();
        const aeA   = aiAeAnchor();
        const aiDisc= aiDiscardAnchor();

        // PLAY (empty→filled)
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
        // CHANNEL (hand-- and no new slot)
        const newSlotAdded = prevAISig.some((sig,i)=> oldAISig[i]===null && sig!==null);
        if (!newSlotAdded && prevAIHand < oldAIHand) {
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
        // BUY (flow card disappears) -> market→AI discard
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
        // ADVANCE (ph changed) -> pulse
        for (let i=0;i<prevAISig.length;i++){
          const a=prevAISig[i], b=oldAISig[i];
          if (a && b && a!==b){
            const cell = $$('#aiSlots .slotCell')[i];
            if (cell){ cell.classList.add('pulse'); setTimeout(()=>cell.classList.remove('pulse'), 520); }
          }
        }
      }catch(e){ console.warn('[UI] AI ghost diff failed', e); }
    }

    // rebind drags (safe no-op if absent)
    if (window.DragCards?.refresh) window.DragCards.refresh();

    firstPaint = false;
  }

  // ---------- AI turn helper ----------
  async function runAiTurn(){
    game.dispatch({ type:'AI_DRAW'  }); await draw();
    await wait(220);
    game.dispatch({ type:'AI_PLAY_SPELL' }); await draw();
    await wait(260);
    game.dispatch({ type:'AI_CHANNEL' }); await draw();
    await wait(220);
    game.dispatch({ type:'AI_ADVANCE' }); await draw();
    await wait(260);
    game.dispatch({ type:'AI_BUY' });    await draw();
    await wait(220);
    game.dispatch({ type:'AI_SPEND_TRANCE' }); await draw();
    await wait(200);
  }

  // ---------- Dispatch wrapper (pre-anims) ----------
  if (game && typeof game.dispatch==='function' && !game.__uiWrapped){
    const orig = game.dispatch;

    game.dispatch = async (action) => {

      // Pre-animate player BUY: market → player discard
      if (action?.type === 'BUY_FLOW' && typeof action.index === 'number') {
        const idx = action.index;
        const flowCell = $$('.marketCard')[idx];
        const fromRect = flowCell ? R(flowCell) : prevFlowRects[idx];
        const c = prevFlowCards[idx];
        const discardBtn = $('#chipDiscard');

        if (c && fromRect && discardBtn) {
          const ghost = makeGhostFromCard(c, fromRect);
          await new Promise((resolve)=>{
            ghost.animate(
              pathFrames(fromRect, discardBtn, { scaleEnd:.72 }),
              { duration: 780, easing: 'cubic-bezier(.18,.75,.25,1)', fill:'forwards' }
            ).onfinish = () => { ghost.remove(); resolve(); };
          });
        }
        const res = orig(action); await draw(); return res;
      }

      // Pre-animate END_TURN: discard hand (real nodes), then AI, then start our turn
      if (action?.type === 'END_TURN') {
        const liveHand = Array.from(document.querySelectorAll('.ribbon .handCard'));
        const discardBtn = $('#chipDiscard');
        await animateDiscardFanSameNodes(liveHand, discardBtn);
        const res = orig(action); await draw();
        await runAiTurn();
        orig({ type:'START_TURN' }); await draw();
        return res;
      }

      // Pre-animate PLAY_FROM_HAND (spell or glyph): hand → slot/glyph
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

  // ---------- Top-right controls & Aethergem ----------
  ensureHudExtras();

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

  const btnDraw  = $('#btnDraw');  if (btnDraw)  btnDraw.onclick  = onDraw;
  const btnEnd   = $('#btnEnd');   if (btnEnd)   btnEnd.onclick   = onEnd;
  const btnReset = $('#btnReset'); if (btnReset) btnReset.onclick = onReset;

  // Pile viewers
  const deckBtn = $('#chipDeck');
  const discBtn = $('#chipDiscard');
  if (deckBtn) deckBtn.onclick = () => openPile('Deck', (game.state?.deck)||[]);
  if (discBtn) discBtn.onclick = () => openPile('Discard', (game.state?.disc)||[]);

  // first paint
  draw();
  console.log('[UI] v3.9 — fixed rows, 3+glyph slots, play/discard/buy anms, top-right controls, diamond Aethergem, fixed modals');
}

// ---------- Top-right controls & Aethergem elements ----------
function ensureHudExtras(){
  if (!document.getElementById('uiTopRight')) {
    const wrap = document.createElement('div');
    wrap.id = 'uiTopRight';
    wrap.innerHTML = `
      <div class="uiButtons">
        <button id="btnReset" title="Reset">↺</button>
        <button id="btnDraw"  title="Draw">⇧</button>
        <button id="btnEnd"   title="End Turn">⏵</button>
      </div>`;
    document.body.appendChild(wrap);
  }
  if (!document.getElementById('aetherGem')) {
    const gem = document.createElement('div');
    gem.id = 'aetherGem';
    gem.innerHTML = `<div class="diamond"><span id="aetherGemNum">0</span></div>`;
    document.body.appendChild(gem);
  }
}

// -------------------- styles --------------------
const style = document.createElement('style');
style.textContent = `
  :root {
    --card-w: 160px; /* MTG ratio 63×88 — width controls everything */
    --row-pad: 12px;
    --card-h: calc(var(--card-w) * 88 / 63);
    --zone-h: calc(var(--card-h) + var(--row-pad) * 2);
  }

  /* Hide old FAB icons that overlapped the Aethergem */
  .fabDial { display: none !important; }

  /* Fixed-height zones matching card height */
  .zone { min-height: var(--zone-h); max-height: var(--zone-h); }
  .flowWrap { min-height: var(--zone-h); max-height: var(--zone-h); }

  /* Aetherflow consistent grid */
  .flowGrid { display:grid; grid-template-columns: repeat(5, var(--card-w)); justify-content:center; gap:16px; }
  .marketCard { width: var(--card-w); height: var(--card-h); display:flex; align-items:center; justify-content:center; }
  .marketCard.empty { background: transparent; border-radius: 12px; border: 1px dashed rgba(0,0,0,.08); }

  /* Hand ribbon */
  .ribbon { display:flex; flex-wrap:nowrap; overflow-x:auto; justify-content:center; padding:10px; gap:10px; }

  .cardFrame {
    aspect-ratio: 63 / 88;
    width: var(--card-w);
    height: auto;
    border-radius: 12px;
    background: #fff;
    border: 1px solid rgba(0,0,0,.10);
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    display:flex; flex-direction:column; justify-content:space-between;
  }
  .cardTop { padding: 8px 10px 0; }
  .cardBottom { padding: 0 10px 8px; }

  .handCard { cursor:pointer; transition:transform .2s, box-shadow .2s; background: linear-gradient(180deg,#fff 0%,#faf7ef 100%); }
  .handCard:hover { transform: translateY(-4px); box-shadow: 0 10px 18px rgba(0,0,0,.22); }

  .marketCardPanel { background: linear-gradient(180deg,#fff 0%,#f6f6ff 100%); }

  .cardTitle { font-weight:700; font-size:15px; line-height:1.15; color:#262626; }
  .cardSub   { font-size:12.5px; color:#616161; margin-top:2px; }
  .cardVal   { font-size:13px; color:#b21d1d; margin-top:4px; }

  /* 3 spell slots + 1 glyph slot */
  #playerSlots, #aiSlots {
    display:grid;
    grid-template-columns: repeat(4, var(--card-w));
    gap: 16px;
    padding: var(--row-pad);
    justify-content:center;
    min-height: var(--zone-h);
    max-height: var(--zone-h);
    align-items:center;
  }
  .slotCell {
    display:flex; align-items:center; justify-content:center;
    width: var(--card-w);
    height: var(--card-h);
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

  /* Drag affordances */
  #playerSlots .slotCell.dropReady { outline: 2px dashed rgba(120,120,120,.25); outline-offset:-4px; }
  #playerSlots .slotCell.dropTarget { outline: 2px solid rgba(90,140,220,.6); outline-offset:-4px; box-shadow:0 0 0 4px rgba(90,140,220,.08) inset; }

  .ghostFly { border-radius:12px; overflow:hidden; will-change: transform, opacity; }

  /* Top-right controls */
  #uiTopRight { position:fixed; top:10px; right:10px; z-index:5000; }
  #uiTopRight .uiButtons { display:flex; gap:8px; }
  #uiTopRight .uiButtons button {
    width:36px; height:36px; border-radius:10px; border:1px solid rgba(0,0,0,.12);
    background:#fff; box-shadow:0 2px 6px rgba(0,0,0,.12); cursor:pointer; font-size:16px;
  }
  #uiTopRight .uiButtons button:hover { transform:translateY(-1px); }

  /* Aethergem (diamond) bottom-right above hand */
  #aetherGem {
    position:fixed; right:18px; bottom:110px; z-index:4000;
    width:56px; height:56px; display:flex; align-items:center; justify-content:center;
    filter: drop-shadow(0 4px 10px rgba(0,0,0,.22));
    pointer-events:none;
  }
  #aetherGem .diamond {
    width: 44px; height: 44px; transform: rotate(45deg);
    background: linear-gradient(135deg, #f9e29a 0%, #f2c65b 50%, #e29b2e 100%);
    border: 2px solid #8d5a1a; border-radius: 8px;
    display:flex; align-items:center; justify-content:center;
  }
  #aetherGem .diamond span {
    transform: rotate(-45deg); font-weight:800; color:#3b2a14; text-shadow:0 1px 0 rgba(255,255,255,.6);
  }
  #aetherGem.shimmer .diamond { animation: gemShimmer .7s ease both; }
  @keyframes gemShimmer {
    0% { box-shadow:0 0 0 0 rgba(255,240,180,0); }
    50% { box-shadow:0 0 18px 6px rgba(255,220,140,.55); }
    100% { box-shadow:0 0 0 0 rgba(255,240,180,0); }
  }

  /* Chips (AI floating discard) */
  .chipCirc.ai {
    width:36px; height:36px; border-radius:999px;
    display:inline-flex; align-items:center; justify-content:center;
    background:#f0f3ff; border:1px solid rgba(0,0,0,.08);
    box-shadow:0 2px 6px rgba(0,0,0,.12);
  }
  .chipCirc.ai svg { width:18px; height:18px; stroke:#444; }

  /* Modal (fixed matching size) */
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
