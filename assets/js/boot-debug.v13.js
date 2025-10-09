/* assets/js/boot-debug.v13.js — cache-busted, cleaned import */
(function(){ window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v13'; })();

(function ensureHud(){
  const right = document.querySelector('.hud-min .right');
  if (right) {
    const endBtn = document.getElementById('btnEnd') || right.lastElementChild;
    const pill=(id,sym)=>{ const el=document.createElement('span'); el.id=id; el.className='hud-pill'; el.innerHTML=`<span class="sym">${sym}</span><span class="val">0</span>`; return el; };
    if (!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill','🜂'), endBtn);
    if (!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill','◇'), endBtn);
  }
  if (!document.getElementById('tgVersion')) { const v=document.createElement('div'); v.id='tgVersion'; v.className='tgVersion'; v.textContent='The Grey — ' + (window.__THE_GREY_BUILD||'dev'); document.body.appendChild(v); }
})();

(async function wireAcceptance(){
  try {
    const Engine = await import('./engine.acceptance.js');
    function attach(game){
      if (typeof game.dispatch === 'function') {
        const original = game.dispatch.bind(game);
        game.dispatch = (action)=>{ const r=original(action); const t=(action&&action.type)||''; if(t==='START_TURN'||t==='START_PHASE'||t==='START'){ Engine.startPhase(game); Engine.checkTrance?.(game,()=>{}); } return r; };
      }
      Engine.startPhase(game);
      Engine.checkTrance?.(game,()=>{});
    }
    const MAX=10000, START=Date.now();
    (function wait(){ if(window.game && window.game.players && window.game.players.length) attach(window.game); else if(Date.now()-START<MAX) setTimeout(wait,60); else console.warn('[acceptance] game not detected.'); })();
    (function tick(){ const g=window.game, i=g?(g.active??g.activePlayer??0):0; const p=g&&g.players?g.players[i]:null; const temp=document.querySelector('#tgTempPill .val'); const chan=document.querySelector('#tgChanPill .val'); if(p&&temp&&chan){ temp.textContent=String(p.aether??0); chan.textContent=String((p.channeledAether??p.channeled)??0); } requestAnimationFrame(tick); })();
  } catch(e) { console.error('boot-debug.v13 import error', e); }
})();
