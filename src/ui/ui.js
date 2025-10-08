// /src/ui/ui.js — UI layer for The Grey
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

/* ---------- Hand fan math ---------- */
function computeFan(containerWidth, cardWidth, n) {
  if (n <= 1) return { spread: 0, rot: 0 };
  // spacing that keeps edges on-screen: center*spread + cardW/2 <= width/2
  const maxSpread = Math.max(58, (containerWidth - cardWidth) / (n - 1));
  const preferred = 120;                  // looks great on desktop
  const spread = Math.min(preferred, maxSpread);
  const rot = Math.max(6, Math.min(16, (spread / 120) * 12)); // proportional tilt
  return { spread, rot };
}

function layoutHand(ribbonEl) {
  const wraps = Array.from(ribbonEl.children); // .cardWrap nodes
  if (!wraps.length) return;

  // measure the actual inner width of ribbon (accounts for safe-area padding already applied on wrapper)
  const width = ribbonEl.getBoundingClientRect().width;
  const cs = getComputedStyle(ribbonEl);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;

  const n = wraps.length;
  const { spread, rot } = computeFan(width, cardW, n);
  const center = (n - 1) / 2;

  // first ensure all wrappers start invisible for a clean fade+slide
  wraps.forEach(w => { w.style.opacity = '0'; });

  // next frame: apply positions & fade in so transitions fire
  requestAnimationFrame(() => {
    wraps.forEach((wrap, idx) => {
      const offset = (idx - center) * spread;
      const tilt   = (idx - center) * rot;
      const arcY   = -2 * Math.abs(idx - center);

      wrap.style.setProperty('--wx', `${offset}px`);
      wrap.style.setProperty('--wy', `${arcY}px`);
      wrap.style.setProperty('--wrot', `${tilt}deg`);
      wrap.style.zIndex = String(100 + idx);

      // stagger the opacity a touch for a pleasant cascade
      wrap.style.transitionDelay = `${idx * 25}ms`;
      wrap.style.opacity = '1';
    });
  });
}

/* ---------- Hand renderer (wrapper + inner card) ---------- */
function renderHand(container, state) {
  if (!container) return;
  container.innerHTML = '';

  const hand = Array.isArray(state?.hand) ? state.hand : [];
  container.style.setProperty('--n', String(Math.max(hand.length, 1)));

  if (hand.length === 0) {
    const wrap = el('div', 'cardWrap');
    const phantom = cardEl({ title: '—', classes: 'is-phantom' });
    wrap.appendChild(phantom);
    container.appendChild(wrap);
    layoutHand(container);
    return;
  }

  hand.forEach((c) => {
    const wrap = el('div', 'cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : '',
    });
    wrap.appendChild(node);
    container.appendChild(wrap);
  });

  layoutHand(container);
}

/* ---------- Public renderer ---------- */
export function renderGame(state) {
  // HUD text if present
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

  // Keep fan centered on rotate/resize
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}