// src/engine/bridge.js
// Bridge the engine to the UI with correct, relative imports.

/*
Folder layout this expects:
  /src/
    engine/
      index.js
      bridge.js   <-- this file
    ui/
      ui.js
*/

import './index.js';             // initializes the engine and exposes window.dispatch/getState
import * as UI from '../ui/ui.js';  // UI entry (no leading /src!)

/**
 * Wire the running engine to the UI.
 * Assumes index.js exposes window.dispatch and window.getState (as your current engine does).
 */
export function exposeToWindow() {
  const start = () => {
    if (typeof UI.init === 'function') {
      // Construct the "game" object the UI expects.
      const game = {
        get state() { return window.getState?.(); },
        dispatch: (...args) => window.dispatch?.(...args),
      };
      UI.init(game);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

// Auto-run for normal page loads
exposeToWindow();
