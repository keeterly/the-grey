// =========================================================
// THE GREY — UI Renderer (classic script)
// - Compat DOM that matches your CSS (cards/slots/market/hand)
// - Wires Draw / End Turn / Reset
// =========================================================
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  let G = null;
  let elRibbon, elPlayerSlots, elGlyphTray, elAiSlots, elMarketCells;

  // ---------- card element ----------
  function makeCardEl(card, variant) {
    const el = document.createElement('div');
    el.className = 'card';
    if (variant === 'hand') el.classList.add('handCard');
    if (variant === 'flow') el.classList.add('marketCard');
    if (variant === 'slot' || variant === 'aiSlot') el.classList.add('slotCard');

    el.dataset.cid    = card.id || '';
    el.dataset.ctype  = card.t  || '';
    el.dataset.cname  = card.n  || '';
    el.dataset.cost   = String(card.p || 1);

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

  // ---------- market ----------
  function renderMarket() {
    for (let i=0;i<5;i++) {
      const cell = elMarketCells[i];
      if (!cell) continue;
      cell.innerHTML = '';
      const c = G.state.flowRow[i];
      if (!c) continue;

      const cardEl = makeCardEl(c, 'flow');
      cardEl.onclick = () => {
        G.dispatch({ type:'BUY_FLOW', index:i });
        window.Anim?.buyPulse?.(cardEl); // subtle pulse
        renderAll();
      };
      cell.appendChild(cardEl);
    }
  }

  // ---------- hand ----------
  function renderHand() {
    elRibbon.innerHTML = '';
    G.state.hand.forEach((c, idx) => {
      const cardEl = makeCardEl(c, 'hand');
      cardEl.onclick = (e) => {
        e.stopPropagation();
        if (c.t === 'Instant') {
          G.dispatch({ type:'CHANNEL_FROM_HAND', index: idx });
        } else {
          const s = G.state.slots.findIndex(x => !x);
          G.dispatch({ type:'PLAY_FROM_HAND', index: idx, slot: (s>=0?s:null) });
        }
        renderAll();
      };
      elRibbon.appendChild(cardEl);
    });
  }

  // ---------- player board ----------
  function renderPlayerSlots() {
    elPlayerSlots.innerHTML = '';
    for (let i=0;i<4;i++) {
      const cell = document.createElement('div');
      cell.className = 'slotCell';
      if (i===3) cell.classList.add('glyph');

      const slot = (i<3 ? G.state.slots[i] : null);
      if (slot && slot.c) {
        cell.appendChild(makeCardEl(slot.c, 'slot'));
      } else {
        cell.innerHTML = `<div class="emptyCell">Empty</div>`;
      }

      cell.onclick = () => {
        if (i<3 && G.state.slots[i]) {
          G.dispatch({ type:'ADVANCE', slot:i });
          renderAll();
        }
      };

      elPlayerSlots.appendChild(cell);
    }

    // glyph tray (face-down)
    elGlyphTray.innerHTML = '';
    G.state.glyphs.forEach(() => {
      const face = document.createElement('div');
      face.className = 'card glyphCard faceDown';
      face.innerHTML = `
        <div class="cHead"><div class="cName">Glyph</div><div class="cType">Face Down</div></div>
        <div class="cBody"></div><div class="cStats"></div>`;
      elGlyphTray.appendChild(face);
    });
  }

  // ---------- AI ----------
  function renderAiSlots() {
    elAiSlots.innerHTML = '';
    for (let i=0;i<3;i++) {
      const cell = document.createElement('div');
      cell.className = 'slotCell ai';
      const slot = G.state.ai.slots[i];
      if (slot && slot.c) cell.appendChild(makeCardEl(slot.c, 'aiSlot'));
      else cell.innerHTML = `<div class="emptyCell">Empty</div>`;
      elAiSlots.appendChild(cell);
    }
  }

  function renderCounts() {
    $('#deckCount').textContent    = String(G.state.deck.length);
    $('#discardCount').textContent = String(G.state.disc.length);
  }

  function renderAll() {
    renderMarket();
    renderHand();
    renderPlayerSlots();
    renderAiSlots();
    renderCounts();
    // Let drag.js refresh (it uses delegated listeners; this is a no-op)
    if (window.DragCards?.refresh) window.DragCards.refresh();
  }

  function wireButtons() {
    const btnDraw  = $('#btnDraw');
    const btnEnd   = $('#btnEnd');
    const btnReset = $('#btnReset');

    if (btnDraw) btnDraw.onclick = () => { G.dispatch({ type:'DRAW' }); renderAll(); };

    if (btnEnd) btnEnd.onclick = () => {
      // Player end
      G.dispatch({ type:'END_TURN' });
      renderAll();
    };

    if (btnReset) btnReset.onclick = () => {
      if (window.GameEngine?.create) window.game = G = window.GameEngine.create();
      renderAll();
    };

    // Quick peek modals (console for now)
    const deckBtn = $('#chipDeck');    if (deckBtn) deckBtn.onclick = () => console.log('[Deck]', G.state.deck);
    const discBtn = $('#chipDiscard'); if (discBtn) discBtn.onclick = () => console.log('[Discard]', G.state.disc);
  }

  function init(game) {
    G = game;
    elRibbon      = $('.ribbon');
    elPlayerSlots = $('#playerSlots');
    elGlyphTray   = $('#glyphTray');
    elAiSlots     = $('#aiSlots');
    elMarketCells = $$('.marketCard');

    wireButtons();
    renderAll();

    // Hide boot check widget if present
    const boot = document.querySelector('.bootCheck');
    if (boot) boot.style.display = 'none';

    console.log('[UI] v3.9+ — animations restored, typed highlights, fixed rows');
  }

  // Expose for bridge
  window.UI = { init };

  // Auto-init if bridge already created a game
  if (window.game) init(window.game);

})();
