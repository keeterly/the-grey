// =========================================================
// THE GREY — BRIDGE LAYER
// Connects mechanics (engine) with visuals (UI)
// =========================================================

import { createGame } from './engine/index.js';
import { init as initUI } from './ui/index.js';

// ---------------------------------------------------------
// exposeToWindow — makes engine/UI globals for legacy boot
// ---------------------------------------------------------
export function exposeToWindow() {
  try {
    const game = createGame();

    if (typeof window !== 'undefined') {
      window.game = game;
      window.GameEngine = { create: createGame };
      window.UI = { init: initUI };
    }

    initUI(game);
    console.log('[BRIDGE] Game + UI initialized and exposed to window.');
    return game;
  } catch (err) {
    console.error('[BRIDGE] Failed to initialize:', err);
  }
}

// Auto-run when imported
exposeToWindow();
