// /src/ui/ui.js — Fan Strip layout (centered, smooth, Safari-safe)
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

/* ---------- Card template ---------- */
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

/* ---------- Boards / Flow ---------- */
function renderSlots(container, slots, fallbackTitle = 'Empty') {
  if (!container) return;
  container.innerHTML = '';
  const list = Array.isArray(slots) && slots.length ? slots : [null, null, null];
  for (const s of list) {
    if (!s) container.appendChild(cardEl({ title: fallbackTitle, subtype: '—' }));
    else container.appendChild(cardEl({ title: s.name || s.title || 'Card', subtype: s.type || s.subtype || 'Spell' }));
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

/* ---------- Hand math ---------- */
function spreadAndTilt(stripWidth, cardW, n) {
  if (n <= 1) return { spread: 0, rot: 0, stripW: cardW };

  // preferred desktop spread; clamp to keep edges on-screen
  const preferred = 120;
  const maxSpread = Math.max(58, (stripWidth - cardW) / (n - 1));
  const spread = Math.min(preferred, maxSpread);
  const rot = Math.max(6, Math.min(16, (spread / 120) * 12));
  const handPixelWidth = (n - 1) * spread + cardW;
  return { spread, rot, stripW: handPixelWidth };
}

function layoutHand(ribbonEl) {
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;
  const wraps = Array.from(fan.children);
  if (!wraps.length) return;

  // Measure available width of the ribbon *container*
  const ribbonRect = ribbonEl.getBoundingClientRect();
  const ribbonWidth = ribbonRect.width;

  // Card width from CSS variables on the ribbon
  const cs = getComputedStyle(ribbonEl);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;

  const n = wraps.length;
  // spacing that keeps edges on-screen
  const preferred = 120;
  const maxSpread = Math.max(58, (ribbonWidth - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const rot = Math.max(6, Math.min(16, (spread / 120) * 12));

  // Strip total width and explicit centering via 'left'
  const stripW = (n - 1) * spread + cardW;
  fan.style.width = `${stripW}px`;
  const stripLeft = Math.round((ribbonWidth - stripW) / 2);
  fan.style.left = `${stripLeft}px`;          // <— hard center the strip

  const centerIdx = (n - 1) / 2;

  // Prime for clean transition
  wraps.forEach(w => { w.style.opacity = '0'; });

  // Apply positions next frame so transitions fire
  requestAnimationFrame(() => {
    wraps.forEach((wrap, idx) => {
      const x    = Math.round(idx * spread);                 // left inside the strip
      const tilt = (idx - centerIdx) * rot;
      const arcY = -2 * Math.abs(idx - centerIdx);

      wrap.style.left = `${x}px`;                            // per-card X
      wrap.style.setProperty('--wrot', `${tilt}deg`);        // tilt
      wrap.style.setProperty('--wy', `${arcY}px`);           // arc lift
      wrap.style.zIndex = String(100 + idx);
      wrap.style.transitionDelay = `${idx * 24}ms`;          // small cascade
      wrap.style.opacity = '1';
    });
  });
}

/* ---------- Hand renderer ---------- */
function renderHand(ribbonEl, state) {
  if (!ribbonEl) return;
  ribbonEl.innerHTML = ''; // reset shell

  // build/append the centered fan strip
  const fan = el('div', 'fan');
  ribbonEl.appendChild(fan);

  const hand = Array.isArray(state?.hand) ? state.hand : [];

  if (hand.length === 0) {
    const w = el('div', 'cardWrap');
    const ph = cardEl({ title: '—', classes: 'is-phantom' });
    w.appendChild(ph);
    fan.appendChild(w);
    layoutHand(ribbonEl);
    return;
  }

  hand.forEach(c => {
    const w = el('div', 'cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : '',
    });
    w.appendChild(node);
    fan.appendChild(w);
  });

  layoutHand(ribbonEl);
}

/* ---------- Public renderer ---------- */
export function renderGame(state) {
  const setTxt = (id, v) => { const n = $(id); if (n) n.textContent = String(v); };
  setTxt('#hud-you-hp', state?.hp ?? 0);
  setTxt('#hud-you-ae', state?.ae ?? 0);
  setTxt('#hud-ai-hp', state?.ai?.hp ?? 0);
  setTxt('#hud-ai-ae', state?.ai?.ae ?? 0);

  renderSlots($('#aiBoard'), state?.ai?.slots, 'Empty');
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots, 'Empty');
  renderHand($('#ribbon'), state);
}

/* ---------- Init ---------- */
export function init(game) {
  window.renderGame = renderGame;

  // Buttons (if present)
  $('#btnDraw')?.addEventListener('click', () => game.dispatch({ type: 'DRAW', amount: 1 }));
  $('#btnEnd')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  $('#btnReset')?.addEventListener('click', () => game.reset());

  renderGame(game.state);

  // Engine → re-render
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  // Maintain centering on resize/rotate
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}