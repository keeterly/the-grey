// =========================================================
/* THE GREY — BRIDGE LAYER
   Connects mechanics (engine) with visuals (UI), exposes
   safe globals for legacy/debug, and auto-starts a turn. */
// =========================================================

import { createGame } from './engine/index.js';
import { init as initUI } from './ui/index.js';
import * as Drag from './ui/drag.js';

export function exposeToWindow() {
  // Create engine
  const game = createGame();

  // Expose globals for boot/debug + drag check
  if (typeof window !== 'undefined') {
    window.game = game;
    window.GameEngine = { create: createGame };
    window.UI = { init: initUI };
    const dragAPI = Drag.DragCards || Drag.default || null;
    if (dragAPI) window.DragCards = dragAPI;
  }

  // Initialize UI first so it can render immediately
  initUI(game);

  // Autostart so the board isn't empty
  try {
    // (Re)fill market, then begin a first turn with a fresh hand
    game.dispatch({ type: 'ENSURE_MARKET' });
    game.dispatch({ type: 'START_GAME' });      // safe no-op if not implemented
    game.dispatch({ type: 'START_TURN', first:true });
  } catch (err) {
    console.error('[BRIDGE] autostart failed:', err);
  }

  console.log('[BRIDGE] Game + UI initialized and exposed to window.');
  return game;
}

// Auto-run on import
exposeToWindow();
