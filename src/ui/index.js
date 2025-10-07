// index.js — app boot + dispatcher (pure-state friendly)
//
// IMPORTANT:
// - Do NOT redeclare `initialState` here. We import it from rules.js.
// - Keep render logic elsewhere; we invoke it via window.renderGame(state) if present,
//   or fall back to a no-op to avoid crashes during early boot.
//
// If you need to debug: open DevTools and use window.getState() / window.dispatch({type:'...'}).

import { reduce, initialState } from '../engine/rules.js';

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
  } catch (e) {
    // CustomEvent may fail on very old browsers; ignore silently.
  }
}

// Centralized render shim.
// Prefer defining window.renderGame = (state) => { ... } in your UI code.
function render(state) {
  if (typeof window.renderGame === 'function') {
    window.renderGame(state);
  } else if (typeof window.render === 'function') {
    // fallback if your UI used window.render before
    window.render(state);
  } else {
    // no-op; nothing to draw yet
  }
}

// --- Dispatch ---
function dispatch(action) {
  try {
    // Ensure a plain object action
    const a = action && typeof action === 'object' ? action : { type: String(action) };

    // Reduce
    currentState = reduce(currentState, a);

    // Render + notify
    render(currentState);
    emitStateChange(currentState, a);
  } catch (err) {
    console.error('[ENGINE] dispatch error:', err, action, { hasState: !!currentState });
  }
}

// --- Wiring / Controls (safe: only if present in DOM) ---
function wireControls() {
  // Example buttons; keep if your HTML uses these IDs or data-actions.
  const endTurnBtn = $('#endTurn, [data-action="endTurn"]');
  if (endTurnBtn) endTurnBtn.addEventListener('click', () => dispatch({ type: 'END_TURN' }));

  // Delegate clicks for any element with data-dispatch='{"type":"..."}'
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-dispatch]');
    if (!el) return;
    try {
      const payload = JSON.parse(el.getAttribute('data-dispatch'));
      if (payload && payload.type) dispatch(payload);
    } catch (_) {
      // ignore malformed payloads
    }
  });
}

// --- Boot ---
function boot() {
  wireControls();

  // First paint
  render(currentState);
  emitStateChange(currentState, { type: '@@INIT' });

  // Expose for debugging
  window.dispatch = dispatch;
  window.getState = () => currentState;

  // Optional: log version banner from a <meta name="build"> tag if present
  const build = $('meta[name="build"]')?.getAttribute('content');
  if (build) console.log('[THE GREY] build:', build);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
