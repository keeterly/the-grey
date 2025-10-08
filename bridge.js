// /bridge.js  — root entry point for engine + UI
// -------------------------------------------------
import * as Engine from "./src/engine/index.js";
import * as UI from "./src/ui/ui.js";       // single UI module
import "./src/ui/drag.js";                  // drag helpers, no duplicate exports

export function exposeToWindow() {
  // Reuse existing game if window.game already initialized
  const g =
    window.game && typeof window.game.dispatch === "function"
      ? window.game
      : Engine.createGame();

  // expose globally for console debugging
  window.GameEngine = Engine;
  window.game = g;

  // Initialize UI (safe check)
  if (UI && typeof UI.init === "function") {
    UI.init(g);
  } else {
    console.warn("[BRIDGE] UI.init not found — skipping UI binding.");
  }

  console.log("[BRIDGE] Game + UI + Drag initialized and exposed to window.");
}
