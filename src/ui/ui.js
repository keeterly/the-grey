// /src/ui/ui.js — Fan strip layout (centered, smooth, Safari-safe)

/* ------------------ tiny DOM helpers ------------------ */
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

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
  for (const s of list) {
    if (!s) {
      container.appendChild(cardEl({ title: fallbackTitle, subtype: '—' }));
    } else {
      container.appendChild(
        cardEl({ title: s.name || s.title || 'Card', subtype: s.type || s.subtype || 'Spell' })
      );
    }
  }
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

  hand.forEach(c => {
    const w = el('div', 'cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    w.appendChild(cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : ''
    }));
    fan.appendChild(w);
    attachMobilePeekHandlers(w);
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

