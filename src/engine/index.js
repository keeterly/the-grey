// =========================================================
// THE GREY — ENGINE CORE (mechanics layer)
// =========================================================

// All imports are relative to /src/engine/
import * as Rules   from './rules.js';
import * as AI      from './ai.js';
import * as Cards   from './cards.js';
import * as Weavers from './weavers.js';
import * as RNG     from './rng.js';
import * as State   from './state.js'; // kept, but guarded

// Safe fallback so UI + boot never crash even if State.* throws
function makeFallbackState() {
  return {
    turn: 1,
    phase: 'START',
    // HUD-facing numbers
    youTrance: 0,
    aiTrance: 0,
    playerHP: 20,
    aiHP: 20,
    playerAE: 0,
    aiAE: 0,
    // Minimal structures the rest can attach to later
    deck: [], discard: [], hand: [],
    aiDeck: [], aiDiscard: [], aiHand: [],
    slots: { player: [], ai: [] },
    market: [null, null, null, null, null],
    log: [],
  };
}

// ---------------------------------------------------------
// createGame() — main factory for a new game instance
// ---------------------------------------------------------
export function createGame() {
  // Try the real state factory; if it fails, use a safe fallback
  let gameState;
  try {
    if (typeof State.createState === 'function') {
  gameState = State.createState({
    playerWeaver: Weavers.defaultPlayer || 'Default',
    aiWeaver: Weavers.defaultAI || 'AI',
    rng: RNG,
    cards: Cards
  });
} else if (typeof State.initialize === 'function') {
  gameState = State.initialize({
    playerWeaver: Weavers.defaultPlayer || 'Default',
    aiWeaver: Weavers.defaultAI || 'AI',
    rng: RNG,
    cards: Cards
  });
}

  } catch (err) {
    console.warn('[ENGINE] State factory failed. Using fallback state.', err);
  }
  if (!gameState) gameState = makeFallbackState();

  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      console.warn('[ENGINE] Invalid action:', action);
      return;
    }
    try {
      if (typeof Rules.handleAction === 'function') {
        Rules.handleAction(gameState, action);
      } else {
        // minimal default so UI remains interactive
        gameState.log.push(action);
        console.log('[ENGINE] dispatch', action);
        // very light behavior so buttons aren’t no-ops
       switch (action.type) {
  case 'RESET':
    Object.assign(gameState, makeFallbackState());
    if (typeof State.reset === 'function') State.reset(gameState);
    break;

  case 'DRAW':
    if (typeof Rules.drawCard === 'function') Rules.drawCard(gameState);
    break;

  case 'END_TURN':
    if (typeof Rules.endTurn === 'function') Rules.endTurn(gameState);
    break;

  case 'START_GAME':
    if (typeof Rules.startGame === 'function') Rules.startGame(gameState);
    break;

  case 'START_TURN':
    if (typeof Rules.startTurn === 'function') Rules.startTurn(gameState);
    break;

  default:
    if (typeof Rules.handleAction === 'function')
      Rules.handleAction(gameState, action);
}

      }
    } catch (e) {
      console.error('[ENGINE] dispatch error:', e);
    }
  }

  function aiTurn() {
    try {
      if (typeof AI.takeTurn === 'function') AI.takeTurn(gameState, { dispatch });
      else gameState.aiTrance = Math.min(6, (gameState.aiTrance || 0) + 1);
    } catch (e) {
      console.error('[ENGINE] aiTurn error:', e);
    }
  }

  return {
    state: gameState,
    dispatch,
    aiTurn,
    rng: RNG,
    cards: Cards,
    weavers: Weavers,
  };
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
