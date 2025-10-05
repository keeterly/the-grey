// =========================================================
// THE GREY — UI (v3.12)
// - Wider + lower Arena-like hand (less obstruction)
// - Deck/Discard/Aether gem counters updated
// - Honors precise drop slot from drag.js (data-drop-slot)
// =========================================================

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

let elRibbon, elPlayerSlots, elAiSlots, elMarketCells;
let G = null;

/* ---------- card factory ---------- */
function makeCardEl(card, variant) {
  const el = document.createElement('div');
  el.className = 'card';
  if (variant === 'hand')   el.classList.add('handCard');
  if (variant === 'flow')   el.classList.add('marketCard');
  if (variant === 'slot')   el.classList.add('slotCard');
  if (variant === 'aiSlot') el.classList.add('slotCard');

  el.dataset.cid   = card.id || '';
  el.dataset.ctype = card.t || '';
  el.dataset.cname = card.n || '';
  el.dataset.cost  = String(card.p || 1);

  el.innerHTML = `
    <div class="cHead">
      <div class="cName">${card.n || 'Card'}</div>
      <div class="cType">${card.t || ''}</div>
    </div>
    <div class="cBody">
      ${card.txt ? `<div class="cText">${card.txt}</div>` : ''}
    </div>
    <div class="cStats">
      ${('v' in card) ? `<span class="stat v">+${card.v||0}⚡</span>` : ''}
      ${('p' in card) ? `<span class="stat p">${card.p||1}↯</span>` : ''}
    </div>
  `;
  return el;
}

/* ---------- lightweight anim helpers ---------- */
function flyElement(el, toRect, {duration=350, scale=0.92, easing='cubic-bezier(.2,.8,.2,1)'} = {}) {
  const from = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  Object.assign(ghost.style, {
    position:'fixed', pointerEvents:'none', margin:'0',
    left:`${from.left}px`, top:`${from.top}px`,
    width:`${from.width}px`, height:`${from.height}px`,
    zIndex:'9999', transformOrigin:'50% 50%'
  });
  document.body.appendChild(ghost);

  const dx = toRect.left - from.left;
  const dy = toRect.top  - from.top;

  return ghost.animate([
    { transform: `translate(0,0) scale(1)`, opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: .85 }
  ], { duration, easing }).finished.then(() => ghost.remove());
}

async function animateBuyToDiscard(sourceEl) {
  const chip = $('#chipDiscard') || $('#chipDeck') || document.body;
  await flyElement(sourceEl, chip.getBoundingClientRect(), { duration: 420, scale: 0.88 });
}

async function animateDiscardHand() {
  const handCards = $$('.ribbon .handCard');
  const chip = $('#chipDiscard') || document.body;
  const r = chip.getBoundingClientRect();

  for (let i = 0; i < handCards.length; i++) {
    await flyElement(handCards[i], r, { duration: 260 + i*28, scale: 0.86 });
  }
}

async function animateDrawHand() {
  const deck = $('#chipDeck') || document.body;
  const r = deck.getBoundingClientRect();
  const handCards = $$('.ribbon .handCard');

  handCards.forEach((el, i) => {
    const to = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.remove('handCard');
    Object.assign(ghost.style, {
      position:'fixed', left:`${r.left}px`, top:`${r.top}px`,
      width:`${to.width}px`, height:`${to.height}px`,
      zIndex:'9999', pointerEvents:'none'
    });
    document.body.appendChild(ghost);
    ghost.animate(
      [
        { transform: 'translate(0,0) scale(.9)', opacity: .0 },
        { transform: `translate(${to.left - r.left}px, ${to.top - r.top}px) scale(1)`, opacity: 1 }
      ],
      { duration: 260 + i*24, easing: 'cubic-bezier(.2,.8,.2,1)' }
    ).finished.then(() => ghost.remove());
  });

  requestAnimationFrame(fanHandFallback);
}

/* ---------- hand fan (wider + lower) ---------- */
function fanHandFallback() {
  if (window.Anim?.fanHand) {
    window.Anim.fanHand(elRibbon, { spacing: 36, maxAngle: 10, maxLift: 10, baseY: 36 });
    return;
  }
  const cards = $$('.handCard', elRibbon);
  const n = cards.length;
  if (!n) return;

  const wrapW = elRibbon.clientWidth || 800;
  const maxSpread = Math.max(24, Math.min(52, Math.floor(wrapW / Math.max(n + 2, 4))));
  const angleMax  = 10;
  const liftScale = 9;
  const baseY     = 36;       // LOWER: push hand down so it doesn’t obscure the board
  const mid = (n - 1) / 2;

  cards.forEach((c, i) => {
    const t = (i - mid);
    const x = t * maxSpread;
    const y = baseY - Math.abs(t) * (liftScale / Math.max(1, n/6));
    const a = (t / mid || 0) * angleMax;
    c.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
    c.style.zIndex = String(100 + i);
  });
}

/* ---------- Market ---------- */
function renderMarket() {
  for (let i = 0; i < 5; i++) {
    const cell = elMarketCells[i];
    if (!cell) continue;
    cell.innerHTML = '';
    const c = G.state.flowRow[i];
    if (!c) continue;

    const cardEl = makeCardEl(c, 'flow');
    cardEl.onclick = async () => {
      await animateBuyToDiscard(cardEl);
      G.dispatch({ type: 'BUY_FLOW', index: i });
      G.dispatch({ type: 'ENSURE_MARKET' }); // refill immediately
      renderAll();
    };
    cell.appendChild(cardEl);
  }
}

