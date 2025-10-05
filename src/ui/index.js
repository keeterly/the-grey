// =========================================================
// THE GREY — ENGINE CORE (mechanics layer)
// =========================================================

import * as State   from './state.js';
import * as Rules   from './rules.js';
import * as AI      from './ai.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';

// Internal factory to avoid name collisions
function createGameImpl() {
  // Create base state (use your real State factory if present)
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

  // Single dispatch function that routes to your Rules handler if provided
  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[GAME] Invalid action:', action);
      return;
    }
    try {
      if (typeof Rules.handleAction === 'function') {
        Rules.handleAction(gameState, action);
      } else {
        // fallback: minimal, but keeps UI/HUD alive
        gameState.log.push(action);
        console.log('[GAME] dispatch', action);
      }
    } catch (err) {
      console.error('[GAME] dispatch error:', err);
    }
  }

  // Optional AI hook
  function aiTurn() {
    if (typeof AI.takeTurn === 'function') AI.takeTurn(gameState, { dispatch });
  }

  // Public API of the mechanics layer
  return {
    state: gameState,
    dispatch,
    aiTurn,
    rng: RNG,
    cards: Cards,
    weavers: Weavers,
  };
}

// Exported factory (this is the ONLY exported createGame)
export function createGame() {
  return createGameImpl();
}

// Compatibility: expose globals for legacy boot/debug
if (typeof window !== 'undefined') {
  // Provide a stable facade the boot script can call
  window.GameEngine = window.GameEngine || {};
  window.GameEngine.create = createGame;

  // Create a default game instance if one doesn't exist
  if (!window.game || typeof window.game.dispatch !== 'function') {
    window.game = createGameImpl();
  }

  console.log('[ENGINE] GameEngine.create and window.game are ready');
}
