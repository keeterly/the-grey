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

function layoutHand(ribbonEl){
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;

  // anchor = same centered column your boards use
  const anchor = document.querySelector('main.grid') || document.body;

  // --- measure ribbon and its padding ---
  const wrap = ribbonEl.closest('.ribbon-wrap') || ribbonEl.parentElement || ribbonEl;
  const wrapRect = wrap.getBoundingClientRect();
  const cs = getComputedStyle(wrap);
  const padL = parseFloat(cs.paddingLeft)  || 0;
  const padR = parseFloat(cs.paddingRight) || 0;

  // use the *inner content-box* left edge as reference
  const ribbonLeftInside = wrapRect.left + padL;

  // card and spread math
  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = fan.children.length;
  const preferred = 120;
  const anchorRect = anchor.getBoundingClientRect();
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;

  // center to the anchor’s center, compensating for wrap padding
  const fanLeft = Math.round(
    (anchorRect.left + anchorRect.width / 2) - (ribbonLeftInside + stripW / 2)
  );
  fan.style.left = `${fanLeft}px`;

  // animate the cards
  const centerIdx = (n - 1) / 2;
  fan.querySelectorAll('.cardWrap').forEach(w => (w.style.opacity = '0'));
  requestAnimationFrame(() => {
    fan.querySelectorAll('.cardWrap').forEach((wrap, idx) => {
      const x    = Math.round(idx * spread);
      const tilt = (idx - centerIdx) * 10;
      const arcY = -2 * Math.abs(idx - centerIdx);
      wrap.style.left = `${x}px`;
      wrap.style.setProperty('--wrot', `${tilt}deg`);
      wrap.style.setProperty('--wy', `${arcY}px`);
      wrap.style.zIndex = String(100 + idx);
      wrap.style.transitionDelay = `${idx * 24}ms`;
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
