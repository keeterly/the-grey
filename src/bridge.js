// src/bridge.js
// ESM → window adapter so the legacy boot/debug can find things.
// Matches your tree: src/engine/* and src/ui/*

import * as EngineIndex    from './engine/index.js';
import * as EngineState    from './engine/state.js';
import * as EngineRules    from './engine/rules.js';
import * as EngineAI       from './engine/ai.js';
import * as EngineCards    from './engine/cards.js';
import * as EngineWeavers  from './engine/weavers.js';
import * as EngineRNG      from './engine/rng.js'; // present in your tree

import * as UIIndex        from './ui/index.js';
import * as UIAssets       from './ui/assets.js';
import * as UIRender       from './ui/render.js';
import * as UIHud          from './ui/hud.js';
import * as UIAnimations   from './ui/animations.js';
import * as UIMarket       from './ui/market.js';
import * as UIDrag         from './ui/drag.js';

(function expose() {
  const g = window;

  // 1) Drag API
  const dragAPI = UIDrag.DragCards || UIDrag.default;
  if (dragAPI && !g.DragCards) g.DragCards = dragAPI;

  // 2) UI initializer
  const uiInit =
    UIIndex.init || UIRender.init || UIIndex.default || UIRender.default;
  if (typeof uiInit === 'function' && !g.UI) g.UI = { init: uiInit };

  // 3) Engine / game factory
  const createGame =
    EngineIndex.createGame ||
    EngineIndex.create ||
    EngineIndex.default ||
    EngineState.createGame; // fallback if defined there

  if (typeof createGame === 'function') {
    if (!g.GameEngine) g.GameEngine = { create: createGame };
    if (!g.game) {
      try { g.game = createGame(); }
      catch (e) { console.warn('[bridge] createGame() failed:', e); }
    }
  } else if (EngineIndex.game && !g.game) {
    g.game = EngineIndex.game;
  }
})();
