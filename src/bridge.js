// =========================================================
// THE GREY — BRIDGE LAYER (ESM → window + UI init)
// =========================================================

import { createGame } from './engine/index.js';
import { init as initUI } from './ui/index.js';
import * as Drag from './ui/drag.js';

export function exposeToWindow() {
  const game = createGame();

  // Expose Drag for the boot checker
  const dragAPI = Drag.DragCards || Drag.default || null;
  if (typeof window !== 'undefined') {
    window.game = game;
    window.GameEngine = { create: createGame };
    window.UI = { init: initUI };
    if (dragAPI) window.DragCards = dragAPI;
  }

  // Initialize UI
  try {
    initUI(game);
    console.log('[BRIDGE] Game + UI initialized and exposed to window.');
  } catch (err) {
    console.error('[BRIDGE] initUI failed:', err);
  }

  return game;
}

// Auto-run
exposeToWindow();
