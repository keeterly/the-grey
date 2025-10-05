// =========================================================
// THE GREY — UI ENTRY (v2.7)
// • MTG Arena–style animations for player + AI
//   - Player: staggered draw (deck→hand) + discard stream (hand→discard)
//   - AI: play (AI deck→AI slot), channel (AI deck→AI Æ pill),
//         buy (market cell→AI deck), advance pulse
// • MTG proportions (63:88) shared for hand & market
// • Proper reset & turn flow; drag refresh after each render
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ----------------- helpers -----------------
  const rectOf = (el)=> el.getBoundingClientRect();
  const text = (el, v)=> { if (el) el.textContent = String(v); };
  const pct  = (n, d)=> `${(100 * (n ?? 0)) / (d || 1)}%`;

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';

  // previous snapshots (for animations)
  let prevHandIds = [];
  let prevAISlotsSig = [];     // [null|"id:ph"] per slot
  let prevAIHandCount = 0;
  let prevFlowIds = [];        // ids in market row

  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);
  const slotSig = (s) => !s ? null : `${s.c?.id ?? s.c?.n ?? 'X'}:${s.ph ?? 1}`;

  // ----------------- animation primitives -----------------
  function flyArc(fromEl, toEl, {
    duration = 900, delay = 0, scaleEnd = 0.72, lift = 0.18, rotate = 8,
    easing = 'cubic-bezier(.18,.72,.24,1)'
  } = {}) {
    if (!fromEl || !toEl) return;
    const from = rectOf(fromEl);
    const to   = rectOf(toEl);

    const ghost = fromEl.cloneNode(true);
    ghost.classList.add('ghostFly');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: 9999
    });
    document.body.appendChild(ghost);

    const dx = to.left + (to.width - from.width)/2 - from.left;
    const dy = to.top  + (to.height - from.height)/2 - from.top;
    const dist  = Math.hypot(dx, dy);
    const arcPx = Math.min(260, Math.max(70, dist * lift));
    const side  = Math.random() < 0.5 ? -1 : 1;
    const rot   = side * rotate;

    const anim = ghost.animate([
      { transform:`translate(0,0) rotate(0deg) scale(1)`, opacity:1, offset:0 },
      { transform:`translate(${dx*0.6}px, ${dy*0.45 - arcPx}px) rotate(${rot}deg) scale(1.08)`,
        opacity:0.9, offset:0.55 },
      { transform:`translate(${dx}px, ${dy}px) rotate(${rot/2}deg) scale(${scaleEnd})`,
        opacity:0.08, offset:1 }
    ], { duration, delay, easing, fill:'forwards' });

    anim.onfinish = () => ghost.remove();
  }

  function animateDiscardStream(fromCardEls, discardTargetEl) {
    if (!fromCardEls?.length || !discardTargetEl) return;
    const stagger = 90;
    fromCardEls.forEach((el, i) => {
      flyArc(el, discardTargetEl, {
        duration: 1000 + i * 120,
        delay: i * stagger,
        scaleEnd: 0.70,
        lift: 0.24,
        rotate: 10,
        easing: 'cubic-bezier(.28,.65,.36,1.25)' // soft bounce-in feel
      });
    });
  }

  function animateDrawStream(deckEl, newCardEls) {
  if (!deckEl || !newCardEls?.length) return;

  const deckRect = deckEl.getBoundingClientRect();
  newCardEls.forEach((cardEl, i) => {
    const targetRect = cardEl.getBoundingClientRect();
    const dx = deckRect.left - targetRect.left;
    const dy = deckRect.top - targetRect.top;

    // start at deck
    cardEl.style.transform = `translate(${dx}px, ${dy}px) scale(0.2) rotate(-15deg)`;
    cardEl.style.opacity = '0';
    cardEl.style.transition = 'none';

    // force reflow
    void cardEl.offsetWidth;

    const delay = i * 150;
    cardEl.style.transition = `transform 0.8s cubic-bezier(.2,.8,.3,1), opacity 0.8s ease`;
    setTimeout(() => {
      cardEl.style.transform = `translate(0,0) scale(1) rotate(0deg)`;
      cardEl.style.opacity = '1';
    }, delay);
  });
}


  // ---------- AI-specific helpers ----------
  // Create/get a tiny invisible anchor just above the AI slots (deck origin).
  function getAiDeckAnchor() {
    let anchor = $('#aiDeckAnchor');
    const aiSlots = $('#aiSlots');
    if (!aiSlots) return null;
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'aiDeckAnchor';
      anchor.style.position = 'fixed';
      anchor.style.width = '8px';
      anchor.style.height = '12px';
      anchor.style.pointerEvents = 'none';
      anchor.style.zIndex = 1;
      document.body.appendChild(anchor);
    }
    const r = rectOf(aiSlots);
    anchor.style.left = `${r.right - Math.min(120, r.width * 0.15)}px`;
    anchor.style.top  = `${r.top - 20}px`;
    return anchor;
  }
  // AI Æ target (pill on top-right)
  function getAiAeAnchor() {
    const label = $('#aiAeValue') || $('#pillAi') || $('#aiTranceFill');
    return label || null;
  }

  // ----------------- HUD / COUNTS -----------------
  function renderHUD(S) {
    text($('#hpValue'),   S.hp ?? 0);
    text($('#aeValue'),   S.ae ?? 0);
    text($('#aiHpValue'), S.ai?.hp ?? 0);
    text($('#aiAeValue'), S.ai?.ae ?? 0);

    const you = S.trance?.you || { cur:0, cap:6 };
    const ai  = S.trance?.ai  || { cur:0, cap:6 };

    const youFill = $('#youTranceFill');
    const aiFill  = $('#aiTranceFill');
    if (youFill) youFill.style.width = pct(you.cur, you.cap || 6);
    if (aiFill)  aiFill.style.width  = pct(ai.cur,  ai.cap  || 6);

    text($('#youTranceCount'), `${you.cur ?? 0}/${you.cap ?? 6}`);
    text($('#aiTranceCount'),  `${ai.cur ?? 0}/${ai.cap ?? 6}`);
  }
  function renderCounts(S) {
    text($('#deckCount'),    (S.deck?.length ?? 0));
    text($('#discardCount'), (S.disc?.length ?? 0));
  }

  // ----------------- MARKET -----------------
  function renderFlow(S) {
    const cells = $$('.marketCard');
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i];
      const c = S.flowRow?.[i] || null;

      el.innerHTML = '';
      el.classList.toggle('empty', !c);

      if (c) {
        const card = document.createElement('div');
        card.className = 'cardFrame marketCardPanel';
        card.dataset.flowIndex = String(i);
        card.dataset.cardId = c?.id ?? '';
        card.innerHTML = `
          <div class="cardTop">
            <div class="cardTitle">${c.n}</div>
            <div class="cardSub">${c.t || ''}</div>
          </div>
          <div class="cardBottom">
            <div class="cardVal">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div>
          </div>`;
        el.appendChild(card);
        el.onclick = () => { try { game.dispatch({ type: 'BUY_FLOW', index: i }); } catch (e) { console.error(e); } };
      } else {
        el.onclick = null;
      }
    }
  }

  // ----------------- HAND -----------------
  function renderHand(S) {
    const ribbon = $('#ribbon');
    if (!ribbon) return;

    const beforeIds = prevHandIds.slice(0);
    ribbon.innerHTML = '';

    const hand = S.hand || [];
    hand.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cardFrame handCard';
      el.dataset.index = i;
      el.dataset.cardId = c?.id ?? '';
      el.innerHTML = `
        <div class="cardTop">
          <div class="cardTitle">${c.n}</div>
          <div class="cardSub">${c.t || ''}</div>
        </div>
        <div class="cardBottom">
          <div class="cardVal">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div>
        </div>`;
      el.onclick = () => {
        try {
          if (c.t === 'Instant') game.dispatch({ type: 'CHANNEL_FROM_HAND', index: i });
          else                   game.dispatch({ type: 'PLAY_FROM_HAND',    index: i });
        } catch (e) { console.error('[UI] hand click failed', e); }
      };
      ribbon.appendChild(el);
    });

    // Animate draws (staggered)
    const afterIds = cardIds(hand);
    const newIds = afterIds.filter(id => !beforeIds.includes(id));
    if (newIds.length) {
      const deckBtn = $('#chipDeck');
      if (deckBtn) {
        const newEls = newIds.map(id => ribbon.querySelector(`.handCard[data-card-id="${id}"]`)).filter(Boolean);
        animateDrawStream(deckBtn, newEls);
      }
    }

    prevHandIds = afterIds;
  }

  // ----------------- SLOTS -----------------
  function renderSlots(S) {
    const youEl = $('#playerSlots');
    const aiEl  = $('#aiSlots');

    if (youEl) {
      youEl.innerHTML = '';
      (S.slots || []).forEach((s, i) => {
        const cell = document.createElement('div');
        cell.className = 'slotCell';
        cell.dataset.slot = String(i);

        if (!s) { cell.classList.add('empty'); cell.innerHTML = '<div class="slotGhost">Empty</div>'; }
        else {
          cell.innerHTML = `
            <div class="cardFrame slotPanel">
              <div class="cardTop">
                <div class="cardTitle">${s.c.n}</div>
                <div class="cardSub">${s.c.t || 'Spell'}</div>
              </div>
              <div class="cardBottom">
                <div class="cardVal">${(s.c.v != null ? '+'+s.c.v+'⚡' : '')} · ${s.ph || 1}/${s.c.p || 1}</div>
              </div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }

        cell.onclick = () => { if (s) game.dispatch({ type: 'ADVANCE', slot: i }); };
        youEl.appendChild(cell);
      });
    }

    if (aiEl) {
      aiEl.innerHTML = '';
      (S.ai?.slots || []).forEach((s, i) => {
        const cell = document.createElement('div');
        cell.className = 'slotCell ai';
        cell.dataset.slot = String(i);

        if (!s) { cell.classList.add('empty'); cell.innerHTML = '<div class="slotGhost">Empty</div>'; }
        else {
          cell.innerHTML = `
            <div class="cardFrame slotPanel">
              <div class="cardTop">
                <div class="cardTitle">${s.c.n}</div>
                <div class="cardSub">${s.c.t || 'Spell'}</div>
              </div>
              <div class="cardBottom">
                <div class="cardVal">${(s.c.v != null ? '+'+s.c.v+'⚡' : '')} · ${s.ph || 1}/${s.c.p || 1}</div>
              </div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }

        aiEl.appendChild(cell);
      });
    }
  }

  // ----------------- DRAW (one frame) -----------------
  function draw() {
    const S = game.state || {};

    // --- capture old AI and flow state BEFORE render for diffing AFTER render ---
    const oldAISlotsSig = prevAISlotsSig.slice(0);
    const oldAIHandCount = prevAIHandCount;
    const oldFlow = prevFlowIds.slice(0);

    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    // After render: compute new snapshots
    prevAISlotsSig = (S.ai?.slots || []).map(slotSig);
    prevAIHandCount = (S.ai?.hand?.length ?? 0);
    prevFlowIds = (S.flowRow || []).map(c => c?.id ?? null);

    // ---- AI animations by diff ----
    try {
      const aiDeckAnchor = getAiDeckAnchor();
      const aiAeAnchor   = getAiAeAnchor();

      // 1) AI PLAY SPELL: any slot changed from empty->filled
      const aiSlotCells = $$('#aiSlots .slotCell');
      for (let i = 0; i < prevAISlotsSig.length; i++) {
        const before = oldAISlotsSig[i];
        const after  = prevAISlotsSig[i];
        if (before === null && after !== null) {
          const target = aiSlotCells[i]?.querySelector('.slotPanel') || aiSlotCells[i];
          if (target && aiDeckAnchor) flyArc(aiDeckAnchor, target, {
            duration: 820, lift: 0.16, rotate: 7, scaleEnd: 0.98, easing: 'cubic-bezier(.18,.75,.25,1)'
          });
        }
      }

      // 2) AI CHANNEL: hand count dropped but no new slot added
      const newSlotAdded = prevAISlotsSig.some((sig, i) => oldAISlotsSig[i] === null && sig !== null);
      if (!newSlotAdded && prevAIHandCount < oldAIHandCount) {
        if (aiAeAnchor && aiDeckAnchor) {
          flyArc(aiDeckAnchor, aiAeAnchor, {
            duration: 760, lift: 0.14, rotate: 10, scaleEnd: 0.45, easing: 'cubic-bezier(.2,.7,.2,1)'
          });
        }
      }

      // 3) AI BUY: a flow cell changed from card->null
      const flowCells = $$('.marketCard .cardFrame');
      for (let i = 0; i < prevFlowIds.length; i++) {
        if (oldFlow[i] && !prevFlowIds[i]) {
          const src = flowCells[i];
          if (src && aiDeckAnchor) {
            flyArc(src, aiDeckAnchor, {
              duration: 780, lift: 0.18, rotate: 6, scaleEnd: 0.7, easing: 'cubic-bezier(.18,.75,.25,1)'
            });
          }
        }
      }

      // 4) AI ADVANCE: same slot still filled but ph advanced -> pulse
      for (let i = 0; i < prevAISlotsSig.length; i++) {
        const before = oldAISlotsSig[i];
        const after  = prevAISlotsSig[i];
        if (before && after && before !== after) {
          // changed (likely ph increment)
          const cell = aiSlotCells[i];
          if (cell) {
            cell.classList.add('pulse');
            setTimeout(()=>cell.classList.remove('pulse'), 500);
          }
        }
      }
    } catch (e) {
      console.warn('[UI] AI animation diff failed', e);
    }

    // rebind drags
    if (window.DragCards && typeof window.DragCards.refresh === 'function') {
      window.DragCards.refresh();
    }
  }

  // ----------------- dispatch wrapper -----------------
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;

    game.dispatch = (action) => {
      // Capture hand cards BEFORE END_TURN to animate discard stream
      let capturedHandEls = null, discardTarget = null;
      if (action && action.type === 'END_TURN') {
        capturedHandEls = Array.from(document.querySelectorAll('.ribbon .handCard'));
        discardTarget = $('#chipDiscard');
      }

      const result = orig(action);

      draw();

      // Discard stream post-render
      if (capturedHandEls && discardTarget) {
        animateDiscardStream(capturedHandEls, discardTarget);
      }
      return result;
    };

    game.__uiWrapped = true;
  }

  // ----------------- buttons -----------------
  const onDraw  = () => game.dispatch({ type: 'DRAW' });
  const onEnd   = () => game.dispatch({ type: 'END_TURN' });
  const onReset = () => {
    try {
      game.dispatch({ type: 'RESET', playerWeaver: DEFAULT_WEAVER_YOU, aiWeaver: DEFAULT_WEAVER_AI });
      game.dispatch({ type: 'ENSURE_MARKET' });
      game.dispatch({ type: 'START_GAME' });
      game.dispatch({ type: 'START_TURN', first:true });
    } catch (e) { console.error('[UI] reset failed', e); }
  };
  [['#fabDraw', onDraw], ['#fabEnd', onEnd], ['#fabReset', onReset]]
    .forEach(([sel,fn]) => { const el = $(sel); if (el) el.onclick = fn; });

  // Initial render
  draw();
  console.log('[UI] v2.7 — Player & AI animations enabled (draw/discard + AI play/channel/buy/advance).');
}

