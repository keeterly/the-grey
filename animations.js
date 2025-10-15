/**
 * animations.js — v2.571+ (polish)
 * De-glitched deal/falloff; spotlight + fly; minimal guards.
 */
(() => {
  if (window.__greyAnimationsLoaded__) return;
  window.__greyAnimationsLoaded__ = true;

  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on  = (n, fn) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); };
    const off = (n, fn) => listeners.get(n)?.delete(fn);
    const emit= (n, d)  => (listeners.get(n) || []).forEach(fn => { try { fn(d); } catch(e){ console.error(e);} });
    return (window.Grey = { on, off, emit });
  })();

  // CSS
  (function css(){
    const id='grey-anim-css';
    if (document.getElementById(id)) return;
    const style=document.createElement('style'); style.id=id;
    style.textContent = `
@keyframes grey-draw-pop{0%{transform:translateY(10px) scale(.92);opacity:0}
 55%{transform:translateY(-2px) scale(1.02);opacity:1}
100%{transform:translateY(0) scale(1);opacity:1}}
@keyframes grey-reveal{0%{transform:scale(.92);opacity:0}
 60%{transform:scale(1.03);opacity:1}
100%{transform:scale(1);opacity:1}}
@keyframes grey-falloff-right{0%{transform:translateX(0) translateY(0) rotate(0);opacity:1}
 65%{transform:translateX(44px) translateY(10px) rotate(7deg);opacity:.72}
100%{transform:translateX(96px) translateY(22px) rotate(11deg);opacity:0}}
@keyframes grey-spotlight{0%{box-shadow:0 0 0 rgba(126,182,255,0)}
 30%{box-shadow:0 0 28px rgba(126,182,255,.45)}
 70%{box-shadow:0 0 22px rgba(126,182,255,.35)}
100%{box-shadow:0 0 0 rgba(126,182,255,0)}}
.grey-anim-draw{animation:grey-draw-pop 300ms cubic-bezier(.2,.7,.2,1) both}
.grey-anim-reveal{animation:grey-reveal 320ms ease-out both}
.grey-anim-fall{animation:grey-falloff-right 520ms ease-out both}
.grey-anim-spot{animation:grey-spotlight 620ms ease-out both}
.grey-fly-clone{position:fixed;z-index:9999;pointer-events:none;transform-origin:center;will-change:transform,opacity}
.grey-hide-during-flight{opacity:0 !important}
.flow-card .card{position:relative;overflow:visible}
    `.trim();
    document.head.appendChild(style);
  })();

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
    c.style.transform = `translate(0,0) rotate(0deg)`; c.style.opacity = '0.95';
    document.body.appendChild(c);
    return c;
  }

  async function fly(node, srcRect, dstRect, { duration=560, curve=true, spin=false }={}){
    if (!isEl(node) || !srcRect || !dstRect) return;
    // guard: if already in-flight, skip
    if (node.dataset.animating === 'flight') return;
    node.dataset.animating = 'flight';

    // force layout to stabilize before we snapshot
    void getComputedStyle(node)?.opacity;

    const dx = dstRect.left - srcRect.left;
    const dy = dstRect.top  - srcRect.top;
    const bend = curve ? (Math.random()*36+24) * (Math.random()<.5?-1:1) : 0;
    const rot  = spin ? (Math.random()*16-8) : 0;
    const clone = cloneAtRect(srcRect, node);

    node.classList.add('grey-hide-during-flight');

    // rAF twice to avoid first-frame jump
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    clone.animate([
      { transform:`translate(0,0) rotate(0deg)`, opacity:.95 },
      { transform:`translate(${dx*0.62}px, ${dy*0.62 + bend}px) rotate(${rot/2}deg)`, opacity:.92 },
      { transform:`translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity:.88 }
    ], { duration, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' });

    await sleep(duration+40);
    clone.remove();
    node.classList.remove('grey-hide-during-flight');
    delete node.dataset.animating;
  }

  // DEAL (deck -> hand), staggered
  Grey.on('cards:deal', async ({nodes, stagger=110}={}) => {
    const deck = getDeckRect();
    const arr = asArray(nodes).filter(isEl).filter(n => n.dataset.animating !== 'deal');
    for (let i=0;i<arr.length;i++){
      const target = arr[i];
      target.dataset.animating = 'deal';
      const tRect  = target.getBoundingClientRect();
      await fly(target, deck, tRect, { duration: 520, curve:true, spin:false });
      target.classList.add('grey-anim-draw');
      target.addEventListener('animationend', ()=>{
        target.classList.remove('grey-anim-draw');
        delete target.dataset.animating;
      }, { once:true });
      if (i < arr.length-1) await sleep(stagger);
    }
  });

  // DISCARD (hand -> discard)
  Grey.on('cards:discard', async ({nodes}={}) => {
    const dst = getDiscardRect();
    await Promise.all(
      asArray(nodes).filter(isEl).map(async n => {
        const s = n.getBoundingClientRect();
        await fly(n, s, dst, { duration: 560, curve:true, spin:true });
      })
    );
  });

  // FLOW
  Grey.on('aetherflow:reveal', ({node}={}) => {
    if (!isEl(node) || node.dataset.animating === 'reveal') return;
    node.dataset.animating = 'reveal';
    node.classList.add('grey-anim-reveal');
    node.addEventListener('animationend', ()=>{
      node.classList.remove('grey-anim-reveal');
      delete node.dataset.animating;
    }, { once:true });
  });

  Grey.on('aetherflow:falloff', ({node}={}) => {
    if (!isEl(node) || node.dataset.animating === 'fall') return;
    node.dataset.animating = 'fall';
    node.classList.add('grey-anim-fall');
    node.addEventListener('animationend', ()=>{
      node.classList.remove('grey-anim-fall');
      delete node.dataset.animating;
    }, { once:true });
  });

  Grey.on('aetherflow:bought', async ({node}={}) => {
    if (!isEl(node)) return;
    const dst = getDiscardRect();
    node.classList.add('grey-anim-spot');
    const src = node.getBoundingClientRect();
    await fly(node, src, dst, { duration: 560, curve:true, spin:false });
    node.classList.remove('grey-anim-spot');
  });
})();
