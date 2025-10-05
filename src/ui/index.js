// =========================================================
// THE GREY — UI ENTRY (v2.1)
// - MTG proportions (63/88) for hand + slot cards
// - Animations: draw (deck → hand), end-turn discard (hand → discard)
// - Drag refresh hooks
// - Shows actual card panel in the slot
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function setText(el, v) { if (el) el.textContent = String(v); }
  function pct(n, d) { return `${(100 * (n ?? 0)) / (d || 1)}%`; }

  // ------- animation helpers -------
  let prevHandIds = [];
  function cardIds(arr) { return (arr || []).map(c => c?.id ?? null).filter(Boolean); }

  function flyClone(fromEl, toEl, options = {}) {
    if (!fromEl || !toEl) return;
    const from = fromEl.getBoundingClientRect();
    const to   = toEl.getBoundingClientRect();

    const ghost = fromEl.cloneNode(true);
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

    const duration = options.duration || 350;
    ghost.animate([
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${options.scale ?? 0.5})`, opacity: 0.2 }
    ], { duration, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => {
      ghost.remove();
    };
  }

  // -------------------------------------------------------
  // HUD / TRANCE
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // COUNTERS
  // -------------------------------------------------------
  function renderCounts(S) {
    setText($('#deckCount'),    (S.deck?.length ?? 0));
    setText($('#discardCount'), (S.disc?.length ?? 0));
  }

  // -------------------------------------------------------
  // TEXT HELPERS
  // -------------------------------------------------------
  function cardLabel(c) {
    if (!c) return '';
    const val = (c.v != null) ? ` +${c.v}⚡` : '';
    const ph  = (c.p != null) ? ` · ${c.p}ϟ` : '';
    return `${c.n || 'Card'} · ${c.t || ''}${val}${ph}`;
  }

  // -------------------------------------------------------
  // AETHERFLOW (MARKET)
  // -------------------------------------------------------
  function renderFlow(S) {
    const cells = $$('.marketCard');
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i];
      const c = S.flowRow?.[i] || null;

      el.innerHTML = '';
      el.classList.toggle('empty', !c);

      if (c) {
        const card = document.createElement('div');
        card.className = 'marketCardPanel';
        card.innerHTML = `
          <div class="m-title">${c.n}</div>
          <div class="m-sub">${c.t || ''}</div>
          <div class="m-val">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div>
        `;
        el.appendChild(card);

        el.onclick = () => {
          try { game.dispatch({ type: 'BUY_FLOW', index: i }); } catch (e) { console.error(e); }
        };
      } else {
        el.onclick = null;
      }
    }
  }

  // -------------------------------------------------------
  // PLAYER HAND (RIBBON)
  // -------------------------------------------------------
  function renderHand(S) {
    const ribbon = $('#ribbon');
    if (!ribbon) return;
    const beforeIds = prevHandIds.slice(0);

    ribbon.innerHTML = '';
    const hand = S.hand || [];

    hand.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'handCard';
      el.dataset.index = i;
      el.dataset.cardId = c?.id ?? '';
      el.innerHTML = `
        <div class="artWrap"></div>
        <div class="textWrap">
          <div class="title">${c.n}</div>
          <div class="sub">${c.t || ''}</div>
          <div class="val">${(c.v != null ? '+'+c.v+'⚡' : '')}${(c.p != null ? ' · '+c.p+'ϟ' : '')}</div>
        </div>`;
      el.onclick = () => {
        try {
          if (c.t === 'Instant') game.dispatch({ type: 'CHANNEL_FROM_HAND', index: i });
          else                   game.dispatch({ type: 'PLAY_FROM_HAND',    index: i });
        } catch (e) { console.error('[UI] hand click failed', e); }
      };
      ribbon.appendChild(el);
    });

    // Animate draws (new ids added)
    const afterIds = cardIds(hand);
    const deckBtn = $('#chipDeck');
    if (deckBtn) {
      afterIds.forEach(id => {
        if (!beforeIds.includes(id)) {
          // find this card element
          const cardEl = ribbon.querySelector(`.handCard[data-card-id="${id}"]`);
          if (cardEl) flyClone(deckBtn, cardEl, { scale: 1.0, duration: 380 });
        }
      });
    }
    prevHandIds = afterIds;
  }

  // -------------------------------------------------------
  // BOARD SLOTS (YOU + AI) — with MTG panel look
  // -------------------------------------------------------
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
            <div class="slotPanel">
              <div class="sp-title">${s.c.n}</div>
              <div class="sp-sub">${s.c.t || 'Spell'}</div>
              <div class="sp-prog">${s.ph || 1}/${s.c.p || 1}</div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }

        // click to ADVANCE (your board only)
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
            <div class="slotPanel">
              <div class="sp-title">${s.c.n}</div>
              <div class="sp-sub">${s.c.t || 'Spell'}</div>
              <div class="sp-prog">${s.ph || 1}/${s.c.p || 1}</div>
            </div>`;
          if (s.advUsed) cell.classList.add('advUsed');
        }
        aiEl.appendChild(cell);
      });
    }
  }

  // -------------------------------------------------------
  // MAIN DRAW — includes discard animation on END_TURN
  // -------------------------------------------------------
  function draw() {
    const S = (game && game.state) || {};
    const beforeIds = prevHandIds.slice(0);

    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
    renderSlots(S);

    // Rebind drag handles after each render
    if (window.DragCards && typeof window.DragCards.refresh === 'function') {
      window.DragCards.refresh();
    }

    // Detect discard (hand id removed) and animate to discard chip
    const afterIds = cardIds(S.hand);
    const discBtn = $('#chipDiscard');
    if (discBtn) {
      beforeIds.forEach(id => {
        if (!afterIds.includes(id)) {
          // find an element that had this id previously: we approximate by animating
          // from the ribbon area center (since node is gone); use first current card as proxy
          const proxy = $('.ribbon .handCard') || $('#ribbon');
          if (proxy) flyClone(proxy, discBtn, { scale: 0.5, duration: 330 });
        }
      });
    }

    prevHandIds = afterIds;
  }

  // Wrap dispatch to auto-redraw
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;
    game.dispatch = (a) => { const r = orig(a); draw(); return r; };
    game.__uiWrapped = true;
  }

  // Wire FABs
  [['#fabDraw','DRAW'],['#fabEnd','END_TURN'],['#fabReset','RESET']]
    .forEach(([sel,type])=>{
      const el=$(sel);
      if(el) el.onclick=()=>game.dispatch({type});
    });

  draw();
  console.log('[UI] init complete. HUD + flow + hand + slots + animations wired.');
}

