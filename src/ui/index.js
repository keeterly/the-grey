// =========================================================
// THE GREY — ENGINE ENTRY (factory + boot sequence)
// Wires your rules/state into a ready-to-play game instance.
// - Populates Aetherflow on boot
// - Draws opening hand on player Turn 1
// - Exposes GameEngine.create() to window for bridge/UI
// =========================================================

import { initialState } from './state.js';
import * as Rules from './rules.js';
import * as Cards from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG from './rng.js';

// Optional: pick sensible defaults that exist in your WEAVERS table
const DEFAULT_PLAYER_WEAVER = 'Stormbinder';  // change if you prefer
const DEFAULT_AI_WEAVER     = 'Stormbinder';

export function createGame(opts = {}) {
  const playerWeaver = opts.playerWeaver || DEFAULT_PLAYER_WEAVER;
  const aiWeaver     = opts.aiWeaver     || DEFAULT_AI_WEAVER;

  // ---- core mutable state ----
  let S = initialState({ playerWeaver, aiWeaver });

  // ---- dispatch wrapper around your rules reducer ----
  function dispatch(action) {
    try {
      S = Rules.reduce(S, action || {});
      return S;
    } catch (err) {
      console.error('[ENGINE] dispatch error:', err, action);
      return S;
    }
  }

  // ---- helpers used by UI / reset ----
  function bootFreshState() {
    // 1) ensure the state object is brand new
    S = initialState({ playerWeaver, aiWeaver });

    // 2) optional INIT for logs/metrics
    dispatch({ type: 'INIT' });

    // 3) make sure Aetherflow has cards
    dispatch({ type: 'ENSURE_MARKET' });

    // 4) start player turn (first:true prevents +1 on turn counter in your rules)
    dispatch({ type: 'START_TURN', first: true });

    return S;
  }

  // ---- initial boot (opening hand + market) ----
  bootFreshState();

  // ---- public game object ----
  const game = {
    get state() { return S; },
    dispatch,
    rng: RNG,
    cards: Cards,
    weavers: Weavers,
    reset() { bootFreshState(); },
  };

  return game;
}

// ---- Global exposure for bridge/index.html (kept for compatibility) ----
if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = (opts) => createGame(opts);

  // Auto-create a game once if none exists (UI expects window.game)
  if (!window.game) {
    window.game = createGame();
  }
  console.log('[ENGINE] GameEngine.create ready; window.game initialized.');
}
