// /src/ui/ui.js — Fan strip layout (centered, smooth, Safari-safe)

/* ------------------ tiny DOM helpers ------------------ */
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }


// ----- DnD helpers -----
let _gameRef = null; // store game to dispatch on drop

function getBoardSlotsEl() { return document.querySelector('#yourBoard'); }
function getBoardSlotNodes() {
  const root = getBoardSlotsEl();
  if (!root) return [];
  return Array.from(root.querySelectorAll('.boardSlot'));
}
function markSlots(mode){ // '', 'target', 'accept'
  const nodes = getBoardSlotNodes();
  nodes.forEach(n => {
    n.classList.remove('drop-target','drop-accept');
    if (mode === 'target') n.classList.add('drop-target');
    if (mode === 'accept') n.classList.add('drop-accept');
  });
}
function slotIndexFromPoint(x, y){
  const nodes = getBoardSlotNodes();
  for (let i=0;i<nodes.length;i++){
    const r = nodes[i].getBoundingClientRect();
    if (x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return i;
  }
  return -1;
}



/* ------------------ Card template ------------------ */
function cardEl({ title = 'Card', subtype = '', right = '', classes = '' } = {}) {
  const c = el('div', `card ${classes}`.trim());
  c.innerHTML = `
    <div class="cHead">
      <div class="cName">${title}</div>
      <div class="cType">${subtype}</div>
    </div>
    <div class="cBody"></div>
    <div class="cStats">${right}</div>
  `;
  return c;
}

/* ------------------ Boards / Aetherflow ------------------ */
function renderSlots(container, slots, fallbackTitle = 'Empty') {
  if (!container) return;
  container.innerHTML = '';

  const list = Array.isArray(slots) && slots.length ? slots : [null, null, null];
  list.forEach((s, i) => {
    const wrap = el('div', 'boardSlot');       // <- droppable wrapper
    wrap.dataset.slotIndex = String(i);

    if (!s) {
      // empty placeholder
      wrap.appendChild(cardEl({ title: fallbackTitle, subtype: '—' }));
    } else {
      wrap.appendChild(cardEl({
        title: s.name || s.title || 'Card',
        subtype: s.type || s.subtype || 'Spell'
      }));
    }
    container.appendChild(wrap);
  });
}


function renderFlow(container, state) {
  if (!container) return;
  container.innerHTML = '';
  const row = Array.isArray(state?.flowRow) ? state.flowRow : [null, null, null, null, null];
  row.forEach((slot, i) => {
    if (!slot) container.appendChild(cardEl({ title: 'Empty', subtype: '—' }));
    else container.appendChild(cardEl({ title: slot.name || 'Aether', subtype: 'Instant', right: String(i + 1) }));
  });
}

/* ------------------ Hand layout (centering + arc) ------------------ */
function layoutHand(ribbonEl) {
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;

  // Center to the same column as the rest of the app; fall back to viewport
  const anchor = document.querySelector('main.grid') || document.body;
  const anchorRect = anchor.getBoundingClientRect();

  // The fan is absolutely positioned inside the ribbon itself
  const ribbonRect = ribbonEl.getBoundingClientRect();

  // Card & spread math
  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = Math.max(1, fan.children.length);
  const preferred = 120;                                        // nice desktop spacing
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;

  // center fan in ribbon coordinates:
  // (ribbonRect.left + fanLeft + stripW/2) === (anchorRect.left + anchorRect.width/2)
  const fanLeft = Math.round((anchorRect.left + anchorRect.width / 2) - (ribbonRect.left + stripW / 2));
  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;

  // Arc + tilt + fade-in
  const centerIdx = (n - 1) / 2;
  fan.querySelectorAll('.cardWrap').forEach(w => (w.style.opacity = '0'));
  requestAnimationFrame(() => {
    fan.querySelectorAll('.cardWrap').forEach((wrap, idx) => {
      const x    = Math.round(idx * spread);
      const tilt = (idx - centerIdx) * 10;           // -… +…
      const arcY = -2 * Math.abs(idx - centerIdx);   // subtle arc

      wrap.style.left = `${x}px`;
      wrap.style.setProperty('--wrot', `${tilt}deg`);
      wrap.style.setProperty('--wy', `${arcY}px`);
      wrap.style.zIndex = String(100 + idx);
      wrap.style.transitionDelay = `${idx * 24}ms`;
      wrap.style.opacity = '1';
    });
  });
}

/* ------------------ Mobile press-to-peek ------------------ */
function attachMobilePeekHandlers(wrap) {
  let pressed = false, timer = null;
  const add = () => { wrap.classList.add('is-peek'); };
  const clear = () => { wrap.classList.remove('is-peek'); pressed = false; };

  wrap.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    pressed = true;
    timer = setTimeout(() => pressed && add(), 70);
  }, { passive: true });

  wrap.addEventListener('touchend', () => { clearTimeout(timer); clear(); }, { passive: true });
  wrap.addEventListener('touchcancel', () => { clearTimeout(timer); clear(); }, { passive: true });

  // tap anywhere else to drop preview
  document.addEventListener('touchstart', (ev) => {
    if (!wrap.contains(ev.target)) clear();
  }, { passive: true });
}