// ---------------------------------------------------------
// Style injection (MTG proportions + panels)
// ---------------------------------------------------------
const style = document.createElement('style');
style.textContent = `
  /* Hand ribbon */
  .ribbon { display:flex; flex-wrap:nowrap; overflow-x:auto; justify-content:center; padding:8px; gap:8px; }

  /* MTG proportions via aspect-ratio 63:88 */
  .handCard, .slotPanel, .marketCardPanel {
    aspect-ratio: 63 / 88;
    width: 120px;
    height: auto;
    border-radius: 12px;
    background: #f9f7f3;
    border: 1px solid rgba(0,0,0,.06);
    box-shadow: 0 2px 6px rgba(0,0,0,0.18);
    display:flex; flex-direction:column; justify-content:flex-end;
    padding: 8px;
  }
  .handCard { cursor:pointer; transition:transform .2s, box-shadow .2s; }
  .handCard:hover { transform:translateY(-4px); box-shadow:0 8px 18px rgba(0,0,0,.22); }

  .textWrap .title, .sp-title, .m-title { font-weight:600; font-size:14px; line-height:1.1; }
  .textWrap .sub, .sp-sub, .m-sub     { font-size:12px; color:#666; }
  .textWrap .val, .m-val              { font-size:12px; color:#c33; margin-top:2px; }

  /* Board grids */
  #playerSlots, #aiSlots {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 14px;
    padding: 8px 12px 16px;
  }
  .slotCell {
    display:flex; align-items:center; justify-content:center;
    user-select: none; cursor: pointer;
    min-height: 160px;
    border-radius: 16px;
    background: #fffaf4;
    border: 1px solid rgba(0,0,0,.06);
    box-shadow: 0 2px 6px rgba(0,0,0,.05) inset;
    transition: transform .15s, box-shadow .15s;
  }
  .slotCell:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.12); }
  .slotCell.empty { color: #aaa; font-size: 12px; }
  .slotCell.ai { background: #f7f7fb; }
  .slotCell.advUsed { opacity: .8; }

  /* Ghost fly clone */
  .ghostFly { opacity: .9; border-radius:12px; overflow:hidden; }

  /* Market card in flow cells */
  .marketCardPanel { width: 100%; height: auto; box-shadow: none; }
`;
document.head.appendChild(style);

// Optional global for legacy paths
if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
