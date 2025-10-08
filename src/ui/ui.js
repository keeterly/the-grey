// /src/ui/ui.js
// Minimal UI layer: provides UI.init(game) + renderGame(state)

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Render the whole app from state (safe no-ops if elements missing)
export function renderGame(state) {
  // Top HUD example
  const hp = $('#hud-you-hp');  if (hp)  hp.textContent = String(state?.hp ?? 0);
  const ae = $('#hud-you-ae');  if (ae)  ae.textContent = String(state?.ae ?? 0);

  const aiHp = $('#hud-ai-hp'); if (aiHp) aiHp.textContent = String(state?.ai?.hp ?? 0);
  const aiAe = $('#hud-ai-ae'); if (aiAe) aiAe.textContent = String(state?.ai?.ae ?? 0);

  // Aetherflow dots (example only; customize to your DOM)
  const flow = state?.flowRow ?? [];
  $all('[data-flow-slot]').forEach((el, i) => {
    const has = flow[i] != null;
    el.classList.toggle('is-empty', !has);
  });

  // TODO: board + hand rendering (hook your real card templating here)
  // This stub intentionally does nothing destructive.
}

// Called once by bridge with the live game instance { state, dispatch, ... }
export function init(game) {
  // expose renderer so engine/dispatcher can call it
  window.renderGame = renderGame;

  // first paint
  renderGame(game.state);

  // example: wire an "End Turn" button if present
  const endBtn = document.querySelector('#endTurn, [data-action="endTurn"]');
  if (endBtn) endBtn.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));

  // listen for state broadcasts from the engine (if you fire them)
  document.addEventListener('game:state', (ev) => {
    renderGame(ev.detail?.state ?? game.state);
  });
}
