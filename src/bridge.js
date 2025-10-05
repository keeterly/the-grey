// =========================================================
// THE GREY — Bridge (v3)
// Wires Engine + UI, and loads Drag for its side-effects.
// =========================================================

import { createGame } from '../engine/index.js';
import * as UI from './index.js';
import './drag.js'; // load; no default import expected

(() => {
  const game =
    (window.game && typeof window.game.dispatch === 'function')
      ? window.game
      : createGame();

  window.game = game;            // expose for console/testing
  UI.init(game);

  console.log('[BRIDGE] Game + UI + Drag initialized and exposed to window.');
})();
