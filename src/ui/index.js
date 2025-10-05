// =========================================================
// THE GREY — ENGINE CORE
// ---------------------------------------------------------
// This module initializes the game mechanics layer.
// It defines and exports createGame(), and exposes a
// minimal global adapter for legacy boot/debug support.
// =========================================================

// Import core mechanics modules
import * as State from './state.js';
import * as Rules from './rules.js';
import * as AI from './ai.js';
import * as Cards from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG from './rng.js';

// ---------------------------------------------------------
// createGame() — main factory for a new game instance
// ---------------------------------------------------------
export function createGame() {
  // initialize internal state
  const gameState = State.createState ? State.createState() : {
    turn: 0,
    phase: 'START',
    playerHP: 20,
    aiHP: 20,
    playerAE: 0,
    aiAE: 0,
  };

  // local helper for dispatching actions through rules
  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[GAME] Invalid action dispatched', action);
      return;
    }
    try {
      // Example of rule resolution
      if (Rules.handleAction) {
        Rules.handleAction(gameState, action);
      } else {
        console.log('[GAME] Dispatch:', action);
      }
    } catch (err) {
      console.error('[GAME] Error in dispatch:', err);
    }
  }

  // optional AI hook
  function aiTurn() {
    if (AI.takeTurn) AI.takeTurn(gameState);
  }

  // public API for this game instance
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

  // instantiate a default game so boot-debug can see it
  window.game = window.game || createGame();

  console.log('[ENGINE] GameEngine and game globals registered.');
}
