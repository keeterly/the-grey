// =========================================================
// THE GREY — UI ENTRY (v2.9)
// • Draw fan: real DOM cards fly deck → hand
// • Discard fan: reverse of draw (same DOM hand cards) hand → discard,
//   then we dispatch END_TURN (pre-animation, not clones)
// • AI visible flights (ghosts): play/channel/buy, plus advance pulse
// • MTG proportions; drag refresh after render
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const rectOf = (el)=> el.getBoundingClientRect();
  const text   = (el, v)=> { if (el) el.textContent = String(v); };
  const pct    = (n, d)=> `${(100 * (n ?? 0)) / (d || 1)}%`;

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';

  // previous snapshots for animations
  let prevHandIds = [];
  let prevAISlotsSig = [];
  let prevAIHandCount = 0;
  let prevFlowIds = [];

  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);
  const slotSig = (s) => !s ? null : `${s.c?.id ?? s.c?.n ?? 'X'}:${s.ph ?? 1}`;

  // -------------------- DRAW (real nodes) --------------------
  function animateDrawFan(deckEl, newCardEls) {
    if (!deckEl || !newCardEls?.length) return;
    const deck = rectOf(deckEl);

    newCardEls.forEach((cardEl, i) => {
      const target = rectOf(cardEl);
      const dx = deck.left - target.left;
      const dy = deck.top  - target.top;

      cardEl.style.transform  = `translate(${dx}px, ${dy}px) scale(0.2) rotate(-12deg)`;
      cardEl.style.opacity    = '0';
      cardEl.style.transition = 'none';
      // reflow
      void cardEl.offsetWidth;

      const delay = i * 130;
      cardEl.style.transition = `transform 0.8s cubic-bezier(.2,.8,.3,1), opacity .8s ease`;
      setTimeout(() => {
        cardEl.style.transform = `translate(0,0) scale(1) rotate(0deg)`;
        cardEl.style.opacity   = '1';
      }, delay);
    });
  }

  // -------------------- DISCARD (reverse; real nodes) --------------------
  // Returns a Promise that resolves after all hand cards finish animating to discard.
  function animateDiscardFanSameNodes(handEls, discardBtn) {
    if (!handEls?.length || !discardBtn) return Promise.resolve();
    const to = rectOf(discardBtn);
    const last = handEls.length - 1;

    const promises = handEls.map((el, i) => new Promise((resolve) => {
      const r = rectOf(el);
      const dx = to.left - r.left;
      const dy = to.top  - r.top;

      const spread = (i - last/2) * 12;
      el.style.transition = 'none';
      // reflow
      void el.offsetWidth;

      const delay = i * 110;
      el.style.transition = `transform 0.85s cubic-bezier(.26,.7,.32,1.12), opacity .85s ease`;
      el.style.transform = `translate(${dx}px, ${dy}px) scale(.72) rotate(${spread * 0.2}deg)`;
      el.style.opacity   = '.06';

      setTimeout(() => {
        // When animation ends, clear inline styles so re-render can take over
        const handle = () => {
          el.style.transition = '';
          el.style.transform  = '';
          el.style.opacity    = '';
          el.removeEventListener('transitionend', handle);
          resolve();
        };
        el.addEventListener('transitionend', handle, { once:true });
      }, 0 + delay);
    }));

    return Promise.all(promises);
  }

  // -------------------- AI ghost flights --------------------
  function ghostFly(fromEl, toEl, { duration=820, delay=0, lift=0.16, rotate=7, scaleEnd=0.98, easing='cubic-bezier(.18,.75,.25,1)' } = {}) {
    if (!fromEl || !toEl) return;
    const from = rectOf(fromEl);
    const to   = rectOf(toEl);

    const ghost = document.createElement('div');
    ghost.className = 'cardFrame ghostFly';
    ghost.style.position = 'fixed';
    ghost.style.left = `${from.left}px`;
    ghost.style.top  = `${from.top}px`;
    ghost.style.width  = `${Math.max(120, to.width * .9)}px`;
    ghost.style.height = 'auto';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '1';
    document.body.appendChild(ghost);

    // simple face for ghost
    ghost.innerHTML = `<div class="cardTop"><div class="cardTitle">AI</div><div class="cardSub">Action</div></div><div class="cardBottom"><div class="cardVal"></div></div>`;

    const dx = to.left - from.left;
    const dy = to.top  - from.top;
    const dist = Math.hypot(dx,dy);
    const arc = Math.min(240, Math.max(80, dist*lift));
    const side = Math.random() < .5 ? -1 : 1;
    const rot  = side * rotate;

    const anim = ghost.animate([
      { transform: `translate(0,0) rotate(0deg) scale(1)`, opacity: 1, offset:0 },
      { transform: `translate(${dx*.55}px, ${dy*.45 - arc}px) rotate(${rot}deg) scale(1.06)`, opacity: .95, offset:.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot/2}deg) scale(${scaleEnd})`, opacity: .08, offset:1 }
    ], { duration, delay, easing, fill:'forwards' });

    anim.onfinish = () => ghost.remove();
  }

  function aiDeckAnchor() {
    let anchor = $('#aiDeckAnchor');
    const box = $('#aiSlots');
    if (!box) return null;
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'aiDeckAnchor';
      anchor.style.position = 'fixed';
      anchor.style.width = '10px';
      anchor.style.height= '16px';
      anchor.style.pointerEvents='none';
      document.body.appendChild(anchor);
    }
    const r = rectOf(box);
    anchor.style.left = `${r.right - Math.min(120, r.width * .15)}px`;
    anchor.style.top  = `${r.top - 18}px`;
    return anchor;
  }
  const aiAeAnchor = ()=> $('#aiAeValue') || $('#pillAi') || $('#aiTranceFill');

  // -------------------- HUD / COUNTS --------------------
  function renderHUD(S) {
    text($('#hpValue'),   S.hp ?? 0);
    text($('#aeValue'),   S.ae ?? 0);
    text($('#aiHpValue'), S.ai?.hp ?? 0);
    text($('#aiAeValue'), S.ai?.ae ?? 0);

    const you = S.trance?.you || {cur:0, cap:6};
    const ai  = S.trance?.ai  || {cur:0, cap:6};

    $('#youTranceFill').style.width = pct(you.cur, you.cap || 6);
    $('#aiTranceFill').style.width  = pct(ai.cur,  ai.cap  || 6);
    text($('#youTranceCount'), `${you.cur ?? 0}/${you.cap ?? 6}`);
    text($('#aiTranceCount'),  `${ai.cur ?? 0}/${ai.cap ?? 6}`);
  }
  function renderCounts(S) {
    text($('#deckCount'),    (S.deck?.length ?? 0));
    text($('#discardCount'), (S.disc?.length ?? 0));
  }

  // -------------------- MARKET --------------------
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
          <div class="cardTop"><div class="cardTitle">${c.n}</div><div class="cardSub">${c.t || ''}</div></div>
          <div class="cardBottom"><div class="cardVal">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div></div>`;
        el.appendChild(card);
        el.onclick = () => { try { game.dispatch({ type: 'BUY_FLOW', index: i }); } catch (e) { console.error(e); } };
      } else {
        el.onclick = null;
      }
    }
  }

  // -------------------- HAND --------------------
  function renderHand(S) {
    const ribbon = $('#ribbon');
    const beforeIds = prevHandIds.slice(0);
    ribbon.innerHTML = '';

    const hand = S.hand || [];
    hand.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cardFrame handCard';
      el.dataset.index  = i;
      el.dataset.cardId = c?.id ?? '';
      el.innerHTML = `
        <div class="cardTop"><div class="cardTitle">${c.n}</div><div class="cardSub">${c.t || ''}</div></div>
        <div class="cardBottom"><div class="cardVal">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div></div>`;
      el.onclick = () => {
        try {
          if (c.t === 'Instant') game.dispatch({ type: 'CHANNEL_FROM_HAND', index: i });
          else                   game.dispatch({ type: 'PLAY_FROM_HAND',    index: i });
        } catch (e) { console.error('[UI] hand click failed', e); }
      };
      ribbon.appendChild(el);
    });

    // animate NEW cards deck → hand (real nodes)
    const afterIds = cardIds(hand);
    const newIds = afterIds.filter(id => !beforeIds.includes(id));
    if (newIds.length) {
      const deckBtn = $('#chipDeck');
      if (deckBtn) {
        const newEls = newIds.map(id => ribbon.querySelector(`.handCard[data-card-id="${id}"]`)).filter(Boolean);
        animateDrawFan(deckBtn, newEls);
      }
    }
    prevHandIds = afterIds;
  }

  // -------------------- SLOTS --------------------
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
              <div class="cardTop"><div class="cardTitle">${s.c.n}</div><div class="cardSub">${s.c.t || 'Spell'}</div></div>
              <div class="cardBottom"><div class="cardVal">${(s.c.v != null ? '+'+s.c.v+'⚡' : '')} · ${s.ph || 1}/${s.c.p || 1}</div></div>
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
        if (!s) { cell.classList.add('empty'); cell.innerHTML = '<div class="slotGhost">Empty</div>'; }
        else {
          cell.innerHTML = `
            <div class="cardFrame slotPanel">
              <div class="cardTop"><div class="cardTitle">${s.c.n}</div><div class="cardSub">${s.c.t || 'Spell'}</div></div>
              <div class="cardBottom"><div class="cardVal">${(s.c.v != null ? '+'+s.c.v+'⚡' : '')} · ${s.ph || 1}/${s.c.p || 1}</div></div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }
        aiEl.appendChild(cell);
      });
    }
  }

  // -------------------- RENDER --------------------
  function draw() {
    const S = game.state || {};
    // capture old AI + flow signatures BEFORE rendering (to diff AFTER dispatch)
    const oldAISlotsSig  = prevAISlotsSig.slice(0);
    const oldAIHandCount = prevAIHandCount;
    const oldFlow        = prevFlowIds.slice(0);

    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    // update signatures for next diff
    prevAISlotsSig  = (S.ai?.slots || []).map(slotSig);
    prevAIHandCount = (S.ai?.hand?.length ?? 0);
    prevFlowIds     = (S.flowRow || []).map(c => c?.id ?? null);

    // AI animations by diff (ghosts)
    try {
      const deckA = aiDeckAnchor();
      const aeA   = aiAeAnchor();
      const aiSlotCells = $$('#aiSlots .slotCell');

      // new slot filled -> play
      for (let i = 0; i < prevAISlotsSig.length; i++) {
        if (oldAISlotsSig[i] === null && prevAISlotsSig[i] !== null) {
          const target = aiSlotCells[i]?.querySelector('.slotPanel') || aiSlotCells[i];
          if (deckA && target) ghostFly(deckA, target, { duration: 820 });
        }
      }
      // channel -> hand decreased but no new slot added
      const newSlotAdded = prevAISlotsSig.some((sig, i) => oldAISlotsSig[i] === null && sig !== null);
      if (!newSlotAdded && prevAIHandCount < oldAIHandCount) {
        if (deckA && aeA) ghostFly(deckA, aeA, { duration: 760, rotate: 10, scaleEnd:.45 });
      }
      // buy -> flow cell became empty
      const flowCards = $$('.marketCard .cardFrame');
      for (let i = 0; i < prevFlowIds.length; i++) {
        if (oldFlow[i] && !prevFlowIds[i]) {
          const from = flowCards[i];
          if (from && deckA) ghostFly(from, deckA, { duration: 780, rotate: 6, scaleEnd:.70 });
        }
      }
      // advance -> pulse the slot whose sig changed but remained filled
      for (let i = 0; i < prevAISlotsSig.length; i++) {
        const before = oldAISlotsSig[i], after = prevAISlotsSig[i];
        if (before && after && before !== after) {
          const cell = aiSlotCells[i];
          if (cell) {
            cell.classList.add('pulse');
            setTimeout(()=>cell.classList.remove('pulse'), 520);
          }
        }
      }
    } catch(e) {
      console.warn('[UI] AI diff/animation failed', e);
    }

    // re-bind drags
    if (window.DragCards?.refresh) window.DragCards.refresh();
  }

  // -------------------- AI TURN SEQUENCE --------------------
  const wait = (ms)=> new Promise(res => setTimeout(res, ms));
  async function runAiTurn() {
    game.dispatch({ type: 'AI_DRAW' });        draw(); await wait(220);
    game.dispatch({ type: 'AI_PLAY_SPELL' });  draw(); await wait(250);
    game.dispatch({ type: 'AI_CHANNEL' });     draw(); await wait(220);
    game.dispatch({ type: 'AI_ADVANCE' });     draw(); await wait(260);
    game.dispatch({ type: 'AI_BUY' });         draw(); await wait(220);
    game.dispatch({ type: 'AI_SPEND_TRANCE' });draw(); await wait(200);
  }

  // -------------------- DISPATCH WRAP (pre-animate discard) --------------------
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;

    game.dispatch = async (action) => {
      // PRE-ANIMATE if END_TURN: move live hand cards to discard first
      if (action && action.type === 'END_TURN') {
        const liveHand = Array.from(document.querySelectorAll('.ribbon .handCard'));
        const discardBtn = $('#chipDiscard');
        await animateDiscardFanSameNodes(liveHand, discardBtn);
        // now actually end turn
        const res = orig(action);
        draw();
        await runAiTurn();
        orig({ type: 'START_TURN' });
        draw();
        return res;
      }

      const res = orig(action);
      draw();
      return res;
    };

    game.__uiWrapped = true;
  }

  // -------------------- BUTTONS --------------------
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

  draw();
  console.log('[UI] v2.9 — draw fan (real nodes), discard fan (reverse, real nodes), AI visible flights.');
}

// -------------------- STYLES --------------------
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
    box-shadow: 0 2px 6px rgba(0,0,0,0.05) inset;
    transition: transform .15s, box-shadow .15s;
  }
  .slotCell:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.12); }
  .slotCell.empty { color: #9a9a9a; font-size: 12px; }
  .slotCell.ai { background: #f7f7fb; }
  .slotCell.advUsed { opacity: .85; }
  .slotCell.pulse { animation: slotPulse .52s ease-out; }
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
