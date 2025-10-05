// =========================================================
// THE GREY — Bridge (for your current repo layout)
// /bridge.js  (root)
// imports from: /src/engine/index.js and /src/ui/index.js
// =========================================================

import { createGame } from './src/engine/index.js';
import * as UI from './src/ui/index.js';
import './src/ui/drag.js'; // side-effect load (no default needed)

(() => {
  const game =
    (window.game && typeof window.game.dispatch === 'function')
      ? window.game
      : createGame();

  window.game = game;     // expose for console/testing
  UI.init(game);

  console.log('[BRIDGE] Game + UI + Drag initialized.');
})();