/* ---------- Hand ---------- */
function renderHand() {
  elRibbon.innerHTML = '';
  G.state.hand.forEach((c, idx) => {
    const cardEl = makeCardEl(c, 'hand');
    cardEl.onclick = (e) => {
      e.stopPropagation();
      const drop = cardEl.dataset.dropSlot;
      const dropSlot = (drop !== undefined && drop !== '') ? parseInt(drop, 10) : null;
      cardEl.dataset.dropSlot = '';

      if (c.t === 'Instant') {
        G.dispatch({ type: 'CHANNEL_FROM_HAND', index: idx });
      } else if (c.t === 'Glyph') {
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: null });
      } else {
        let s = dropSlot;
        if (s == null || s < 0 || s > 2) s = G.state.slots.findIndex(x => !x);
        G.dispatch({ type: 'PLAY_FROM_HAND', index: idx, slot: (s >= 0 ? s : null) });
      }
      renderAll();
    };
    elRibbon.appendChild(cardEl);
  });

  requestAnimationFrame(fanHandFallback);
}

/* ---------- Player / AI ---------- */
function renderPlayerSlots() {
  elPlayerSlots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell';
    cell.dataset.slotIndex = String(i);
    if (i === 3) cell.classList.add('glyph');

    if (i < 3) {
      const slot = G.state.slots[i];
      if (slot && slot.c) cell.appendChild(makeCardEl(slot.c, 'slot'));
      else cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    } else {
      if ((G.state.glyphs||[]).length > 0) {
        const face = document.createElement('div');
        face.className = 'card glyphCard faceDown';
        face.innerHTML = `
          <div class="cHead"><div class="cName">Glyph</div><div class="cType">Face Down</div></div>
          <div class="cBody"></div>
          <div class="cStats"></div>
        `;
        cell.appendChild(face);
      } else {
        cell.innerHTML = `<div class="emptyCell">Glyph</div>`;
      }
    }

    cell.onclick = () => {
      if (i < 3 && G.state.slots[i]) {
        G.dispatch({ type: 'ADVANCE', slot: i });
        renderAll();
      }
    };

    elPlayerSlots.appendChild(cell);
  }
}

function renderAiSlots() {
  elAiSlots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell ai';
    const slot = G.state.ai.slots[i];
    if (slot && slot.c) cell.appendChild(makeCardEl(slot.c, 'aiSlot'));
    else cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    elAiSlots.appendChild(cell);
  }
}

/* ---------- Counts ---------- */
function renderCounts() {
  $('#deckCount').textContent    = String(G.state.deck.length);
  $('#discardCount').textContent = String(G.state.disc.length);
  $('#aeGemCount').textContent   = String(G.state.ae || 0);
}

/* ---------- full redraw ---------- */
function renderAll() {
  renderMarket();
  renderHand();
  renderPlayerSlots();
  renderAiSlots();
  renderCounts();

  if (window.DragCards?.refresh) window.DragCards.refresh();
}

/* ---------- buttons ---------- */
function wireButtons() {
  const btnDraw  = $('#btnDraw');
  const btnEnd   = $('#btnEnd');
  const btnReset = $('#btnReset');

  if (btnDraw)  btnDraw.onclick  = async () => { 
    G.dispatch({ type:'DRAW' }); 
    renderAll(); 
    await animateDrawHand();
  };

  if (btnEnd)   btnEnd.onclick   = async () => {
    await animateDiscardHand();
    G.dispatch({ type:'END_TURN' });

    G.dispatch({ type:'AI_DRAW' });
    G.dispatch({ type:'AI_PLAY_SPELL' });
    G.dispatch({ type:'AI_CHANNEL' });
    G.dispatch({ type:'AI_ADVANCE' });
    G.dispatch({ type:'AI_BUY' });
    G.dispatch({ type:'AI_SPEND_TRANCE' });

    G.dispatch({ type:'START_TURN' });
    renderAll();
    await animateDrawHand();
  };

  if (btnReset) btnReset.onclick = () => {
    if (window.GameEngine?.create) {
      window.game = G = window.GameEngine.create();
      G.dispatch({ type:'ENSURE_MARKET' });
      G.dispatch({ type:'START_TURN', first:true });
      renderAll();
      fanHandFallback();
    }
  };

  window.addEventListener('resize', () => requestAnimationFrame(fanHandFallback));
}

/* ---------- init ---------- */
export function init(game) {
  G = game;

  elRibbon      = $('.ribbon');
  elPlayerSlots = $('#playerSlots');
  elAiSlots     = $('#aiSlots');
  elMarketCells = $$('.marketCard');

  wireButtons();

  G.dispatch({ type:'ENSURE_MARKET' });
  G.dispatch({ type:'START_TURN', first:true });

  renderAll();
  fanHandFallback();

  const boot = document.querySelector('.bootCheck');
  if (boot) boot.style.display = 'none';

  console.log('[UI] v3.12 — lower hand, no-damp drag, icons + gem floating');
}
