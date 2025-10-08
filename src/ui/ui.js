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

/* ---------- Hand fan math (viewport-based) ---------- */
function computeFan(viewW, cardW, n) {
  if (n <= 1) return { spread: 0, rot: 0 };
  const preferred = 120; // nice desktop spacing
  const maxSpread = Math.max(58, (viewW - cardW) / (n - 1)); // keep fully on-screen
  const spread = Math.min(preferred, maxSpread);
  const rot = Math.max(6, Math.min(16, (spread / 120) * 12));
  return { spread, rot };
}

function layoutHand(container) {
  const wraps = Array.from(container.children); // .cardWraps
  if (!wraps.length) return;

  // use viewport width to truly center on phones
  const viewW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);

  // read card width from computed style on ribbon (.ribbon)
  const cs = getComputedStyle(container);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;

  const n = wraps.length;
  const { spread, rot } = computeFan(viewW, cardW, n);
  const center = (n - 1) / 2;

  wraps.forEach((wrap, idx) => {
    const card = wrap.firstElementChild; // the .card inside
    if (!card) return;
    const offset = (idx - center) * spread;
    const tilt   = (idx - center) * rot;
    const arcY   = -2 * Math.abs(idx - center);

    card.style.setProperty('--tx', `${offset}px`);
    card.style.setProperty('--ty', `${arcY}px`);
    card.style.setProperty('--rot', `${tilt}deg`);
    wrap.style.zIndex = String(100 + idx);
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

  // let the DOM paint first, then layout using viewport width
  requestAnimationFrame(() => layoutHand(container));
}

/* ---------- Public renderer ---------- */
export function renderGame(state) {
  // HUD ids are optional; ignore if not present
  $('#hud-you-hp')?.replaceChildren(document.createTextNode(String(state?.hp ?? 0)));
  $('#hud-you-ae')?.replaceChildren(document.createTextNode(String(state?.ae ?? 0)));
  $('#hud-ai-hp')?.replaceChildren(document.createTextNode(String(state?.ai?.hp ?? 0)));
  $('#hud-ai-ae')?.replaceChildren(document.createTextNode(String(state?.ai?.ae ?? 0)));

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
  document.addEventListener('game:state', (ev) => {
    renderGame(ev.detail?.state ?? game.state);
  });

  // Keep fan centered on rotate/resize
  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}