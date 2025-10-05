// =========================================================
// THE GREY — ENGINE CORE (mechanics layer)
// Uses your real initialState() and reduce(), with guards.
// Also supports reducers that RETURN a new state (e.g. RESET).
// After END_TURN, runs simple AI and then starts a new turn
// for the player (draw fresh hand).
// =========================================================

import * as Rules   from './rules.js';
import * as AI      from './ai.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';
import { initialState } from './state.js';

function defaultWeavers() {
  return {
    playerWeaver: Weavers.defaultPlayer || 'Default',
    aiWeaver:     Weavers.defaultAI     || 'AI'
  };
}

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

// Keep same state object identity for UI bindings
function mergeStateInPlace(cur, next) {
  for (const k of Object.keys(cur)) { if (!(k in next)) delete cur[k]; }
  for (const k of Object.keys(next)) { cur[k] = next[k]; }
}

export function createGame() {
  let S;
  try {
    S = initialState(defaultWeavers());
  } catch (err) {
    console.warn('[ENGINE] initialState failed, using fallback:', err);
    S = makeFallbackState();
  }

  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[ENGINE] Invalid action:', action); return;
    }
    try {
      const maybeNew = Rules.reduce(S, action);
      if (maybeNew && maybeNew !== S && typeof maybeNew === 'object') {
        mergeStateInPlace(S, maybeNew);
      }

      // After END_TURN: run simple AI sequence, then start player's next turn (fresh hand)
      if (action.type === 'END_TURN') {
        if (typeof AI.takeTurn === 'function') {
          Rules.reduce(S, { type: 'AI_DRAW' });
          Rules.reduce(S, { type: 'AI_PLAY_SPELL' });
          Rules.reduce(S, { type: 'AI_CHANNEL' });
          Rules.reduce(S, { type: 'AI_ADVANCE' });
          Rules.reduce(S, { type: 'AI_BUY', index: 0 });
          Rules.reduce(S, { type: 'AI_SPEND_TRANCE' });
        }
        // Player next turn: draws a fresh hand in your rules' START_TURN
        Rules.reduce(S, { type: 'START_TURN', first: false });
      }
    } catch (e) {
      console.error('[ENGINE] dispatch error:', e, action);
    }
  }

  return { state: S, dispatch, cards: Cards, weavers: Weavers, rng: RNG };
}

if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = createGame;
  if (!window.game || typeof window.game.dispatch !== 'function') window.game = createGame();
  console.log('[ENGINE] GameEngine.create and window.game are ready');
}
