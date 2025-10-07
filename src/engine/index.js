// =========================================================
// THE GREY — ENGINE ENTRY (factory + boot sequence)
// - Uses your real initial state (from state.js) + reduce() from rules.js
// - Reducer can return a NEW state object (we merge in place)
// - Boot: INIT → ENSURE_MARKET → START_TURN { first: true }
// - Exposes window.GameEngine.create(...) and window.game
// =========================================================

import { reduce } from './rules.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';
import { initialState as makeInitialState } from './state.js';

// ---------- Helpers ----------
function deepClone(x) {
  if (typeof structuredClone === 'function') return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

// Replace state object in-place when reducer returns a new one
function mergeStateInPlace(cur, next) {
  for (const k of Object.keys(cur)) if (!(k in next)) delete cur[k];
  for (const k of Object.keys(next)) cur[k] = next[k];
}

// Pick sensible defaults that exist in your WEAVERS table:
const DEFAULT_PLAYER_WEAVER = Weavers.defaultPlayer || 'Stormbinder';
const DEFAULT_AI_WEAVER     = Weavers.defaultAI     || 'Stormbinder';

// ---------- Engine Factory ----------
export function createGame(opts = {}) {
  const playerWeaver = opts.playerWeaver || DEFAULT_PLAYER_WEAVER;
  const aiWeaver     = opts.aiWeaver     || DEFAULT_AI_WEAVER;

  // State container (mutated in-place for compatibility with UI/bridge)
  let S;

  // Reducer wrapper that supports pure "return new state" reducers
  function reduceSafe(state, action) {
    const out = reduce(state, action);
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
      // accept function or plain-object initial state
      S = (typeof makeInitialState === 'function')
        ? makeInitialState({ playerWeaver, aiWeaver })
        : deepClone(makeInitialState);
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

    // Ensure Aetherflow/market is filled
    dispatch({ type: 'ENSURE_MARKET' });

    // Start player turn (opening draws typically happen in the reducer)
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

// ---------- Global exposure for bridge/index.html ----------
if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = (opts) => createGame(opts);
  if (!window.game) window.game = createGame();
  console.log('[ENGINE] GameEngine.create ready; window.game initialized.');
}

/* 
NOTE:
- We intentionally removed any duplicate "mini dispatcher" at the bottom
  to avoid redeclarations and double-booting.
- Ensure your import path in HTML/other scripts points to /src/engine/index.js
  and NOT /src/ui/index.js.
*/
