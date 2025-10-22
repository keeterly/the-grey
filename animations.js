/* animations.js — Patch Set 2 Cinematic polish */
(() => {
  if (window.__greyCinePatch2Loaded__) return;
  window.__greyCinePatch2Loaded__ = true;

  const Grey = window.Grey ?? (window.Grey = (() => {
    const listeners = new Map();
    return {
      on(n, f) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(f); },
      emit(n, d) { (listeners.get(n) || []).forEach(fn => fn(d)); },
    };
  })());

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const asArray = v => Array.isArray(v) ? v : v ? [v] : [];

  const css = `
  .cine-hover {transition:transform .2s ease, filter .3s ease; }
  .cine-hover:hover {transform:scale(1.04); filter:drop-shadow(0 0 12px rgba(140,180,255,.4));}
  .cine-wisp {
    position:fixed; z-index:9999; width:8px; height:8px;
    border-radius:50%; background:rgba(120,180,255,.9);
    pointer-events:none; mix-blend-mode:screen;
    animation:wispDrift .8s cubic-bezier(.2,.8,.2,1) forwards;
  }
  @keyframes wispDrift {
    0%{opacity:1; transform:scale(1) translate(0,0);}
    100%{opacity:0; transform:scale(.2) translate(40px,-60px);}
  }
  `;
  if (!document.getElementById('cine2-style')) {
    const s = document.createElement('style');
    s.id = 'cine2-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function rectOf(el){ const r = el.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; }
  function spawnWisp(from,to){
    const f = rectOf(from), t = rectOf(to);
    const w = document.createElement('div');
    w.className='cine-wisp';
    w.style.left=`${f.x+f.w/2}px`; w.style.top=`${f.y+f.h/2}px`;
    document.body.appendChild(w);
    const dx=t.x-f.x, dy=t.y-f.y;
    w.animate([{transform:`translate(0,0)`},{transform:`translate(${dx}px,${dy}px)`}],{duration:700,easing:'ease-out'});
    setTimeout(()=>w.remove(),700);
  }

  Grey.on('spotlight:cine', ({node,to})=>{
    if(!node) return;
    const clone=node.cloneNode(true);
    const r=rectOf(node);
    Object.assign(clone.style,{position:'fixed',left:`${r.x}px`,top:`${r.y}px`,width:`${r.w}px`,height:`${r.h}px`,zIndex:9999,transformOrigin:'center center'});
    document.body.appendChild(clone);
    const cx=window.innerWidth/2-r.w/2, cy=window.innerHeight/2-r.h/2;
    clone.animate([{transform:`translate(0,0) scale(1)`},
                   {transform:`translate(${cx-r.x}px,${cy-r.y}px) scale(1.18)`}],
                   {duration:420,easing:'cubic-bezier(.2,.7,.2,1)'});
    setTimeout(()=>{
      if(to){
        const d=(typeof to==='string')?document.querySelector(to):to;
        if(d){ const dr=d.getBoundingClientRect();
          clone.animate([{transform:`translate(${cx-r.x}px,${cy-r.y}px) scale(1.18)`,opacity:1},
                         {transform:`translate(${dr.x-r.x}px,${dr.y-r.y}px) scale(.9)`,opacity:0}],
                         {duration:360,easing:'ease-in'});
        }
      }
      setTimeout(()=>clone.remove(),720);
    },420);
  });

  Grey.on('channel:wisp', ({node})=>{
    const dst=document.getElementById('aether-icon-player')||document.body;
    spawnWisp(node,dst);
  });
})();
