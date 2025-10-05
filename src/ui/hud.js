import { animateDiscardHand, animateDrawHand } from './animations.js';

export function wireHUD(game, weavers){
  const S=()=>game.getState();
  const youBtn=document.getElementById('youTranceBtn');
  const aiBtn=document.getElementById('aiTranceBtn');
  const menu=document.getElementById('tranceMenu');
  const title=document.getElementById('tranceMenuTitle');
  const row=document.getElementById('tranceMenuBtns');
  const hint=document.getElementById('tranceMenuHint');

  youBtn.addEventListener('click',()=>{
    const T=S().trance.you; const W=weavers[T.weaver];
    title.textContent=`Spend Trance — ${T.weaver}`;
    row.innerHTML='';
    (W.spend||[]).forEach((opt,idx)=>{
      const b=document.createElement('button'); b.textContent=opt.n; b.disabled=(T.cur<T.cap);
      b.onclick=()=>{ game.dispatch({type:'SPEND_TRANCE', who:'you', option:idx}); menu.classList.remove('show'); };
      row.appendChild(b);
    });
    hint.textContent=W.hint||'';
    menu.classList.add('show');
  });

  aiBtn.addEventListener('click',()=>{
    const T=S().trance.ai; const W=weavers[T.weaver];
    title.textContent=`AI Trance — ${T.weaver}`;
    row.innerHTML='';
    (W.spend||[]).forEach((opt)=>{ const b=document.createElement('button'); b.textContent=opt.n; b.disabled=true; row.appendChild(b); });
    hint.textContent=W.hint||'';
    menu.classList.add('show');
  });

  document.addEventListener('click',(e)=>{ if(!menu.contains(e.target) && !youBtn.contains(e.target) && !aiBtn.contains(e.target)) menu.classList.remove('show'); });

  document.getElementById('chipDeck').onclick = ()=> game.dispatch({type:'DRAW'});
  document.getElementById('chipDiscard').onclick = ()=> {};

  // FABs
document.getElementById('fabDraw').onclick = ()=> game.dispatch({type:'DRAW'});

document.getElementById('fabEnd').onclick  = async ()=> {
  // 1) Animate discarding current hand (visual only)
  await animateDiscardHand();

  // 2) Do the normal turn swap (rules/AI)
  game.dispatch({type:'END_TURN'});
  game.dispatch({type:'AI_TURN'});
  game.dispatch({type:'START_TURN'});

  // 3) Animate new hand coming in
  await animateDrawHand();
};

document.getElementById('fabReset').onclick= ()=> {
  const st=S();
  game.dispatch({type:'RESET', playerWeaver:st.trance.you.weaver, aiWeaver:st.trance.ai.weaver});
  game.dispatch({type:'ENSURE_MARKET'});
  game.dispatch({type:'START_TURN', first:true});
};

}
