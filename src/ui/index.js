// =========================================================
// THE GREY — UI ENTRY (v2.6)
// • MTG Arena–style animation polish
//    - Discard all: natural curve + bounce ease
//    - Draws: fan spread from deck → hand with stagger
// • Guards against overdraw errors
// =========================================================

export function init(game) {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';

  let prevHandIds = [];
  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);
  const rectOf = (el) => el.getBoundingClientRect();

  // ---------- 🌀 Arc flight utility ----------
  function flyArc(fromEl, toEl, {
    duration = 900,
    delay = 0,
    scaleEnd = 0.75,
    lift = 0.2,
    rotate = 6,
    easing = 'cubic-bezier(.18,.72,.24,1)'
  } = {}) {
    if (!fromEl || !toEl) return;
    const from = rectOf(fromEl);
    const to = rectOf(toEl);

    const ghost = fromEl.cloneNode(true);
    ghost.classList.add('ghostFly');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: 0,
      pointerEvents: 'none',
      zIndex: 9999
    });
    document.body.appendChild(ghost);

    const dx = to.left + (to.width - from.width)/2 - from.left;
    const dy = to.top  + (to.height - from.height)/2 - from.top;

    const dist = Math.hypot(dx, dy);
    const arcPx = Math.min(260, Math.max(70, dist * lift));
    const side = Math.random() < 0.5 ? -1 : 1;
    const rot = side * rotate;

    const anim = ghost.animate([
      { transform: `translate(0,0) rotate(0deg) scale(1)`, opacity: 1, offset: 0 },
      { transform: `translate(${dx*0.6}px, ${dy*0.45 - arcPx}px) rotate(${rot}deg) scale(1.08)`, opacity: 0.9, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot/2}deg) scale(${scaleEnd})`, opacity: 0.05, offset: 1 }
    ], { duration, delay, easing, fill: 'forwards' });

    anim.onfinish = () => ghost.remove();
  }

  // ---------- 🗑️ Discard Stream ----------
  function animateDiscardStream(fromCards, discardTarget) {
    if (!fromCards?.length || !discardTarget) return;
    const stagger = 90;
    fromCards.forEach((el, i) => {
      flyArc(el, discardTarget, {
        duration: 1000 + i * 120,
        delay: i * stagger,
        scaleEnd: 0.7,
        lift: 0.25,
        rotate: 8,
        easing: 'cubic-bezier(.28,.65,.36,1.25)' // smooth bounce-in
      });
    });
  }

  // ---------- 🃏 Draw Stream ----------
  function animateDrawStream(deckEl, newCards) {
    if (!deckEl || !newCards?.length) return;
    newCards.forEach((cardEl, i) => {
      const spread = (i - newCards.length / 2) * 12;
      cardEl.style.transform = `rotate(${spread * 0.3}deg)`;
      flyArc(deckEl, cardEl, {
        duration: 750 + i * 90,
        delay: i * 80,
        scaleEnd: 1,
        lift: 0.15,
        rotate: spread * 0.2,
        easing: 'cubic-bezier(.18,.75,.25,1)'
      });
    });
  }

  // ---------- 🎛 HUD ----------
  function renderHUD(S) {
    $('#hpValue').textContent = S.hp ?? 0;
    $('#aeValue').textContent = S.ae ?? 0;
    $('#aiHpValue').textContent = S.ai?.hp ?? 0;
    $('#aiAeValue').textContent = S.ai?.ae ?? 0;

    const you = S.trance?.you || {cur:0, cap:6};
    const ai  = S.trance?.ai  || {cur:0, cap:6};

    $('#youTranceFill').style.width = `${(you.cur/you.cap)*100}%`;
    $('#aiTranceFill').style.width  = `${(ai.cur/ai.cap)*100}%`;
  }

  // ---------- ♻️ Render ----------
  function renderHand(S) {
    const ribbon = $('#ribbon');
    const beforeIds = prevHandIds.slice();
    ribbon.innerHTML = '';

    const hand = S.hand || [];
    hand.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cardFrame handCard';
      el.dataset.cardId = c.id ?? '';
      el.innerHTML = `
        <div class="cardTop">
          <div class="cardTitle">${c.n}</div>
          <div class="cardSub">${c.t || ''}</div>
        </div>
        <div class="cardBottom">
          <div class="cardVal">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div>
        </div>`;
      ribbon.appendChild(el);
    });

    const afterIds = cardIds(hand);
    const newIds = afterIds.filter(id => !beforeIds.includes(id));
    if (newIds.length) {
      const deckBtn = $('#chipDeck');
      const newEls = newIds.map(id => ribbon.querySelector(`[data-card-id="${id}"]`)).filter(Boolean);
      animateDrawStream(deckBtn, newEls);
    }

    prevHandIds = afterIds;
  }

  // ---------- 🌒 Slots ----------
  function renderSlots(S) {
    const you = $('#playerSlots');
    you.innerHTML = '';
    (S.slots || []).forEach((s, i) => {
      const cell = document.createElement('div');
      cell.className = 'slotCell';
      if (s) {
        cell.innerHTML = `
          <div class="cardFrame slotPanel">
            <div class="cardTop"><div class="cardTitle">${s.c.n}</div><div class="cardSub">${s.c.t}</div></div>
            <div class="cardBottom"><div class="cardVal">${s.ph}/${s.c.p}</div></div>
          </div>`;
      } else {
        cell.innerHTML = '<div class="slotGhost">Empty</div>';
        cell.classList.add('empty');
      }
      you.appendChild(cell);
    });
  }

  // ---------- 🧭 Dispatch Wrap ----------
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;
    game.dispatch = (action) => {
      let fromCards = null;
      let discardTarget = null;
      if (action.type === 'END_TURN') {
        fromCards = Array.from(document.querySelectorAll('.handCard'));
        discardTarget = $('#chipDiscard');
      }
      const result = orig(action);
      draw();
      if (fromCards) animateDiscardStream(fromCards, discardTarget);
      return result;
    };
    game.__uiWrapped = true;
  }

  // ---------- 🎮 Buttons ----------
  $('#fabDraw').onclick  = () => game.dispatch({ type: 'DRAW' });
  $('#fabEnd').onclick   = () => game.dispatch({ type: 'END_TURN' });
  $('#fabReset').onclick = () => {
    game.dispatch({ type: 'RESET', playerWeaver: DEFAULT_WEAVER_YOU, aiWeaver: DEFAULT_WEAVER_AI });
    game.dispatch({ type: 'ENSURE_MARKET' });
    game.dispatch({ type: 'START_GAME' });
    game.dispatch({ type: 'START_TURN', first: true });
  };

  // ---------- 🧩 Core draw ----------
  function draw() {
    const S = game.state;
    renderHUD(S);
    renderHand(S);
    renderSlots(S);
    if (window.DragCards?.refresh) window.DragCards.refresh();
  }

  draw();
  console.log('[UI] v2.6 — MTG Arena draw/discard polish active.');
}

// ---------- 💅 Style ----------
const style = document.createElement('style');
style.textContent = `
  :root { --card-w: 160px; }
  .cardFrame {
    aspect-ratio: 63/88;
    width: var(--card-w);
    border-radius: 12px;
    background: #fff;
    border: 1px solid rgba(0,0,0,0.1);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .cardTop { padding: 8px 10px 0; }
  .cardBottom { padding: 0 10px 8px; }
  .cardTitle { font-weight:700; font-size:15px; color:#222; }
  .cardSub { font-size:13px; color:#555; }
  .cardVal { font-size:13px; color:#a52d2d; }
  .handCard:hover { transform:translateY(-4px); box-shadow:0 8px 18px rgba(0,0,0,0.25); transition: all .2s; }
  .ghostFly { border-radius:12px; overflow:hidden; }
`;
document.head.appendChild(style);