/* ------------------ Render the hand ------------------ */
function renderHand(ribbonEl, state) {
  if (!ribbonEl) return;
  ribbonEl.innerHTML = '';                         // reset shell
  const fan = el('div', 'fan');                    // strip we position
  ribbonEl.appendChild(fan);

  const hand = Array.isArray(state?.hand) ? state.hand : [];

  if (hand.length === 0) {
    const w = el('div', 'cardWrap');
    w.appendChild(cardEl({ title: '—', classes: 'is-phantom' }));
    fan.appendChild(w);
    layoutHand(ribbonEl);
    return;
  }

  hand.forEach((c, handIndex) => {
  const w = el('div', 'cardWrap');
  const isInstant = (c.type || c.subtype) === 'Instant';
  const node = cardEl({
    title: c.name || c.title || 'Card',
    subtype: c.type || c.subtype || 'Spell',
    classes: isInstant ? 'is-instant' : '',
  });
  w.appendChild(node);
  fan.appendChild(w);

  // enable drag & drop for this card
  enableDnDForCard(w, handIndex);
});

  layoutHand(ribbonEl);
}

/* ---------- Public renderer ---------- */
export function renderGame(state) {
  const setTxt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };

  // HUD (existing)
  setTxt('#hud-you-hp', state?.hp ?? 0);
  setTxt('#hud-you-ae', state?.ae ?? 0);
  setTxt('#hud-ai-hp', state?.ai?.hp ?? 0);
  setTxt('#hud-ai-ae', state?.ai?.ae ?? 0);

  // NEW: dock counters
  setTxt('#count-deck', state?.deck?.length ?? 0);
  setTxt('#count-discard', state?.disc?.length ?? 0);
  setTxt('#count-ae', state?.ae ?? 0);
  
  // Boards
  renderSlots($('#aiBoard'), state?.ai?.slots, 'Empty');
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots, 'Empty');

  // Hand
  renderHand($('#ribbon'), state);

  // --- Dock counts ---
  const deckCount    = Array.isArray(state?.deck) ? state.deck.length : 0;
  const discardCount = Array.isArray(state?.disc) ? state.disc.length : 0;   // your repo uses "disc"
  const aether       = state?.ae ?? 0;

  setTxt('#count-deck', deckCount);
  setTxt('#count-discard', discardCount);
  setTxt('#count-ae', aether);
}

export function init(game) {
    _gameRef = game;                    // <-- add this
  window.renderGame = renderGame;

  // Buttons
  $('#btnDraw')?.addEventListener('click', () => game.dispatch({ type: 'DRAW', amount: 1 }));
  $('#btnEnd') ?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' })); // NEW

  renderGame(game.state);
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}

function enableMouseDnDOnCard(wrap, handIndex){
  // HTML5 Drag & Drop (mouse/desktop)
  wrap.draggable = true;

  wrap.addEventListener('dragstart', (e) => {
    wrap.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(handIndex));
    e.dataTransfer.effectAllowed = 'move';
    // light up slots
    markSlots('target');
  });

  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    markSlots('');
  });

  // Allow drop over the board container
  const board = getBoardSlotsEl();
  if (board && !board._dragListenersAdded){
    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      const i = slotIndexFromPoint(e.clientX, e.clientY);
      markSlots(i >= 0 ? 'accept' : 'target');
    });
    board.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData('text/plain'));
      const tgt = slotIndexFromPoint(e.clientX, e.clientY);
      markSlots('');
      if (tgt >= 0 && Number.isFinite(src)){
        _gameRef?.dispatch?.({ type:'PLAY_FROM_HAND', handIndex: src, slot: tgt });
      }
    });
    board._dragListenersAdded = true;
  }
}

function enableTouchDnDOnCard(wrap, handIndex){
  // Pointer/touch fallback (mobile)
  let dragging = false;
  const badge = document.querySelector('.dragBadge') || document.body.appendChild(el('div','dragBadge'));

  const onMove = (x,y) => {
    badge.style.transform = `translate(${x+12}px, ${y+12}px)`;
    const idx = slotIndexFromPoint(x,y);
    markSlots(idx >= 0 ? 'accept' : 'target');
  };

  const onUp = (x,y) => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    badge.style.transform = 'translate(-9999px,-9999px)';
    const tgt = slotIndexFromPoint(x,y);
    markSlots('');
    if (tgt >= 0) {
      _gameRef?.dispatch?.({ type:'PLAY_FROM_HAND', handIndex, slot: tgt });
    }
  };

  wrap.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    dragging = true;
    wrap.classList.add('dragging');
    badge.textContent = 'Drag to a slot';
    const t = ev.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  wrap.addEventListener('touchmove', (ev) => {
    if (!dragging) return;
    const t = ev.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  wrap.addEventListener('touchend', (ev) => {
    const t = ev.changedTouches[0];
    onUp(t.clientX, t.clientY);
  }, { passive: true });

  wrap.addEventListener('touchcancel', () => {
    dragging = false;
    wrap.classList.remove('dragging');
    badge.style.transform = 'translate(-9999px,-9999px)';
    markSlots('');
  }, { passive: true });
}

function enableDnDForCard(wrap, handIndex){
  enableMouseDnDOnCard(wrap, handIndex);
  enableTouchDnDOnCard(wrap, handIndex);
}


