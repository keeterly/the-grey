// /src/ui/ui.js
function $(q, r = document) { return r.querySelector(q); }
function $all(q, r = document) { return Array.from(r.querySelectorAll(q)); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

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


// Helper: compute a safe spread/rotation so the fan fits the viewport
function applyHandLayout(container, n) {
  // n = number of cards
  const cs = getComputedStyle(container);
  const cardW = parseFloat(cs.getPropertyValue('--card-w')) || 180;

  // available width inside ribbon (minus a little breathing room)
  const avail = container.clientWidth - 16; // px
  let spread;

  if (n <= 1) {
    spread = 0;
  } else {
    // Max spread that keeps leftmost/rightmost visible:
    // center offset = (n-1)/2 * spread ; add half card width
    const maxSpread = (avail - cardW) / (n - 1); // px
    // Our preferred spacing:
    const pref = 120; // desktop-ish default
    // Clamp between 70 and maxSpread
    spread = Math.max(70, Math.min(pref, maxSpread));
  }

  // Rotation scales with spread (feels nice on mobile)
  const rot = Math.max(6, Math.min(16, (spread / 120) * 12));

  container.style.setProperty('--n', String(Math.max(n, 1)));
  container.style.setProperty('--spread', `${spread}px`);
  container.style.setProperty('--rot', `${rot}deg`);
}



function renderHand(container, state) {
  if (!container) return;
  container.innerHTML = '';

  const hand = Array.isArray(state?.hand) ? state.hand : [];
  applyHandLayout(container, hand.length);

  if (hand.length === 0) {
    const phantom = cardEl({ title: '—', classes: 'is-phantom' });
    phantom.style.visibility = 'hidden';
    phantom.style.setProperty('--i', '0');
    container.appendChild(phantom);
    return;
  }

  hand.forEach((c, idx) => {
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : '',
    });
    node.style.setProperty('--i', String(idx));
    container.appendChild(node);
  });
}

// Recompute layout on rotate/resize
window.addEventListener('resize', () => {
  const ribbon = document.getElementById('ribbon');
  if (!ribbon) return;
  const n = parseInt(getComputedStyle(ribbon).getPropertyValue('--n')) || 1;
  applyHandLayout(ribbon, n);
});

// PUBLIC
export function renderGame(state) {
  // HUD (optional)
  $('#hud-you-hp')?.replaceChildren(document.createTextNode(String(state?.hp ?? 0)));
  $('#hud-you-ae')?.replaceChildren(document.createTextNode(String(state?.ae ?? 0)));
  $('#hud-ai-hp')?.replaceChildren(document.createTextNode(String(state?.ai?.hp ?? 0)));
  $('#hud-ai-ae')?.replaceChildren(document.createTextNode(String(state?.ai?.ae ?? 0)));

  renderSlots($('#aiBoard'), state?.ai?.slots, 'Empty');
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots, 'Empty');
  renderHand($('#ribbon'), state);
}

export function init(game) {
  // Expose renderer so other modules can call it
  window.renderGame = renderGame;

  // Wire buttons if present
  $('#btnDraw')?.addEventListener('click', () => game.dispatch({ type: 'DRAW', amount: 1 }));
  $('#btnEnd')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  $('#btnReset')?.addEventListener('click', () => game.reset());

  // First paint
  renderGame(game.state);

  // Re-render on engine broadcasts
  document.addEventListener('game:state', (ev) => {
    renderGame(ev.detail?.state ?? game.state);
  });
}
