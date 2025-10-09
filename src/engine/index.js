// /src/index.js — clean boot; no seeding anywhere

import { GameEngine } from './src/engine/bridge.js';
import { init as initUI } from './ui/ui.js';
import './drag.js';
import './weavers.js';
import './cards.js';
import './rules.js';

const game = GameEngine.create();
window.game = game;

initUI(game);

console.log('[ENGINE] GameEngine.create ready; window.game initialized.');
