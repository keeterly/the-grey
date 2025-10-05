// =========================================================
// THE GREY — UI ENTRY (v2.8)
// • Player animations:
//    - Draw: same DOM card flies from deck → hand (fan, stagger, ease)
//    - Discard: fan-style stream from hand → discard chip (stagger, ease)
// • AI turn: automatically runs after END_TURN (draw/play/channel/advance/buy/spend)
// • MTG proportions; drag refresh after each render
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';

  const rectOf = (el)=> el.getBoundingClientRect();
  const text = (el, v)=> { if (el) el.textContent = String(v); };
  const pct  = (n, d)=> `${(100 * (n ?? 0)) / (d || 1)}%`;

  // previous snapshots (used for animations)
  let prevHandIds = [];
  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);

  // -------------------- ANIMATION HELPERS --------------------

  // Fan-style discard using ghost clones (safe because original nodes may re-render away).
  // Returns a Promise that resolves when the last card finishes.
  function animateDiscardFan(fromCardEls, discardTargetEl) {
    if (!fromCardEls?.length || !discardTargetEl) return Promise.resolve();

    const lastIndex = fromCardEls.length - 1;
    const baseDur = 880;   // ms
    const extra   = 260;   // tail
    const stagger = 110;   // spacing

    const to = rectOf(discardTargetEl);

    const promises = fromCardEls.map((el, i) => new Promise((resolve) => {
      const from = rectOf(el);
      const ghost = el.cloneNode(true);
      ghost.classList.add('ghostFly');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${from.left}px`,
        top:  `${from.top}px`,
        width:  `${from.width}px`,
        height: `${from.height}px`,
        margin: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: '1'
      });
      document.body.appendChild(ghost);

      // Little fan spread based on index
      const spread = (i - lastIndex/2) * 12;
      const kx = (to.left + (to.width - from.width)/2) - from.left;
      const ky = (to.top  + (to.height - from.height)/2) - from.top;

      const midX = from.left + kx*0.5 + spread * 2;
      const midY = from.top  + ky*0.45 - Math.min(240, Math.max(80, Math.hypot(kx,ky)*0.18));

      const dur = baseDur + (i/Math.max(1,lastIndex)) * extra;
      const delay = i * stagger;

      const anim = ghost.animate([
        { transform: `translate(0px, 0px) rotate(${spread * 0.35}deg) scale(1)`,   opacity: 1,   offset: 0 },
        { transform: `translate(${midX-from.left}px, ${midY-from.top}px) rotate(${spread * 0.6}deg) scale(1.06)`, opacity: .95, offset: .55 },
        { transform: `translate(${kx}px, ${ky}px) rotate(${spread * 0.2}deg) scale(.72)`, opacity: .08, offset: 1 }
      ], { duration: dur, delay, easing: 'cubic-bezier(.26,.7,.32,1.12)', fill: 'forwards' });

      anim.onfinish = () => { ghost.remove(); resolve(); };
    }));

    return Promise.all(promises);
  }

  // Draw stream: animate the *real* card nodes from deck → hand (no clones).
  function animateDrawFan(deckEl, newCardEls) {
    if (!deckEl || !newCardEls?.length) return;

    const deck = rectOf(deckEl);

    newCardEls.forEach((cardEl, i) => {
      const target = rectOf(cardEl);
      const dx = deck.left - target.left;
      const dy = deck.top  - target.top;

      // start at deck, tiny & rotated
      cardEl.style.transform  = `translate(${dx}px, ${dy}px) scale(0.2) rotate(-12deg)`;
      cardEl.style.opacity    = '0';
      cardEl.style.transition = 'none';
      void cardEl.offsetWidth; // reflow

      const delay = i * 130;
      cardEl.style.transition = `transform 0.8s cubic-bezier(.2,.8,.3,1), opacity .8s ease`;
      setTimeout(() => {
        cardEl.style.transform = `translate(0,0) scale(1) rotate(0deg)`;
        cardEl.style.opacity   = '1';
      }, delay);
    });
  }

  // -------------------- HUD & COUNTS --------------------
  function renderHUD(S) {
    text($('#hpValue'),   S.hp ?? 0);
    text($('#aeValue'),   S.ae ?? 0);
    text($('#aiHpValue'), S.ai?.hp ?? 0);
    text($('#aiAeValue'), S.ai?.ae ?? 0);

    const you = S.trance?.you || {cur:0, cap:6};
    const ai  = S.trance?.ai  || {cur:0, cap:6};

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

  // -------------------- HAND --------------------
  function renderHand(S) {
    const ribbon = $('#ribbon');
    if (!ribbon) return;

    const beforeIds = prevHandIds.slice(0);
    ribbon.innerHTML = '';

    const hand = S.hand || [];
    hand.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cardFrame handCard';
      el.dataset.index  = i;
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

    // Animate NEW cards (deck → hand) using the real nodes
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
      (S.ai?.slots || []).forEach((s) => {
        const cell = document.createElement('div');
        cell.className = 'slotCell ai';
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

  // -------------------- RENDER TICK --------------------
  function draw() {
    const S = game.state || {};
    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    if (window.DragCards && typeof window.DragCards.refresh === 'function') {
      window.DragCards.refresh();
    }
  }

  // -------------------- AI TURN SEQUENCE --------------------
  const wait = (ms)=> new Promise(res => setTimeout(res, ms));
  async function runAiTurn() {
    // Simple readable sequence with short pauses so UI can animate
    game.dispatch({ type: 'AI_DRAW' });     draw(); await wait(200);
    game.dispatch({ type: 'AI_PLAY_SPELL' });draw(); await wait(250);
    game.dispatch({ type: 'AI_CHANNEL' });  draw(); await wait(200);
    game.dispatch({ type: 'AI_ADVANCE' });  draw(); await wait(250);
    game.dispatch({ type: 'AI_BUY' });      draw(); await wait(200);
    game.dispatch({ type: 'AI_SPEND_TRANCE' }); draw(); await wait(200);
  }

  // -------------------- DISPATCH WRAP --------------------
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;

    game.dispatch = async (action) => {
      let capturedHandEls = null, discardTarget = null;

      // Capture live hand nodes BEFORE the state changes when ending turn
      if (action && action.type === 'END_TURN') {
        capturedHandEls = Array.from(document.querySelectorAll('.ribbon .handCard'));
        discardTarget = $('#chipDiscard');
      }

      const result = orig(action);
      draw();

      // If we ended turn, animate discard fan, then run AI, then start our turn.
      if (capturedHandEls && discardTarget) {
        await animateDiscardFan(capturedHandEls, discardTarget);
        await runAiTurn();
        // Back to player turn
        orig({ type: 'START_TURN' });
        draw();
      }

      return result;
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
  console.log('[UI] v2.8 — draw & discard fan + AI turn sequencing');
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
