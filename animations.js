/**
 * animations.js — v2.571+
 * Event-driven animations for The Grey
 *
 * Events:
 *  - 'cards:drawn'        { nodes:[HTMLElement,...] }         // small pop (not used for deal)
 *  - 'cards:deal'         { nodes:[HTMLElement,...], stagger?:120 } // fly from deck → target, hide target till land
 *  - 'cards:discard'      { nodes:[HTMLElement,...] }         // fly to discard (curve + spin, hide originals)
 *  - 'aetherflow:reveal'  { node:HTMLElement }                // entry pop
 *  - 'aetherflow:falloff' { node:HTMLElement }                // fall-right and fade
 *  - 'aetherflow:bought'  { node:HTMLElement }                // spotlight + fly to discard
 */

(() => {
  if (window.__greyAnimationsLoaded__) return;
  window.__greyAnimationsLoaded__ = true;

  // ------- small bus if host didn’t provide one -------
  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on = (n, fn) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); };
    const off = (n, fn) => listeners.get(n)?.delete(fn);
    const emit = (n, d) => (listeners.get(n) || []).forEach(fn => { try { fn(d); } catch(e) { console.error(e); } });
    return (window.Grey = { on, off, emit });
  })();

  // ------- keyframes -------
  (function css(){
    const id='grey-anim-css';
    if (document.getElementById(id)) return;
    const style = document.createElement('style'); style.id=id;
    style.textContent = `
@keyframes grey-draw-pop { 0%{transform:translateY(14px) scale(.9);opacity:0}
  60%{transform:translateY(-4px) scale(1.02);opacity:1}
  100%{transform:translateY(0) scale(1);opacity:1} }
@keyframes grey-reveal   { 0%{transform:scale(.92);opacity:0}
  60%{transform:scale(1.03);opacity:1} 100%{transform:scale(1);opacity:1} }
@keyframes grey-falloff-right { 0%{transform:translateX(0) translateY(0) rotate(0);opacity:1}
  60%{transform:translateX(36px) translateY(6px) rotate(5deg);opacity:.7}
  100%{transform:translateX(84px) translateY(18px) rotate(9deg);opacity:0}}
@keyframes grey-spotlight { 0%{box-shadow:0 0 0 rgba(126,182,255,0)}
  30%{box-shadow:0 0 28px rgba(126,182,255,.45)}
  70%{box-shadow:0 0 22px rgba(126,182,255,.35)} 100%{box-shadow:0 0 0 rgba(126,182,255,0)} }

.grey-anim-draw{animation:grey-draw-pop 340ms cubic-bezier(.2,.7,.2,1) both}
.grey-anim-reveal{animation:grey-reveal 340ms ease-out both}
.grey-anim-fall{animation:grey-falloff-right 480ms ease-out both}
.grey-anim-spot{animation:grey-spotlight 620ms ease-out both}

.grey-fly-clone{position:fixed;z-index:9999;pointer-events:none;transform-origin:center}
.grey-hide-during-flight{opacity:0 !important}
    `.trim();
    document.head.appendChild(style);
  })();

  // ------- helpers -------
  const asArray = v => Array.isArray(v) ? v : v ? [v] : [];
  const isEl = n => n && n.nodeType === 1;
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  function spotlight(node, ms=620){
    if (!isEl(node)) return;
    node.classList.add('grey-anim-spot');
    setTimeout(()=>node.classList.remove('grey-anim-spot'), ms+60);
  }

  function getDeckRect(){
    const d = document.getElementById('btn-deck-hud');
    return d ? d.getBoundingClientRect() : { left: 20, top: 20, width:1, height:1 };
  }
  function getDiscardRect(){
    const d = document.getElementById('btn-discard-hud');
    return d ? d.getBoundingClientRect() : { left: 40, top: 40, width:1, height:1 };
  }

  function cloneAtRect(rect, templateNode){
    const c = (templateNode?.cloneNode ? templateNode.cloneNode(true) : document.createElement('div'));
    c.classList.add('grey-fly-clone');
    c.style.left = `${rect.left}px`;  c.style.top = `${rect.top}px`;
    c.style.width = `${rect.width}px`; c.style.height = `${rect.height}px`;
    c.style.transform = `translate(0,0) rotate(0deg)`;
    c.style.opacity = '0.95';
    document.body.appendChild(c);
    return c;
  }

  // curve-ish flight using WAAPI; hides original to avoid ghosting
  async function fly(node, srcRect, dstRect, { duration=540, curve=true, spin=true }={}){
    if (!isEl(node) || !srcRect || !dstRect) return;
    const dx = dstRect.left - srcRect.left;
    const dy = dstRect.top  - srcRect.top;
    const bend = curve ? (Math.random()*40+30)*(Math.random()<.5?-1:1) : 0;
    const rot  = spin ? (Math.random()*14-7) : 0;

    const clone = cloneAtRect(srcRect, node);
    node.classList.add('grey-hide-during-flight');
    clone.animate([
      { transform: `translate(0,0) rotate(0deg)`, opacity:.95 },
      { transform: `translate(${dx*0.6}px, ${dy*0.6 + bend}px) rotate(${rot/2}deg)`, opacity:.92 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity:.88 }
    ], { duration, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards' });

    await sleep(duration+30);
    clone.remove();
    node.classList.remove('grey-hide-during-flight');
  }

  // -------- Event bindings --------
  Grey.on('cards:drawn', ({nodes}={}) => {
    asArray(nodes).filter(isEl).forEach(n=>{
      n.classList.add('grey-anim-draw');
      n.addEventListener('animationend', ()=> n.classList.remove('grey-anim-draw'), { once:true });
    });
  });

  // New: deal from deck → target; target stays hidden until the clone lands
  Grey.on('cards:deal', async ({nodes, stagger=120}={}) => {
    const deck = getDeckRect();
    const arr = asArray(nodes).filter(isEl);
    for (let i=0;i<arr.length;i++){
      const target = arr[i];
      const tRect  = target.getBoundingClientRect();
      target.classList.add('grey-hide-during-flight');
      await fly(target, deck, tRect, { duration: 520, curve:true, spin:false });
      target.classList.remove('grey-hide-during-flight');
      // small settle pop after landing
      target.classList.add('grey-anim-draw');
      target.addEventListener('animationend', ()=> target.classList.remove('grey-anim-draw'), { once:true });
      if (i < arr.length-1) await sleep(stagger);
    }
  });

  Grey.on('cards:discard', async ({nodes}={}) => {
    const dst = getDiscardRect();
    await Promise.all(
      asArray(nodes).filter(isEl).map(n => {
        const s = n.getBoundingClientRect();
        return fly(n, s, dst, { duration: 560, curve:true, spin:true });
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
    const dst = getDiscardRect();
    node.classList.add('grey-anim-spot');
    const src = node.getBoundingClientRect();
    await fly(node, src, dst, { duration: 540, curve:true, spin:false });
    node.classList.remove('grey-anim-spot');
  });
})();
