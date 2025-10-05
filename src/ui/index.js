// =========================================================
// THE GREY — UI ENTRY (v2.0 full visual + hand rendering)
// =========================================================

export function init(game) {
  const $  = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function setText(el, v) { if (el) el.textContent = String(v); }
  function pct(n, d) { return `${(100 * (n ?? 0)) / (d || 1)}%`; }

  // -------------------------------------------------------
  // HUD & TRANCE
  // -------------------------------------------------------
  function renderHUD(S) {
    setText($('#hpValue'), S.hp ?? 0);
    setText($('#aeValue'), S.ae ?? 0);
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
    setText($('#deckCount'), (S.deck?.length ?? 0));
    setText($('#discardCount'), (S.disc?.length ?? 0));
  }

  // -------------------------------------------------------
  // HELPER FOR TEXT
  // -------------------------------------------------------
  function cardLabel(c) {
    if (!c) return '';
    const val = (c.v != null) ? ` +${c.v}⚡` : '';
    const ph  = (c.p != null) ? ` ${c.p}ϟ` : '';
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
        const div = document.createElement('div');
        div.className = 'marketItem';
        div.style.padding = '10px';
        div.style.fontSize = '12px';
        div.style.lineHeight = '1.2em';
        div.style.opacity = '0.95';
        div.textContent = cardLabel(c);
        el.appendChild(div);

        el.onclick = () => {
          try { game.dispatch({ type: 'BUY_FLOW', index: i }); draw(); }
          catch (e) { console.error('[UI] BUY_FLOW failed', e); }
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
    ribbon.innerHTML = '';

    const hand = S.hand || [];
    if (!hand.length) {
      ribbon.innerHTML = '<div class="hint" style="opacity:0.5;padding:8px;">(Empty hand)</div>';
      return;
    }

    hand.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'handCard';
      card.innerHTML = `
        <div class="artWrap"></div>
        <div class="textWrap">
          <div class="title">${c.n}</div>
          <div class="sub">${c.t || ''}</div>
          <div class="val">${(c.v != null ? '+'+c.v+'⚡' : '')}</div>
        </div>`;
      card.dataset.index = i;

      // click to play or channel
      card.onclick = (e) => {
        if (c.t === 'Instant') {
          game.dispatch({ type: 'CHANNEL_FROM_HAND', index: i });
        } else {
          game.dispatch({ type: 'PLAY_FROM_HAND', index: i });
        }
        draw();
      };

      ribbon.appendChild(card);
    });
  }

  // -------------------------------------------------------
  // MAIN DRAW FUNCTION (re-renders everything)
  // -------------------------------------------------------
  function draw() {
    const S = (game && game.state) || {};
    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
    renderHand(S);
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
  console.log('[UI] init complete. HUD + market + hand rendering wired.');
}

// ---------------------------------------------------------
// Styles injection (restores old visual flavor)
// ---------------------------------------------------------
const style = document.createElement('style');
style.textContent = `
  .handCard {
    display:inline-block;
    width:120px; height:160px;
    background:#f9f7f3;
    border-radius:12px;
    margin:4px;
    padding:6px;
    box-shadow:0 2px 6px rgba(0,0,0,0.2);
    transition:transform 0.2s ease, box-shadow 0.2s ease;
    cursor:pointer;
  }
  .handCard:hover {
    transform:translateY(-4px);
    box-shadow:0 6px 12px rgba(0,0,0,0.3);
  }
  .handCard .title {
    font-weight:600;
    font-size:14px;
    margin-bottom:2px;
  }
  .handCard .sub {
    font-size:12px;
    color:#666;
  }
  .handCard .val {
    margin-top:4px;
    font-size:12px;
    color:#c33;
  }
  .ribbon {
    display:flex;
    flex-wrap:nowrap;
    overflow-x:auto;
    justify-content:center;
    padding:8px;
  }
`;
document.head.appendChild(style);

if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
