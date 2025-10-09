// /src/index.js — clean bootstrap (no auto seeding)

import { GameEngine } from './bridge.js';     // keep your existing import that constructs the engine
import { init as initUI } from './ui/ui.js';   // your UI initializer
import './drag.js';                            // keeps drag module side-effects (pointer + gestures)
import './weavers.js';                         // if your engine uses weavers registry
import './cards.js';                           // card data
import './rules.js';                           // rules module

// Create the game engine (uses initialState() internally)
const game = GameEngine.create();
window.game = game; // keep global for console helpers or tests

// Init UI after engine is ready
initUI(game);

// Optionally expose a tiny banner to confirm boot
console.log('[ENGINE] GameEngine.create ready; window.game initialized.');

// IMPORTANT: do NOT call any demo seeding here.
// If you want the old demo, use the optional seeding in boot-debug.js gated by ?demo=1
