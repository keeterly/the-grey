// /src/ui/ui.js — UI layer for The Grey (render boards, flow, and hand)
function $(q, r = document) { return r.querySelector(q); }
function $all(q, r = document) { return Array.from(r.querySelectorAll(q)); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

// --- Card template
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

// --- Board + Flow helpers
function renderSlots(container, slots, fallbackTitle = 'Empty') {
  if (!container) return;
  container.innerHTML = '';
  const list = Array.isArray(slots) && slots.length ? slots : [null, null, null];
  for (const s of list) {
    if (!s) {
      container.appendChild(cardEl({ title: fallbackTitle, subtype: '—' }));
    } else {
      container.appendChild(
        cardEl({
          title: s.name || s.title || 'Card',
          subtype: s.type || s.subtype || 'Spell',
        })
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

// --- Fan layout helpers (JS-driven so it works on Safari + desktop)
function computeFan(containerWidth, cardWidth, n) {
  if (n <= 1) return { spread: 0, rot: 0 };
  const preferred = 120;                             // nice desktop spacing
  const maxSpread = Math.max(50, (containerWidth - cardWidth) / (n - 1));
  const spread = Math.min(preferred, maxSpread);    // clamp to fit
  const rot = Math.max(6, Math.min(16, (spread / 120) * 12)); // proportional tilt
  return { spread, rot };
}

function applyFanToExisting(container) {
  const cards = Array.from(container.children);
  if (!cards.length) return;
  const cs = getComputedStyle(container);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;
  const width = container.clientWidth || window.innerWidth;
  const n = cards.length;
  const { spread, rot } = computeFan(width, cardW, n);
  const center = (n - 1) / 2;

  cards.forEach((node, idx) => {
    const offset = (idx - center) * spread;
    const tilt   = (idx - center) * rot;
    const arcY   = -2 * Math.abs(idx - center);
    node.style.setProperty('--tx', `${offset}px`);
    node.style.setProperty('--ty', `${arcY}px`);
    node.style.setProperty('--rot', `${tilt}deg`);
    node.style.zIndex = String(100 + idx);
  });
}

// --- Hand renderer (uses JS to set per-card transforms)
function renderHand(container, state) {
  if (!container) return;
  container.innerHTML = '';

  const hand = Array.isArray(state?.hand) ? state.hand : [];
  const cs = getComputedStyle(container);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;
  const width = container.clientWidth || window.innerWidth;

  const { spread, rot } = computeFan(width, cardW, hand.length || 1);
  container.style.setProperty('--n', String(Math.max(hand.length, 1)));

  if (hand.length === 0) {
    const phantom = cardEl({ title: '—', classes: 'is-phantom' });
    container.appendChild(phantom);
    return;
  }

  const center = (hand.length - 1) / 2;

  hand.forEach((c, idx) => {
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : '',
    });

    const offset = (idx - center) * spread;
    const tilt   = (idx - center) * rot;
    const arcY   = -2 * Math.abs(idx - center);

    node.style.setProperty('--tx', `${offset}px`);
    node.style.setProperty('--ty', `${arcY}px`);
    node.style.setProperty('--rot', `${tilt}deg`);
    node.style.zIndex = String(100 + idx);

    container.appendChild(node);
  });
}

// --- Public renderer for entire app
export function renderGame(state) {
  // HUD (optional ids)
  $('#hud-you-hp')?.replaceChildren(document.createTextNode(String(state?.hp ?? 0)));
  $('#hud-you-ae')?.replaceChildren(document.createTextNode(String(state?.ae ?? 0)));
  $('#hud-ai-hp')?.replaceChildren(document.createTextNode(String(state?.ai?.hp ?? 0)));
  $('#hud-ai-ae')?.replaceChildren(document.createTextNode(String(state?.ai?.ae ?? 0)));

  renderSlots($('#aiBoard'), state?.ai?.slots, 'Empty');
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots, 'Empty');
  renderHand($('#ribbon'), state);
}

// --- Init: wire buttons + first paint + resize handling
export function init(game) {
  window.renderGame = renderGame;  // expose for engine/console

  // Buttons (if present)
  $('#btnDraw')?.addEventListener('click', () => game.dispatch({ type: 'DRAW', amount: 1 }));
  $('#btnEnd')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  $('#btnReset')?.addEventListener('click', () => game.reset());

  renderGame(game.state);

  // Re-render when engine broadcasts new state
  document.addEventListener('game:state', (ev) => {
    renderGame(ev.detail?.state ?? game.state);
  });

  // Keep fan centered on rotate/resize
  const ribbon = $('#ribbon');
  window.addEventListener('resize', () => ribbon && applyFanToExisting(ribbon), { passive: true });
}