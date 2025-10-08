// /src/ui/ui.js
// Minimal view layer for The Grey
// - exports: init(game), renderGame(state)
// - Looks for containers by id or data-attributes, non-destructively updates DOM

function $(q, root = document) { return root.querySelector(q); }
function $all(q, root = document) { return Array.from(root.querySelectorAll(q)); }

// --- Zone lookups (we try several selectors so you don't have to rename HTML)
function getZones() {
  const aiBoard =
    $('#aiBoard') ||
    $('[data-zone="ai-board"]') ||
    $('.ai-board');

  const flow =
    $('#aetherflow') ||
    $('[data-zone="aetherflow"]') ||
    $('.aetherflow');

  const youBoard =
    $('#yourBoard') ||
    $('[data-zone="you-board"]') ||
    $('.your-board');

  return { aiBoard, flow, youBoard };
}

// --- Small card template (uses your existing .card markup semantics)
function cardHTML(title = 'Card', subtitle = '', rightBadge = '') {
  return `
    <div class="card">
      <div class="cHead">
        <div class="cName">${title}</div>
        <div class="cType">${subtitle}</div>
      </div>
      <div class="cBody"></div>
      <div class="cStats">${rightBadge}</div>
    </div>
  `;
}

function glyphHTML() {
  return `
    <div class="card glyphCard faceDown">
      <div class="cHead">
        <div class="cName">Glyph</div>
        <div class="cType">Face Down</div>
      </div>
      <div class="cBody"></div>
      <div class="cStats"></div>
    </div>
  `;
}

// Render helpers
function renderAetherflow(el, state) {
  if (!el) return;
  const row = state?.flowRow || [];
  // Fill 5 slots; show placeholder if null
  const html = row.map((slot, i) => {
    if (!slot) return cardHTML('Empty', '—');
    // basic stand-in; wire real data later
    return cardHTML('Aether Shard', 'Instant', `<span>${i + 1}</span>`);
  }).join('');
  el.innerHTML = html;
}

function renderBoard(el, slots = []) {
  if (!el) return;
  const html = (slots.length ? slots : [null, null, null]).map(s => {
    if (!s) return cardHTML('Empty', '—');
    return cardHTML(s.name || 'Card', s.type || 'Spell');
  }).join('');
  el.innerHTML = html;
}

// Public renderer – call after every state change
export function renderGame(state) {
  // HUD (optional ids in your HTML)
  const youHp = $('#hud-you-hp'); if (youHp) youHp.textContent = String(state?.hp ?? 0);
  const youAe = $('#hud-you-ae'); if (youAe) youAe.textContent = String(state?.ae ?? 0);
  const aiHp  = $('#hud-ai-hp');  if (aiHp)  aiHp.textContent  = String(state?.ai?.hp ?? 0);
  const aiAe  = $('#hud-ai-ae');  if (aiAe)  aiAe.textContent  = String(state?.ai?.ae ?? 0);

  const { aiBoard, flow, youBoard } = getZones();

  // Boards
  renderBoard(aiBoard, state?.ai?.slots);
  renderAetherflow(flow, state);
  renderBoard(youBoard, state?.slots);
}

// Called once by bridge with the live game instance
export function init(game) {
  // Expose so other modules (or your engine shim) can call it
  window.renderGame = renderGame;

  // First paint
  renderGame(game.state);

  // Re-render on engine broadcasts
  document.addEventListener('game:state', (ev) => {
    renderGame(ev.detail?.state ?? game.state);
  });

  // Example: wire End Turn if present
  const endBtn = $('#endTurn, [data-action="endTurn"]');
  if (endBtn) endBtn.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
}
