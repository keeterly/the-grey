import { renderHand } from './render.js';

export function bindDrag(game){
  const state = ()=>game.getState();
  const rRibbon=document.getElementById('ribbon');

  function prepPointer(card,i){
    let down=false,drag=false,ghost=null,startX=0,startY=0,downAt=0;
    card.addEventListener('pointerdown',e=>{
      down=true; drag=false; startX=e.clientX; startY=e.clientY; downAt=performance.now();
      card.setPointerCapture?.(e.pointerId); e.preventDefault();
    });
    card.addEventListener('pointermove',e=>{
      if(!down) return;
      if(!drag){
        const moved=Math.hypot(e.clientX-startX,e.clientY-startY);
        if(moved>8){
          drag=true;
          ghost=card.cloneNode(true);
          Object.assign(ghost.style,{position:'fixed',left:e.clientX+'px',top	e.clientY+'px',transform:'translate(-50%,-50%) scale(1.02)',pointerEvents:'none',opacity:.95,zIndex:999});
          document.body.appendChild(ghost);
        }
      }else{
        ghost.style.left=e.clientX+'px';
        ghost.style.top=e.clientY+'px';
        highlightDrop(e.clientX,e.clientY);
      }
    });
    function end(e){
      if(!down) return; down=false; card.releasePointerCapture?.(e.pointerId);
      if(drag){
        const idx=dropIndex(e.clientX,e.clientY); if(idx!=null) game.dispatch({type:'PLAY_FROM_HAND', index:i, slot:idx});
        if(ghost) ghost.remove(); unhot();
      }else{
        const dur=performance.now()-downAt, moved=Math.hypot(e.clientX-startX,e.clientY-startY);
        if(dur<250 && moved<6) openInspect(i);
      }
    }
    card.addEventListener('pointerup',end);
    card.addEventListener('pointercancel',end);
  }

  function openInspect(i){
    const S=state(); const c=S.hand[i]; if(!c) return;
    document.getElementById('insTitle').textContent=c.n;
    document.getElementById('insText').textContent=c.txt||'';
    document.getElementById('insArt').src = (window.resolveArt?window.resolveArt(c):'');
    document.getElementById('inspect').classList.add('show');
  }
  function highlightDrop(x,y){[...document.querySelectorAll('#playerSlots .slot')].forEach(s=>s.classList.toggle('is-hot',hit(s,x,y))); }
  function unhot(){[...document.querySelectorAll('#playerSlots .slot')].forEach(s=>s.classList.remove('is-hot'))}
  function hit(el,x,y){const r=el.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom}
  function dropIndex(x,y){const A=[...document.querySelectorAll('#playerSlots .slot')];const i=A.findIndex(s=>hit(s,x,y));return i>-1?i:null}

  renderHand(state(), game.dispatch.bind(game), prepPointer);
  game.subscribe((S)=> renderHand(S, game.dispatch.bind(game), prepPointer));

  document.getElementById('btnInspectClose').onclick = ()=> document.getElementById('inspect').classList.remove('show');
  document.getElementById('btnInspectPlay').onclick   = ()=> { /* optional: wire play from inspect */ };
  document.getElementById('btnInspectChan').onclick   = ()=> { /* optional: wire channel from inspect */ };
}
