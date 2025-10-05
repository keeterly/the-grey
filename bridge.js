// /bridge.js (root)
import { createGame } from './src/engine/index.js';
import * as UI from './src/ui/index.js';
import './src/ui/drag.js';

(() => {
  const game =
    (window.game && typeof window.game.dispatch === 'function')
      ? window.game
      : createGame();

  window.game = game;
  UI.init(game);

  console.log('[BRIDGE] Game + UI + Drag initialized and exposed to window.');
})();
