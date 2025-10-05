// =========================================================
// THE GREY — BRIDGE LAYER
// Connects engine + UI, exposes globals, autostarts, and
// initializes DragCards once (then UI refresh handles rebinds).
// =========================================================

import { createGame } from './engine/index.js';
import { init as initUI } from './ui/index.js';
import DragCards from './ui/drag.js';

export function exposeToWindow() {
  // Create engine
  const game = createGame();

  // Expose globals (boot/debug + console)
  if (typeof window !== 'undefined') {
    window.game = game;
    window.GameEngine = { create: createGame };
    window.UI = { init: initUI };
    window.DragCards = DragCards;
  }

  // Initialize UI
  initUI(game);

  // Initialize drag once; UI will call refresh() after each render
  try { DragCards.init(game); } catch (e) { console.warn('[BRIDGE] Drag init failed:', e); }

  // Autostart so market + hand aren’t empty
  try {
    game.dispatch({ type: 'ENSURE_MARKET' });
    game.dispatch({ type: 'START_GAME' });      // safe no-op if not implemented
    game.dispatch({ type: 'START_TURN', first:true });
  } catch (err) {
    console.error('[BRIDGE] autostart failed:', err);
  }

  console.log('[BRIDGE] Game + UI + Drag initialized and exposed to window.');
  return game;
}

// Auto-run on import
exposeToWindow();
