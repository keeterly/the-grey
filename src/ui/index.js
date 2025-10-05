// =========================================================
// THE GREY — UI ENTRY (v2.3)
// • Readable MTG-style cards (63:88) in hand & market
// • End turn discards (rules) + fresh hand on new turn (engine calls START_TURN)
// • Slower animations: draw ~700ms, discard ~900ms
// • Card text moved to top
// • Hand & Aetherflow cards share the same dimensions (—card-w)
// • Drag refresh after each render
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // -------------- helpers --------------
  function setText(el, v) { if (el) el.textContent = String(v); }
  function pct(n, d) { return `${(100 * (n ?? 0)) / (d || 1)}%`; }

  const DEFAULT_WEAVER_YOU = 'Default';
  const DEFAULT_WEAVER_AI  = 'AI';

  // track previous hand ids for animations
  let prevHandIds = [];
  const cardIds = (arr) => (arr || []).map(c => c?.id ?? null).filter(Boolean);

  function flyClone(fromEl, toEl, options = {}) {
    if (!fromEl || !toEl) return;
    const from = fromEl.getBoundingClientRect();
    const to   = toEl.getBoundingClientRect();

    const ghost = (options.cloneEl || fromEl).cloneNode(true);
    ghost.classList.add('ghostFly');
    ghost.style.position = 'fixed';
    ghost.style.left = `${from.left}px`;
    ghost.style.top  = `${from.top}px`;
    ghost.style.width  = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = 9999;
    document.body.appendChild(ghost);

    const dx = to.left + (to.width - from.width)/2 - from.left;
    const dy = to.top  + (to.height - from.height)/2 - from.top;

    const dur = options.duration ?? 900; // slower global default
    ghost.animate([
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${options.scale ?? 0.75})`, opacity: 0.12 }
    ], { duration: dur, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => ghost.remove();
  }

  // -------------- HUD / TRANCE --------------
  function renderHUD(S) {
    setText($('#hpValue'),   S.hp ?? 0);
    setText($('#aeValue'),   S.ae ?? 0);
    setText($('#aiHpValue'), S.ai?.hp ?? 0);
    setText($('#aiAeValue'), S.ai?.ae ?? 0);

    const you = S.trance?.you || { cur:0, cap:6 };
    const ai  = S.trance?.ai  || { cur:0, cap:6 };

    const youFill = $('#youTranceFill');
    const aiFill  = $('#aiTranceFill');
    if (youFill) youFill.style.width = pct(you.cur, you.cap || 6);
    if (aiFill)  aiFill.style.width  = pct(ai.cur,  ai.cap  || 6);

    setText($('#youTranceCount'), `${you.cur ?? 0}/${you.cap ?? 6}`);
    setText($('#aiTranceCount'),  `${ai.cur ?? 0}/${ai.cap ?? 6}`);
  }

  // -------------- counters --------------
  function renderCounts(S) {
    setText($('#deckCount'),    (S.deck?.length ?? 0));
    setText($('#discardCount'), (S.disc?.length ?? 0));
  }

  // -------------- market --------------
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
        card.innerHTML = `
          <div class="cardTop">
            <div class="cardTitle">${c.n}</div>
            <div class="cardSub">${c.t || ''}</div>
          </div>
          <div class="cardBottom">
            <div class="cardVal">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div>
          </div>`;
        el.appendChild(card);
        el.onclick = () => {
          try { game.dispatch({ type: 'BUY_FLOW', index: i }); } catch (e) { console.error(e); }
        };
      } else {
        el.onclick = null;
      }
    }
  }

  // -------------- hand --------------
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

    // Animate draws (ids that weren't previously in hand)
    const afterIds = cardIds(hand);
    const deckBtn = $('#chipDeck');
    if (deckBtn) {
      afterIds.forEach(id => {
        if (!beforeIds.includes(id)) {
          const cardEl = ribbon.querySelector(`.handCard[data-card-id="${id}"]`);
          if (cardEl) flyClone(deckBtn, cardEl, { duration: 700, scale: 1.0 });
        }
      });
    }
    prevHandIds = afterIds;
  }

  // -------------- slots --------------
  function renderSlots(S) {
    const youEl = document.getElementById('playerSlots');
    const aiEl  = document.getElementById('aiSlots');

    if (youEl) {
      youEl.innerHTML = '';
      (S.slots || []).forEach((s, i) => {
        const cell = document.createElement('div');
        cell.className = 'slotCell';
        cell.dataset.slot = String(i);

        if (!s) {
          cell.classList.add('empty');
          cell.innerHTML = '<div class="slotGhost">Empty</div>';
        } else {
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

  // -------------- draw loop (with discard anim) --------------
  function draw() {
    const S = (game && game.state) || {};
    const beforeIds = prevHandIds.slice(0);

    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    // rebind drags
    if (window.DragCards && typeof window.DragCards.refresh === 'function') {
      window.DragCards.refresh();
    }

    // discards: any id that was in hand and is now gone
    const afterIds = cardIds(S.hand);
    const discBtn = $('#chipDiscard');
    if (discBtn) {
      beforeIds.forEach(id => {
        if (!afterIds.includes(id)) {
          // animate from ribbon proxy to discard (slower)
          const proxy = $('.ribbon .handCard') || $('#ribbon');
          if (proxy) flyClone(proxy, discBtn, { duration: 900, scale: 0.7 });
        }
      });
    }
    prevHandIds = afterIds;
  }

  // wrap dispatch
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;
    game.dispatch = (a) => { const r = orig(a); draw(); return r; };
    game.__uiWrapped = true;
  }

  // buttons
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
  console.log('[UI] init v2.3 — MTG cards (hand & market), slower anims, and proper turn flow.');
}

// ---------------------- styles ----------------------
const style = document.createElement('style');
style.textContent = `
  :root { --card-w: 160px; } /* one width for hand & aetherflow cards */

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

  /* Drag affordances */
  #playerSlots .slotCell.dropReady { outline: 2px dashed rgba(120,120,120,.25); outline-offset: -4px; }
  #playerSlots .slotCell.dropTarget { outline: 2px solid rgba(90,140,220,.6); outline-offset: -4px; box-shadow: 0 0 0 4px rgba(90,140,220,.08) inset; }

  .ghostFly { border-radius:12px; overflow:hidden; }
`;
document.head.appendChild(style);

if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
