// bridge.js (at project root)
import * as Engine from "./src/engine/index.js";
import * as UI from "./src/ui/index.js";
import "./src/ui/drag.js";
import * as UI from './ui.js';

export function exposeToWindow(){
  const g = (window.game && typeof window.game.dispatch==='function')
    ? window.game
    : Engine.createGame();

  window.GameEngine = Engine;
  window.game = g;

  // Init UI
  UI.init(g);

  console.log("[BRIDGE] Game + UI + Drag initialized and exposed to window.");
}
