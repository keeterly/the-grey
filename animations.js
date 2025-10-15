/**
 * animations.js — v2.571 draw-glitch fix
 * Event-driven animations for The Grey
 *
 * Events:
 *  - Grey.emit('cards:deal',    { nodes:[HTMLElement,...], stagger?:110 })
 *  - Grey.emit('cards:discard', { nodes:[HTMLElement,...] })
 *  - Grey.emit('aetherflow:reveal',  { node:HTMLElement })
 *  - Grey.emit('aetherflow:falloff', { node:HTMLElement })
 *  - Grey.emit('aetherflow:bought',  { node:HTMLElement })
 */
(() => {
  if (window.__greyAnimationsLoaded__) return;
  window.__greyAnimationsLoaded__ = true;

  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on  = (n, fn)=>{ if(!listeners.has(n)) listeners.set(n,new Set()); listeners.get(n).add(fn); };
    const off = (n, fn)=> listeners.get(n)?.delete(fn);
    const emit= (n, d)=> (listeners.get(n)||[]).forEach(fn=>{ try{fn(d);}catch(e){console.error(e);} });
    return (window.Grey = { on, off, emit });
  })();

  // ---------- CSS ----------
  (function css(){
    const id='grey-anim-css';
    if (document.getElementById(id)) return;
    const style=document.createElement('style'); style.id=id;
    style.textContent = `
@keyframes grey-draw-pop{
  0%{transform:translateY(10px) scale(.96);opacity:0}
 60%{transform:translateY(-2px) scale(1.02);opacity:1}
100%{transform:translateY(0) scale(1);opacity:1}}
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
.grey-anim-draw{animation:grey-draw-pop 300ms cubic-bezier(.2,.7,.2,1) both}
.grey-anim-reveal{animation:grey-reveal 340ms ease-out both}
.grey-anim-fall{animation:grey-falloff-right 520ms ease-out both}
.grey-anim-spot{animation:grey-spotlight 620ms ease-out both}
.grey-fly-clone{position:fixed;z-index:9999;pointer-events:none;transform-origin:center;will-change:transform,opacity;filter:drop-shadow(0 8px 22px rgba(0,0,0,.45))}
.grey-hide{visibility:hidden !important}
.flow-card .card{position:relative;overflow:visible}
@media (prefers-reduced-motion:reduce){
  .grey-anim-draw,.grey-anim-reveal,.grey-anim-fall,.grey-anim-spot{animation:none!important}
}
`; document.head.appendChild(style);
  })();

  // ---------- helpers ----------
  const asArray = v => Array.isArray(v) ? v : v ? [v] : [];
  const isEl = n => n && n.nodeType === 1;
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  const getRect = id => {
    const el = document.getElementById(id);
    if (!el) return { left: 24, top: 24, width: 1, height: 1 };
    return el.getBoundingClientRect();
  };
  const getDeckRect    = () => getRect('btn-deck-hud');
  const getDiscardRect = () => getRect('btn-discard-hud');

  function cloneAtRect(rect, templateNode){
    const c = templateNode?.cloneNode ? templateNode.cloneNode(true) : document.createElement('div');
    c.classList.add('grey-fly-clone');
    c.style.left = `${rect.left}px`;
    c.style.top = `${rect.top}px`;
    c.style.width = `${rect.width}px`;
    c.style.height = `${rect.height}px`;
    c.style.transform = `translate(0,0) rotate(0deg)`;
    c.style.opacity = '0.98';
    document.body.appendChild(c);
    return c;
  }

  async function fly(node, srcRect, dstRect, { duration=560, curve=true, spin=false } = {}){
    if (!srcRect || !dstRect) return;
    const dx = dstRect.left - srcRect.left;
    const dy = dstRect.top  - srcRect.top;
    const bend = curve ? (Math.random()*40+28) * (Math.random()<.5?-1:1) : 0;
    const rot  = spin ? (Math.random()*16-8) : 0;
    const clone = cloneAtRect(srcRect, node);

    clone.animate([
      { transform:`translate(0,0) rotate(0deg)`, opacity:.98 },
      { transform:`translate(${dx*0.6}px, ${dy*0.6 + bend}px) rotate(${rot/2}deg)`, opacity:.95 },
      { transform:`translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity:.9 }
    ], { duration, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' });

    await sleep(duration+20);
    clone.remove();
  }

  // ---------- Events ----------
  // DRAW: hide the real card, fly a clone, then reveal with a small pop — prevents “flash”.
  Grey.on('cards:deal', async ({ nodes, stagger=110 } = {}) => {
    const deckRect = getDeckRect();
    const list = asArray(nodes).filter(isEl).filter(n => !n.dataset.dealt); // only new cards
    for (let i=0;i<list.length;i++){
      const card = list[i];
      card.classList.add('grey-hide');           // hide real card during flight
      const targetRect = card.getBoundingClientRect();
      await fly(card, deckRect, targetRect, { duration: 540, curve:true, spin:false });
      card.classList.remove('grey-hide');
      card.classList.add('grey-anim-draw');
      card.addEventListener('animationend', ()=> card.classList.remove('grey-anim-draw'), { once:true });
      card.dataset.dealt = '1';                  // mark so we don’t re-animate next render
      if (i < list.length-1) await sleep(stagger);
    }
  });

  Grey.on('cards:discard', async ({ nodes } = {}) => {
    const dst = getDiscardRect();
    await Promise.all(
      asArray(nodes).filter(isEl).map(n => {
        const s = n.getBoundingClientRect();
        return fly(n, s, dst, { duration: 560, curve:true, spin:true });
      })
    );
  });

  Grey.on('aetherflow:reveal', ({ node } = {}) => {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-reveal');
    node.addEventListener('animationend', ()=> node.classList.remove('grey-anim-reveal'), { once:true });
  });

  Grey.on('aetherflow:falloff', ({ node } = {}) => {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-fall');
    node.addEventListener('animationend', ()=> node.classList.remove('grey-anim-fall'), { once:true });
  });

  Grey.on('aetherflow:bought', async ({ node } = {}) => {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-spot');
    const src = node.getBoundingClientRect();
    const dst = getDiscardRect();
    await fly(node, src, dst, { duration: 560, curve:true, spin:false });
    node.classList.remove('grey-anim-spot');
  });
})();
