// =========================================================
// THE GREY — ENGINE CORE (mechanics layer)
// Uses your real initialState() and reduce().
// =========================================================

import * as Rules   from './rules.js';          // reduce(), helpers
import * as AI      from './ai.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';
import { initialState } from './state.js';

// safe defaults if weaver ids aren’t provided
function defaultWeavers() {
  return {
    playerWeaver: Weavers.defaultPlayer || 'Default',
    aiWeaver: Weavers.defaultAI || 'AI'
  };
}

// fallback minimal state so the app never dies on boot
function makeFallbackState() {
  const { playerWeaver, aiWeaver } = defaultWeavers();
  return {
    hp: 5, ae: 0, deck: [], hand: [], disc: [], slots: [null,null,null], glyphs: [],
    ai: { hp: 5, ae: 0, deck: [], hand: [], disc: [], slots: [null,null,null], glyphs: [] },
    flowDeck: [], flowRow: [null,null,null,null,null],
    turn: 1,
    trance: {
      you: { cur: 0, cap: 6, weaver: playerWeaver },
      ai:  { cur: 0, cap: 6, weaver: aiWeaver }
    },
    freeAdvYou: 0, freeAdvAi: 0,
    youFrozen: 0, aiFrozen: 0,
    _log: []
  };
}

export function createGame() {
  // 1) Build state using your initializer; fall back if it throws
  let S;
  try {
    const w = defaultWeavers();
    S = initialState(w);
  } catch (err) {
    console.warn('[ENGINE] initialState failed, using fallback:', err);
    S = makeFallbackState();
  }

  // 2) Single dispatch that runs your reducer in-place
  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[ENGINE] Invalid action:', action);
      return;
    }
    try {
      // Your reducer returns S (same reference) after mutation; we keep S as the canonical object.
      Rules.reduce(S, action);
      // Optional AI hook after certain actions
      if (action.type === 'END_TURN' && typeof AI.takeTurn === 'function') {
        // Split AI into the discrete actions your reducer understands
        Rules.reduce(S, { type: 'AI_DRAW' });
        Rules.reduce(S, { type: 'AI_PLAY_SPELL' });
        Rules.reduce(S, { type: 'AI_CHANNEL' });
        Rules.reduce(S, { type: 'AI_ADVANCE' });
        Rules.reduce(S, { type: 'AI_BUY', index: 0 }); // simple buy attempt
        Rules.reduce(S, { type: 'AI_SPEND_TRANCE' });
      }
    } catch (e) {
      console.error('[ENGINE] dispatch error:', e, action);
    }
  }

  return {
    state: S,
    dispatch,
    // exposed for debugging/FX if you want them elsewhere
    cards: Cards,
    weavers: Weavers,
    rng: RNG
  };
}

// Legacy globals so boot/debug stays happy
if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = createGame;
  if (!window.game || typeof window.game.dispatch !== 'function') {
    window.game = createGame();
  }
  console.log('[ENGINE] GameEngine.create and window.game are ready');
}
