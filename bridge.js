// src/bridge.js
// Adapts ESM exports to the globals your legacy boot/debug expects.
// Keeps UI vs Mechanics separated; this file is the only glue.

import * as EngineIndex   from './index.js';
import * as EngineState   from './state.js';    // ensures side effects/registers if any
import * as EngineRules   from './rules.js';
import * as EngineAI      from './ai.js';
import * as EngineCards   from './cards.js';
import * as EngineWeavers from './weavers.js';

import * as UIIndex       from './ui/index.js';
import * as UIAssets      from './ui/assets.js';
import * as UIRender      from './ui/render.js';
import * as UIHud         from './ui/hud.js';
import * as UIAnims       from './ui/animations.js';
import * as UIMarket      from './ui/market.js';

import * as UIDrag        from './ui/drag.js';

export function exposeToWindow() {
  const g = window;

  // 1) Drag API
  const dragAPI = UIDrag.DragCards || UIDrag.default;
  if (dragAPI && !g.DragCards) g.DragCards = dragAPI;

  // 2) UI initializer
  const uiInit = UIIndex.init || UIRender.init || UIIndex.default || UIRender.default;
  if (typeof uiInit === 'function' && !g.UI) g.UI = { init: uiInit };

  // 3) Engine / game factory
  const createGame =
    EngineIndex.createGame || EngineIndex.create || EngineIndex.default || EngineState.createGame;

  if (typeof createGame === 'function') {
    if (!g.GameEngine) g.GameEngine = { create: createGame };
    if (!g.game) {
      try { g.game = createGame(); } catch (e) { console.warn('[bridge] createGame() failed', e); }
    }
  }
}
