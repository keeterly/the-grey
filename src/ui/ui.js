// /src/ui/ui.js — centered fan, drag.js-compatible

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
/** Render 3 fixed player/AI slots. IMPORTANT:
 *  - Use .slotCell and data-slot-index for drag.js targeting.
 */
function renderSlots(container, slots, fallbackTitle = 'Empty') {
  if (!container) return;
  container.innerHTML = '';

  const list = Array.isArray(slots) && slots.length ? slots : [null, null, null];

  list.forEach((s, i) => {
    const cell = el('div', 'slotCell');           // <- drag.js expects this
    cell.dataset.slotIndex = String(i);

    const wrap = el('div', 'slotInner');
    if (!s) {
      wrap.appendChild(cardEl({ title: fallbackTitle, subtype: '—' }));
    } else {
      wrap.appendChild(cardEl({
        title: s.name || s.title || 'Card',
        subtype: s.type || s.subtype || 'Spell'
      }));
    }
    cell.appendChild(wrap);
    container.appendChild(cell);
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
  const ribbonRect = ribbonEl.getBoundingClientRect();

  // Card & spread math
  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = Math.max(1, fan.children.length);
  const preferred = 120; // nice desktop spacing
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
    // Outer positioned wrapper (for arc/tilt)
    const w = el('div', 'cardWrap');

    // Actual draggable card element — drag.js will look for .handCard
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: (c.type || c.subtype) === 'Instant' ? 'is-instant handCard' : 'handCard',
    });
    node.dataset.handIndex = String(handIndex);

    w.appendChild(node);
    fan.appendChild(w);

    // nicer mobile peek (doesn't interfere with drag.js)
    attachMobilePeekHandlers(w);
  });

  layoutHand(ribbonEl);
}

/* ------------------ Public renderer ------------------ */
export function renderGame(state) {
  const setTxt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };

  // HUD
  setTxt('#hud-you-hp', state?.hp ?? 0);
  setTxt('#hud-you-ae', state?.ae ?? 0);
  setTxt('#hud-ai-hp', state?.ai?.hp ?? 0);
  setTxt('#hud-ai-ae', state?.ai?.ae ?? 0);

  // Boards
  renderSlots($('#aiBoard'),   state?.ai?.slots, 'Empty');
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots,    'Empty');

  // Hand
  renderHand($('#ribbon'), state);

  // Dock counters
  setTxt('#count-deck',    Array.isArray(state?.deck) ? state.deck.length : 0);
  setTxt('#count-discard', Array.isArray(state?.disc) ? state.disc.length : 0);
  setTxt('#count-ae',      state?.ae ?? 0);
}

/* ------------------ Init & drag.js bridge ------------------ */
export function init(game) {
  window.renderGame = renderGame;

  // Buttons
  $('#btnDraw') ?.addEventListener('click', () => game.dispatch({ type: 'DRAW', amount: 1 }));
  $('#btnEnd')  ?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));

  renderGame(game.state);
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  // Maintain centering on resize/rotate
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  // ---- drag.js integration
  // drag.js will call `click()` on the .handCard when the pointer is released
  // over a valid slot (the slot gets class .drop-hover / .drop-accept).
  // We catch that click here and dispatch the engine action.
  document.addEventListener('click', (ev) => {
    const card = ev.target.closest('.handCard');
    if (!card) return;

    const handIndex = Number(card.dataset.handIndex);
    if (!Number.isFinite(handIndex)) return;

    // Prefer the hovered slot, fallback to any "accept" slot
    const hovered = document.querySelector('.slotCell.drop-hover');
    const accept  = document.querySelector('.slotCell.drop-accept');
    const target  = hovered || accept;
    if (!target) return;

    const slot = Number(target.dataset.slotIndex);
    if (!Number.isFinite(slot)) return;

    game.dispatch({ type: 'PLAY_FROM_HAND', handIndex, slot });
  });
}
