// /src/engine/index.js — app boot + dispatcher (pure-state friendly)

import { reduce } from './rules.js';   // <- same directory
import { initialState } from './state.js';

// --- App state ---
let currentState = initialState;

// --- Utilities ---
const $ = (sel, root = document) => root.querySelector(sel);

// Fire a DOM event so other scripts (bridge/drag/ui) can react after each update.
function emitStateChange(state, action) {
  try {
    document.dispatchEvent(
      new CustomEvent('game:state', { detail: { state, action } })
    );
  } catch {
    // ignore
  }
}

// Centralized render shim.
// Your UI sets window.renderGame = (state) => { ... } in /src/ui/ui.js.
function render(state) {
  if (typeof window.renderGame === 'function') {
    window.renderGame(state);
  } else if (typeof window.render === 'function') {
    window.render(state);   // legacy fallback
  }
}

// --- Dispatch ---
function dispatch(action) {
  try {
    const a = action && typeof action === 'object' ? action : { type: String(action) };
    currentState = reduce(currentState, a);
    render(currentState);
    emitStateChange(currentState, a);
  } catch (err) {
    console.error('[ENGINE] dispatch error:', err, action, { hasState: !!currentState });
  }
}

// --- Wiring / Controls (safe: only if present in DOM) ---
function wireControls() {
  const endTurnBtn = $('#endTurn, [data-action="endTurn"]');
  if (endTurnBtn) endTurnBtn.addEventListener('click', () => dispatch({ type: 'END_TURN' }));

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-dispatch]');
    if (!el) return;
    try {
      const payload = JSON.parse(el.getAttribute('data-dispatch'));
      if (payload && payload.type) dispatch(payload);
    } catch { /* ignore */ }
  });
}

// --- Boot ---
function boot() {
  wireControls();
  render(currentState);
  emitStateChange(currentState, { type: '@@INIT' });

  // expose for UI/console
  window.dispatch = dispatch;
  window.getState = () => currentState;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// (optional) export if anything else imports from here
export { dispatch };
