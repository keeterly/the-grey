// src/engine/bridge.js
// Clean bridge that loads the engine, then the UI (and drag helpers) with correct relative paths.

import './index.js';                 // engine entry (same folder as this file)
import * as UI from '../ui/ui.js';   // UI entry (one folder up, then /ui/)
import '../ui/drag.js';              // optional: side-effect import if drag.js attaches listeners

/**
 * Build the minimal "game" object the UI expects:
 *  - state getter
 *  - dispatch function
 */
function makeGame() {
  return {
    get state() { return window.getState?.(); },
    dispatch: (...args) => window.dispatch?.(...args),
  };
}

/**
 * Expose/boot the UI once the DOM is ready.
 * Works whether UI exports `init` named, or a default init function.
 */
export function exposeToWindow() {
  const start = () => {
    const game = makeGame();

    const init =
      typeof UI.init === 'function'
        ? UI.init
        : typeof UI.default === 'function'
          ? UI.default
          : null;

    if (init) {
      init(game);
    } else {
      console.warn('[BRIDGE] No UI.init() (or default export) found in /src/ui/ui.js');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

// Auto-run on page load
exposeToWindow();
