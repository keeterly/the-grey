// =========================================================
// THE GREY — ENGINE ENTRY (factory + boot sequence)
// - Uses your real initialState() + Rules.reduce()
// - Compatible with reducers that return a NEW state object
// - Boots the game: ENSURE_MARKET then START_TURN {first:true}
// - Exposes reset() and window.GameEngine.create for the UI/bridge
// =========================================================

import * as Rules   from './rules.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';
import { initialState } from './state.js';

// Pick sensible defaults that exist in your WEAVERS table:
const DEFAULT_PLAYER_WEAVER = Weavers.defaultPlayer || 'Stormbinder';
const DEFAULT_AI_WEAVER     = Weavers.defaultAI     || 'Stormbinder';

// Replace state object in-place when reducer returns a new one
function mergeStateInPlace(cur, next) {
  for (const k of Object.keys(cur)) if (!(k in next)) delete cur[k];
  for (const k of Object.keys(next)) cur[k] = next[k];
}

export function createGame(opts = {}) {
  const playerWeaver = opts.playerWeaver || DEFAULT_PLAYER_WEAVER;
  const aiWeaver     = opts.aiWeaver     || DEFAULT_AI_WEAVER;

  let S;

  // Safe reducer wrapper that supports "return new state" style reducers
  function reduceSafe(state, action) {
    const out = Rules.reduce(state, action);
    if (out && out !== state && typeof out === 'object') {
      mergeStateInPlace(state, out);
    }
    return state;
  }

  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[ENGINE] Invalid action:', action);
      return S;
    }
    try {
      return reduceSafe(S, action);
    } catch (err) {
      console.error('[ENGINE] dispatch error:', err, action);
      return S;
    }
  }

  function bootFreshState() {
    try {
      S = initialState({ playerWeaver, aiWeaver });
    } catch (err) {
      console.warn('[ENGINE] initialState failed; creating minimal fallback.', err);
      S = {
        hp:5, ae:0, deck:[], hand:[], disc:[], slots:[null,null,null], glyphs:[],
        ai:{ hp:5, ae:0, deck:[], hand:[], disc:[], slots:[null,null,null], glyphs:[] },
        flowDeck:[], flowRow:[null,null,null,null,null], turn:1,
        trance:{ you:{cur:0,cap:6,weaver:playerWeaver}, ai:{cur:0,cap:6,weaver:aiWeaver} },
        _log:[]
      };
    }

    // Optional INIT for logs/metrics
    dispatch({ type: 'INIT' });

    // Make sure Aetherflow is filled
    dispatch({ type: 'ENSURE_MARKET' });

    // Start player turn (your rules typically draw opening hand here)
    dispatch({ type: 'START_TURN', first: true });

    return S;
  }

  // Initial boot
  bootFreshState();

  // Public API expected by bridge/UI
  const game = {
    get state() { return S; },
    dispatch,
    reset() { bootFreshState(); },
    cards: Cards,
    weavers: Weavers,
    rng: RNG,
  };

  return game;
}

// Global exposure for bridge/index.html
if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = (opts) => createGame(opts);
  if (!window.game) window.game = createGame();
  console.log('[ENGINE] GameEngine.create ready; window.game initialized.');
}


import { reduce, initialState } from './rules.js';

let currentState = initialState;

function dispatch(action) {
  try {
    currentState = reduce(currentState, action);
    // re-render with currentState...
  } catch (err) {
    console.error('[ENGINE] dispatch error:', err, action, { hasState: !!currentState });
  }
}

