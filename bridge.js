// bridge.js (root)
// Wires Engine -> UI. No engine imports inside UI modules.

import { createGame } from './src/engine/index.js';
import * as UI from './src/ui/index.js';

export function exposeToWindow() {
  // create or reuse game
  const game = window.game || createGame();
  window.game = game;

  // init animated UI
  UI.init(game);

  // expose anim helpers lazily if something else wants them
  window.animateDiscardHand = async (...args) => {
    const m = await import('./src/ui/animations.js');
    return m.animateDiscardHand(...args);
  };
  window.animateDrawHand = async (...args) => {
    const m = await import('./src/ui/animations.js');
    return m.animateDrawHand(...args);
  };
}

// auto-boot once
if (!window.__greyBooted) {
  window.__greyBooted = true;
  exposeToWindow();
}