// ----------------- styles -----------------
const style = document.createElement('style');
style.textContent = `
  :root { --card-w: 160px; }

  .ribbon { display:flex; flex-wrap:nowrap; overflow-x:auto; justify-content:center; padding:10px; gap:10px; }

  .cardFrame {
    aspect-ratio: 63 / 88;
    width: var(--card-w);
    height: auto;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid rgba(0,0,0,.10);
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    display:flex; flex-direction:column; justify-content:space-between;
  }
  .cardTop { padding: 8px 10px 0 10px; }
  .cardBottom { padding: 0 10px 8px 10px; }

  .handCard { cursor:pointer; transition:transform .2s, box-shadow .2s; background: linear-gradient(180deg,#fff 0%,#faf7ef 100%); }
  .handCard:hover { transform:translateY(-4px); box-shadow:0 10px 18px rgba(0,0,0,0.22); }

  .marketCardPanel { background: linear-gradient(180deg,#fff 0%,#f6f6ff 100%); }

  .cardTitle { font-weight:700; font-size:15px; line-height:1.15; color:#262626; }
  .cardSub   { font-size:12.5px; color:#616161; margin-top:2px; }
  .cardVal   { font-size:13px; color:#b21d1d; margin-top:4px; }

  #playerSlots, #aiSlots {
    display: grid;
    grid-template-columns: repeat(3, minmax(calc(var(--card-w) + 20px), 1fr));
    gap: 16px;
    padding: 10px 14px 18px;
  }
  .slotCell {
    display:flex; align-items:center; justify-content:center;
    user-select: none; cursor: pointer;
    min-height: calc(var(--card-w) * 1.1);
    border-radius: 16px;
    background: #fffaf4;
    border: 1px solid rgba(0,0,0,.06);
    box-shadow: 0 2px 6px rgba(0,0,0,.05) inset;
    transition: transform .15s, box-shadow .15s;
  }
  .slotCell:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.12); }
  .slotCell.empty { color: #9a9a9a; font-size: 12px; }
  .slotCell.ai { background: #f7f7fb; }
  .slotCell.advUsed { opacity: .85; }
  .slotCell.pulse { animation: slotPulse .5s ease-out; }
  @keyframes slotPulse {
    0% { box-shadow: 0 0 0 0 rgba(90,140,220,.0); }
    50%{ box-shadow: 0 0 0 8px rgba(90,140,220,.18); }
    100%{ box-shadow: 0 0 0 0 rgba(90,140,220,.0); }
  }

  /* Drag affordances */
  #playerSlots .slotCell.dropReady { outline: 2px dashed rgba(120,120,120,.25); outline-offset: -4px; }
  #playerSlots .slotCell.dropTarget { outline: 2px solid rgba(90,140,220,.6); outline-offset: -4px; box-shadow: 0 0 0 4px rgba(90,140,220,.08) inset; }

  .ghostFly { border-radius:12px; overflow:hidden; will-change: transform, opacity; }
`;
document.head.appendChild(style);

if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
