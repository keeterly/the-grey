// =========================================================
// THE GREY — Bridge (Corrected for your structure)
// Location: /bridge.js
// Imports from: ./src/engine/index.js, ./src/ui/index.js, ./src/ui/drag.js
// =========================================================

import { createGame } from './src/engine/index.js';
import * as UI from './src/ui/index.js';
import './src/ui/drag.js'; // side-effect only (no default export)

// ---------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------
(() => {
  try {
    const game =
      (window.game && typeof window.game.dispatch === 'function')
        ? window.game
        : createGame();

    window.game = game;
    UI.init(game);

    console.log('[BRIDGE] Game + UI + Drag initialized and exposed to window.');
  } catch (err) {
    console.error('[BRIDGE] Boot failed:', err);
  }
})();
