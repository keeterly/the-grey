import { createGame } from '../engine/index.js';
import { WEAVERS } from '../engine/weavers.js';
import { render, updateHUDPadding } from './render.js';
import { bindDrag } from './drag.js';
import './market.js';
import { aiTurn } from '../engine/ai.js';

import { resolveArt } from './assets.js';
window.resolveArt = resolveArt;

const PLAYER_WEAVER='Emberwright';
const AI_WEAVER='Stormbinder';

const game = createGame({ playerWeaver: PLAYER_WEAVER, aiWeaver: AI_WEAVER });

game.subscribe((state)=> render(state, game.dispatch.bind(game)));

game.dispatch({type:'ENSURE_MARKET'});
game.dispatch({type:'START_TURN', first:true});
updateHUDPadding();

bindDrag(game);
import { wireHUD } from './hud.js';
wireHUD(game, WEAVERS);

game.dispatch = (function(orig){
  return function(action){
    orig(action);
    if(action.type==='AI_TURN'){
      aiTurn(game);
    }
  };
})(game.dispatch);
