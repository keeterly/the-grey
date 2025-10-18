/**
 * animations.js — v2.571+
 * Event-driven animations for The Grey
 *
 * Events:
 *  - 'cards:deal'         { nodes:[HTMLElement,...], stagger?:120 } // deck → hand
 *  - 'cards:discard'      { nodes:[HTMLElement,...] }               // hand → discard
 *  - 'aetherflow:reveal'  { node:HTMLElement }                      // entry pop
 *  - 'aetherflow:falloff' { node:HTMLElement }                      // fall-right
 *  - 'aetherflow:bought'  { node:HTMLElement }                      // spotlight + fly to discard
 */
(() => {
  if (window.__greyAnimationsLoaded__) return;
  window.__greyAnimationsLoaded__ = true;

  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on  = (n, fn) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); };
    const off = (n, fn) => listeners.get(n)?.delete(fn);
    const emit= (n, d) => (listeners.get(n) || []).forEach(fn => { try { fn(d); } catch(e){ console.error(e); } });
    return (window.Grey = { on, off, emit });
  })();

  // CSS
  (function css(){
    const id='grey-anim-css';
    if (document.getElementById(id)) return;
    const style=document.createElement('style'); style.id=id;
    style.textContent = `
@keyframes grey-reveal{0%{transform:scale(.92);opacity:0}
 60%{transform:scale(1.03);opacity:1}
100%{transform:scale(1);opacity:1}}
@keyframes grey-falloff-right{0%{transform:translateX(0) translateY(0) rotate(0);opacity:1}
 60%{transform:translateX(40px) translateY(8px) rotate(6deg);opacity:.7}
100%{transform:translateX(88px) translateY(20px) rotate(10deg);opacity:0}}
@keyframes grey-spotlight{0%{box-shadow:0 0 0 rgba(126,182,255,0)}
 30%{box-shadow:0 0 28px rgba(126,182,255,.45)}
 70%{box-shadow:0 0 22px rgba(126,182,255,.35)}
100%{box-shadow:0 0 0 rgba(126,182,255,0)}}

.grey-anim-reveal{animation:grey-reveal 340ms ease-out both}
.grey-anim-fall{animation:grey-falloff-right 520ms ease-out both}
.grey-anim-spot{animation:grey-spotlight 620ms ease-out both}

.grey-fly-clone{position:fixed;z-index:9999;pointer-events:none;transform-origin:center;will-change:transform,opacity,filter}
.grey-hide{opacity:0 !important; visibility:hidden !important}

/* ensure market card can show spotlight glow cleanly */
.flow-card .card { position: relative; overflow: visible; }
    `.trim();
    document.head.appendChild(style);
  })();

  // helpers
  const asArray = v => Array.isArray(v) ? v : v ? [v] : [];
  const isEl = n => n && n.nodeType === 1;
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  function getDeckRect(){
    const d = document.getElementById('btn-deck-hud');
    return d ? d.getBoundingClientRect() : { left: 20, top: 20, width: 1, height: 1 };
  }
  function getDiscardRect(){
    const d = document.getElementById('btn-discard-hud');
    return d ? d.getBoundingClientRect() : { left: 40, top: 40, width: 1, height: 1 };
  }

  function cloneAtRect(rect, templateNode){
    const c = (templateNode?.cloneNode ? templateNode.cloneNode(true) : document.createElement('div'));
    c.classList.add('grey-fly-clone');
    c.style.left = `${rect.left}px`;  c.style.top = `${rect.top}px`;
    c.style.width = `${rect.width}px`; c.style.height = `${rect.height}px`;
    c.style.transform = `translate(0,0) rotate(0deg)`;
    c.style.opacity = '0';
    document.body.appendChild(c);
    return c;
  }

  // soft arced flight with fade & slight scale
  async function flyArc(node, srcRect, dstRect, { duration=560, arc=64, scale=0.06 }={}){
    if (!isEl(node) || !srcRect || !dstRect) return;
    const dx = dstRect.left - srcRect.left;
    const dy = dstRect.top  - srcRect.top;

    // control point roughly mid-way with upward arc
    const midX = dx * 0.55;
    const midY = dy * 0.55 - arc;

    const clone = cloneAtRect(srcRect, node);
    node.classList.add('grey-hide');      // prevent flash of real node until clone lands

    const kf = [
      { transform:`translate(0px,0px) scale(${1 - scale})`,   opacity: 0 },
      { transform:`translate(${midX}px, ${midY}px) scale(${1 + scale})`, opacity: .85, offset: 0.6 },
      { transform:`translate(${dx}px, ${dy}px) scale(1)`,     opacity: 1 }
    ];

    clone.animate(kf, { duration, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' });
    await sleep(duration + 30);

    clone.remove();
    node.classList.remove('grey-hide');   // reveal final node
  }

  async function flyStraight(node, srcRect, dstRect, { duration=560 }={}){
    if (!isEl(node) || !srcRect || !dstRect) return;
    const dx = dstRect.left - srcRect.left;
    const dy = dstRect.top  - srcRect.top;
    const clone = cloneAtRect(srcRect, node);
    node.classList.add('grey-hide');

    clone.animate([
      { transform:`translate(0,0) scale(.98)`, opacity: 0 },
      { transform:`translate(${dx*0.6}px, ${dy*0.6}px) scale(1.03)`, opacity: .9, offset:.7 },
      { transform:`translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 }
    ], { duration, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' });

    await sleep(duration + 30);
    clone.remove();
    node.classList.remove('grey-hide');
  }

  // Events
  Grey.on('cards:deal', async ({nodes, stagger=110}={}) => {
    const deck = getDeckRect();
    const arr = asArray(nodes).filter(isEl);
    for (let i=0;i<arr.length;i++){
      const target = arr[i];
      const tRect  = target.getBoundingClientRect();
      // soft arc + fade/scale — feels organic and avoids ghosting
      await flyArc(target, deck, tRect, { duration: 620, arc: 72, scale: 0.08 });
      if (i < arr.length-1) await sleep(stagger);
    }
  });

  Grey.on('cards:discard', async ({nodes}={}) => {
    const dst = getDiscardRect();
    await Promise.all(
      asArray(nodes).filter(isEl).map(n => {
        const s = n.getBoundingClientRect();
        return flyStraight(n, s, dst, { duration: 560 });
      })
    );
  });

  Grey.on('aetherflow:reveal', ({node}={}) => {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-reveal');
    node.addEventListener('animationend', ()=> node.classList.remove('grey-anim-reveal'), { once:true });
  });

  Grey.on('aetherflow:falloff', ({node}={}) => {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-fall');
    node.addEventListener('animationend', ()=> node.classList.remove('grey-anim-fall'), { once:true });
  });

  Grey.on('aetherflow:bought', async ({node}={}) => {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-spot');
    const dst = getDiscardRect();
    const src = node.getBoundingClientRect();
    await flyStraight(node, src, dst, { duration: 560 });
    node.classList.remove('grey-anim-spot');
  });
})();





(function(){
  const Grey = window.Grey;

  // --- CSS for cinematic animation and magical glow ---
  const css = `
  .cine-clone {
    position: fixed;
    left: 0; top: 0;
    z-index: 999999;
    pointer-events: none;
    will-change: transform, opacity, filter;
    transform-origin: center center;
    transition: transform 240ms cubic-bezier(.2,.8,.2,1), opacity 180ms linear, filter 240ms ease;
    filter: drop-shadow(0 8px 16px rgba(0,0,0,.45));
  }
  .cine-glow {
    /* Magical edge glow effect */
    box-shadow:
      0 0 0 0 rgba(140,180,255,.0),
      0 0 12px 2px rgba(140,180,255,.35) inset,
      0 0 24px 6px rgba(90,160,255,.35);
    animation: cinePulse 900ms ease-in-out 0s 1,
               cineBreath 2.4s ease-in-out .9s infinite;
    border-radius: 14px;
  }
  @keyframes cinePulse {
    0%   { box-shadow: 0 0 0 0 rgba(140,180,255,.0), 0 0 8px 1px rgba(140,180,255,.2) inset, 0 0 12px 2px rgba(90,160,255,.2); }
    30%  { box-shadow: 0 0 0 2px rgba(170,210,255,.35), 0 0 22px 3px rgba(170,210,255,.45) inset, 0 0 34px 8px rgba(120,190,255,.55); }
    100% { box-shadow: 0 0 0 0 rgba(140,180,255,.0), 0 0 12px 2px rgba(140,180,255,.35) inset, 0 0 24px 6px rgba(90,160,255,.35); }
  }
  @keyframes cineBreath {
    0%,100% { filter: drop-shadow(0 8px 16px rgba(0,0,0,.45)) }
    50%     { filter: drop-shadow(0 10px 22px rgba(0,0,0,.55)) }
  }`;

  if (!document.getElementById('cine-style')) {
    const tag = document.createElement('style');
    tag.id = 'cine-style';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // --- Utility functions ---
  function rectOf(el){
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {x:r.left, y:r.top, w:r.width, h:r.height};
  }

  function centerOfViewport(){
    return { cx: window.innerWidth/2, cy: window.innerHeight/2 };
  }

  function placeCloneAtRect(clone, r){
    clone.style.width  = r.w + 'px';
    clone.style.height = r.h + 'px';
    clone.style.transform = `translate(${r.x}px, ${r.y}px)`;
  }

  async function stageCinematic(node, {to, holdMs=420, scale=1.18}={}){
    if (!node) return;

    const fromR = rectOf(node);
    const clone = node.cloneNode(true);
    clone.classList.add('cine-clone','cine-glow');
    document.body.appendChild(clone);
    placeCloneAtRect(clone, fromR);

    await new Promise(r=> requestAnimationFrame(r));

    // Move to screen center and enlarge slightly
    const {cx, cy} = centerOfViewport();
    const targetX = cx - fromR.w/2;
    const targetY = cy - fromR.h/2;
    clone.style.transform = `translate(${targetX}px, ${targetY}px) scale(${scale})`;

    await new Promise(r=> setTimeout(r, holdMs));

    // Fly to destination (discard HUD or given target)
    let destR = null;
    if (to) {
      const destEl = (typeof to === 'string') ? document.querySelector(to) : to;
      if (destEl) {
        const r = destEl.getBoundingClientRect();
        destR = {
          x: r.x + r.width/2 - fromR.w/2,
          y: r.y + r.height/2 - fromR.h/2,
          w: fromR.w,
          h: fromR.h
        };
      }
    }
    if (destR){
      clone.style.transform = `translate(${destR.x}px, ${destR.y}px) scale(.86)`;
      clone.style.opacity = '0.0';
      await new Promise(r=> setTimeout(r, 240));
    }

    clone.remove();
  }

  // --- Hook into Grey events ---
  Grey?.on?.('spotlight:cine', ({node, to}) => {
    try { stageCinematic(node, {to}); } catch(e){ console.error(e); }
  });

  Grey?.on?.('aetherflow:bought', ({node}) => {
    try { stageCinematic(node, {to:'#btn-discard-hud', holdMs:360, scale:1.14}); } catch(e){ console.error(e); }
  });

})();


