// =========================================================
// THE GREY — ENGINE CORE (mechanics layer)
// =========================================================

// All imports are relative to /src/engine/
import * as State   from './state.js';
import * as Rules   from './rules.js';
import * as AI      from './ai.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';

// ---------------------------------------------------------
// createGame() — main factory for a new game instance
// ---------------------------------------------------------
export function createGame() {
  const gameState = typeof State.createState === 'function'
    ? State.createState()
    : {
        turn: 1,
        phase: 'START',
        playerHP: 20,
        aiHP: 20,
        playerAE: 0,
        aiAE: 0,
        log: [],
      };

  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[GAME] Invalid action:', action);
      return;
    }
    try {
      if (typeof Rules.handleAction === 'function') {
        Rules.handleAction(gameState, action);
      } else {
        gameState.log.push(action);
        console.log('[GAME] dispatch', action);
      }
    } catch (err) {
      console.error('[GAME] dispatch error:', err);
    }
  }

  function aiTurn() {
    if (typeof AI.takeTurn === 'function') AI.takeTurn(gameState, { dispatch });
  }

  const game = {
    state: gameState,
    dispatch,
    aiTurn,
    rng: RNG,
    cards: Cards,
    weavers: Weavers,
  };

  return game;
}

// ---------------------------------------------------------
// Global exposure for legacy boot system
// ---------------------------------------------------------
if (typeof window !== 'undefined') {
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = createGame;

  if (!window.game || typeof window.game.dispatch !== 'function') {
    window.game = createGame();
  }

  console.log('[ENGINE] GameEngine.create and window.game are ready');
}
