import { FLOW_PRICES } from './cards.js';

export function aiTurn(game){
  const s = game.getState();
  game.dispatch({type:'AI_SPEND_TRANCE'});
  while(s.ai.hand.length < 5) game.dispatch({type:'AI_DRAW'});
  game.dispatch({type:'AI_PLAY_SPELL'});
  game.dispatch({type:'AI_CHANNEL'});
  game.dispatch({type:'AI_ADVANCE'});
  for(let i=4;i>=0;i--){ if(s.flowRow[i] && (s.ai.ae||0)>=FLOW_PRICES[i]){ game.dispatch({type:'AI_BUY', index:i}); break; } }
  game.dispatch({type:'ENSURE_MARKET'});
}
