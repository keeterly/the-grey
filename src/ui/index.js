// =========================================================
// THE GREY — UI ENTRY (no engine imports)
// Renders HUD + Aetherflow and re-renders after each action.
// =========================================================

export function init(game) {
  const $ = (sel) => (sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function setText(el, v) { if (el) el.textContent = String(v); }
  function pct(n, d) { return `${(100 * (n ?? 0)) / (d || 1)}%`; }

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

  function renderCounts(S) {
    setText($('#deckCount'), (S.deck?.length ?? 0));
    setText($('#discardCount'), (S.disc?.length ?? 0));
  }

  function cardLabel(c) {
    if (!c) return '';
    const type = c.t || '';
    const val  = (c.v != null) ? ` · +${c.v}⚡` : '';
    const phases = (c.p != null) ? ` · ${c.p}ϟ` : '';
    return `${c.n || 'Card'} · ${type}${val}${phases}`;
  }

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
        div.style.opacity = '0.9';
        div.textContent = cardLabel(c);
        el.appendChild(div);

        // click to buy
        el.onclick = () => {
          try { game.dispatch({ type: 'BUY_FLOW', index: i }); draw(); }
          catch (e) { console.error('[UI] BUY_FLOW failed', e); }
        };
      } else {
        el.onclick = null;
      }
    }
  }

  function draw() {
    const S = (game && game.state) || {};
    renderHUD(S);
    renderCounts(S);
    renderFlow(S);
  }

  // Wrap dispatch to re-render after every action
  if (game && typeof game.dispatch === 'function' && !game.__uiWrapped) {
    const orig = game.dispatch;
    game.dispatch = (a) => { const r = orig(a); draw(); return r; };
    game.__uiWrapped = true;
  }

  // Wire HUD FABs
  const map = [
    ['#fabDraw',  { type: 'DRAW' }],
    ['#fabEnd',   { type: 'END_TURN' }],
    ['#fabReset', { type: 'RESET' }],
  ];
  map.forEach(([sel, action]) => {
    const el = $(sel);
    if (el) el.onclick = () => { try { game.dispatch(action); } catch(e) { console.error(e); } };
  });

  draw();
  console.log('[UI] init complete. HUD + market rendering wired.');
}

// optional global for legacy paths
if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
