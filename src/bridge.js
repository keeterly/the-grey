// =========================================================
// THE GREY — BRIDGE LAYER (ESM → window + UI init + autostart)
// =========================================================

import { createGame } from './engine/index.js';
import { init as initUI } from './ui/index.js';
import * as Drag from './ui/drag.js';

export function exposeToWindow() {
  const game = createGame();

  // Global exposure for boot/debug + drag script check
  if (typeof window !== 'undefined') {
    window.game = game;
    window.GameEngine = { create: createGame };
    window.UI = { init: initUI };
    const dragAPI = Drag.DragCards || Drag.default || null;
    if (dragAPI) window.DragCards = dragAPI;
  }

  // Initialize UI first so it can render immediately
  initUI(game);

  // --- Autostart the game using your reducer actions ---
  try {
    // Choose weavers; you can swap these to named ones you want
    const playerWeaver = 'Default';
    const aiWeaver = 'AI';

    // Ensure market filled and get a fresh turn with a starting hand
    game.dispatch({ type: 'RESET', playerWeaver, aiWeaver });
    game.dispatch({ type: 'ENSURE_MARKET' });
    game.dispatch({ type: 'START_GAME' });         // no-op in your reducer, safe
    game.dispatch({ type: 'START_TURN', first: true });
  } catch (err) {
    console.error('[BRIDGE] autostart failed:', err);
  }

  console.log('[BRIDGE] Game + UI initialized and exposed to window.');
  return game;
}

// Auto-run when imported
exposeToWindow();
