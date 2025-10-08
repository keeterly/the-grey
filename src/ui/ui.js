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

// NEW: render the player's hand into the ribbon
function renderHand(container, state) {
  if (!container) return;
  container.innerHTML = '';
  const hand = Array.isArray(state?.hand) ? state.hand : [];

  if (hand.length === 0) {
    // keep ribbon height consistent
    const phantom = cardEl({ title: '—', subtype: '', classes: 'is-phantom' });
    phantom.style.visibility = 'hidden';
    container.appendChild(phantom);
    return;
  }

  hand.forEach((c) => {
    const isInstant = (c.type || c.subtype) === 'Instant';
    container.appendChild(
      cardEl({
        title: c.name || c.title || 'Card',
        subtype: c.type || c.subtype || 'Spell',
        classes: isInstant ? 'is-instant' : '',
      })
    );
  });
}

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
