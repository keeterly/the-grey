// =========================================================
// THE GREY — ENGINE CORE (mechanics layer)
// Uses your real initialState() and reduce(), with guards.
// Handles reducers that RETURN a new state object (RESET).
// =========================================================

import * as Rules   from './rules.js';
import * as AI      from './ai.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';
import { initialState } from './state.js';

// Default weaver ids if none are specified
function defaultWeavers() {
  return {
    playerWeaver: Weavers.defaultPlayer || 'Default',
    aiWeaver:     Weavers.defaultAI     || 'AI'
  };
}

// Minimal fallback so app never crashes if init throws
function makeFallbackState() {
  const { playerWeaver, aiWeaver } = defaultWeavers();
  return {
    hp:5, ae:0, deck:[], hand:[], disc:[], slots:[null,null,null], glyphs:[],
    ai:{ hp:5, ae:0, deck:[], hand:[], disc:[], slots:[null,null,null], glyphs:[] },
    flowDeck:[], flowRow:[null,null,null,null,null], turn:1,
    trance:{ you:{ cur:0, cap:6, weaver:playerWeaver }, ai:{ cur:0, cap:6, weaver:aiWeaver } },
    freeAdvYou:0, freeAdvAi:0,
    youFrozen:0, aiFrozen:0,
    _log:[]
  };
}

// Merge "next" into "cur" in place (keeps object identity for UI bindings)
function mergeStateInPlace(cur, next) {
  // delete removed keys
  for (const k of Object.keys(cur)) {
    if (!(k in next)) delete cur[k];
  }
  // add/replace keys
  for (const k of Object.keys(next)) {
    cur[k] = next[k];
  }
}

export function createGame() {
  // 1) Build state with your initializer (guarded)
  let S;
  try {
    S = initialState(defaultWeavers());
  } catch (err) {
    console.warn('[ENGINE] initialState failed, using fallback:', err);
    S = makeFallbackState();
  }

  // 2) Single dispatch that runs your reducer; supports return-new-state
  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[ENGINE] Invalid action:', action);
      return;
    }
    try {
      const maybeNew = Rules.reduce(S, action);
      if (maybeNew && maybeNew !== S && typeof maybeNew === 'object') {
        mergeStateInPlace(S, maybeNew); // keep same ref but update contents
      }

      // Simple AI phase after END_TURN using your discrete actions
      if (action.type === 'END_TURN' && typeof AI.takeTurn === 'function') {
        Rules.reduce(S, { type: 'AI_DRAW' });
        Rules.reduce(S, { type: 'AI_PLAY_SPELL' });
        Rules.reduce(S, { type: 'AI_CHANNEL' });
        Rules.reduce(S, { type: 'AI_ADVANCE' });
        Rules.reduce(S, { type: 'AI_BUY', index: 0 });
        Rules.reduce(S, { type: 'AI_SPEND_TRANCE' });
      }
    } catch (e) {
      console.error('[ENGINE] dispatch error:', e, action);
    }
  }

  return {
    state: S,
    dispatch,
    cards:   Cards,
    weavers: Weavers,
    rng:     RNG,
  };
}

// ---------------------------------------------------------
// Legacy globals so boot/debug & tools stay happy
// ---------------------------------------------------------
if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = createGame;

  if (!window.game || typeof window.game.dispatch !== 'function') {
    window.game = createGame();
  }
  console.log('[ENGINE] GameEngine.create and window.game are ready');
}
