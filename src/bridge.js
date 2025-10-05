// =========================================================
// THE GREY — Bridge (v3.1 for GitHub Pages build)
// Wires Engine + UI, ensures drag loads for side-effects.
// =========================================================

import { createGame } from './engine/index.js';  // ✅ no /src prefix
import * as UI from './ui/index.js';             // ✅
import './ui/drag.js';                           // ✅

(() => {
  const game =
    (window.game && typeof window.game.dispatch === 'function')
      ? window.game
      : createGame();

  window.game = game;
  UI.init(game);

  console.log('[BRIDGE] Game + UI + Drag initialized and exposed to window.');
})();
